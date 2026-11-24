import type { DrawBox, DrawIcon, DrawLine, DrawNode, DrawText } from './schema.js';
import { estimateLines, fitToken, measureText } from './text-metrics.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';

/**
 * The validator.
 *
 * The model owns the composition: what is in the frame and where it stands.
 * This module owns the objects: a text keeps its measured line, the container
 * around it grows to hold it, a small collision is nudged apart. Anything that
 * would require redesigning the frame is **rejected** with a reason, so the
 * caller can ask for another drawing instead of silently repainting the idea.
 */

export interface FrameBudget {
  readonly nodes: number;
  readonly words: number;
}

/** No caps by default: the frame may hold as many elements as the scene needs. */
const UNCAPPED: FrameBudget = { nodes: Number.POSITIVE_INFINITY, words: Number.POSITIVE_INFINITY };

/** Kept for the experiment that measured how a form looks. Not a default. */
export const FRAME_BUDGET: FrameBudget = { nodes: 5, words: 12 };

/** A collision this small is a nudge; anything bigger is a wrong composition. */
export const NUDGE_PX = 24;

export interface ValidationIssue {
  readonly code:
    | 'too-many-nodes'
    | 'too-many-words'
    | 'text-overflow'
    | 'text-collision'
    | 'off-frame';
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly nodes: DrawNode[];
  readonly issues: ValidationIssue[];
  readonly fixes: string[];
  readonly rejected: boolean;
  readonly words: number;
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutText = Mutable<DrawText>;
type MutBox = Mutable<DrawBox>;
type MutIcon = Mutable<DrawIcon>;
type MutLine = Mutable<DrawLine>;
type MutNode = MutText | MutBox | MutIcon | MutLine;
type MutPlaced = MutText | MutBox | MutIcon;

function tokenOf(node: MutText): TypeToken {
  const token = node.token;

  return token !== undefined && token in TYPE_SCALE ? (token as TypeToken) : 'body';
}

function textHeight(node: MutText): number {
  const style = TYPE_SCALE[tokenOf(node)];
  const lines = estimateLines(node.text, node.w, style.fontSize);

  return lines * style.fontSize * style.lineHeight;
}

function sizeOf(node: MutPlaced): { w: number; h: number } {
  if (node.kind === 'icon') {
    return { w: node.size, h: node.size };
  }

  return { w: node.w, h: node.kind === 'text' ? textHeight(node) : node.h };
}

function boxChildren(node: MutNode): MutPlaced[] | null {
  if (node.kind !== 'box' || node.children === undefined) {
    return null;
  }

  const children = node.children as unknown as MutNode[];

  return children.some((child) => child.kind === 'line') ? null : (children as MutPlaced[]);
}

/**
 * Some answers place a box's children in frame coordinates instead of the
 * parent's. When the children fit only as absolute, the parent origin is
 * subtracted — the picture stays the same, the space is corrected.
 */
function normalizeChildSpace(nodes: readonly MutNode[]): void {
  for (const node of nodes) {
    if (node.kind !== 'box' || node.children === undefined) {
      continue;
    }

    const children = boxChildren(node);

    if (children === null) {
      continue;
    }

    normalizeChildSpace(children);

    const fitsRelative = children.every((child) => {
      const size = sizeOf(child);

      return (
        child.x >= 0 && child.y >= 0 && child.x + size.w <= node.w + 1 && child.y + size.h <= node.h + 1
      );
    });

    if (fitsRelative) {
      continue;
    }

    if (!children.every((child) => child.x >= node.x - 1 && child.y >= node.y - 1)) {
      continue;
    }

    for (const child of children) {
      child.x -= node.x;
      child.y -= node.y;
    }
  }
}

/** Theme tones a frame may use. Hex colours are not part of the language. */
const THEME_TONES = new Set([
  'background',
  'surface',
  'ink',
  'muted',
  'accent',
  'transparent',
]);

function isThemeTone(value: string): boolean {
  return THEME_TONES.has(value);
}

/** A text keeps the author's width and wraps; only an unbreakable word drops a token. */
function fitTextWidths(
  nodes: readonly MutNode[],
  parentWidth: number,
  fixes: string[],
  issues: ValidationIssue[],
): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      const room = parentWidth - node.x;

      if (room > 40 && node.w > room) {
        node.w = Math.floor(room);
        fixes.push(`text-clamped:${node.text.slice(0, 24)}`);
      }

      const longest = node.text
        .split(/\s+/u)
        .reduce((worst, word) => (measureText(word, TYPE_SCALE[tokenOf(node)].fontSize) > measureText(worst, TYPE_SCALE[tokenOf(node)].fontSize) ? word : worst), '');

      if (longest !== '' && measureText(longest, TYPE_SCALE[tokenOf(node)].fontSize) > node.w) {
        const fitted = fitToken(longest, node.w, tokenOf(node));

        if (fitted !== tokenOf(node)) {
          node.token = fitted;
          fixes.push(`text-token:${longest.slice(0, 12)}:${fitted}`);
        } else {
          issues.push({
            code: 'text-overflow',
            path: `/${node.text.slice(0, 24)}`,
            message: `слово «${longest.slice(0, 16)}» не влезает даже минимальным кеглем`,
          });
        }
      }

      continue;
    }

    if (node.kind !== 'box' || node.children === undefined) {
      continue;
    }

    const children = boxChildren(node);

    if (children !== null) {
      fitTextWidths(children, node.w, fixes, issues);
    }
  }
}

/** An icon inside a circle shrinks to fit the circle with a 16 px margin. */
function fitIconsInCircles(nodes: readonly MutNode[], fixes: string[]): void {
  for (const node of nodes) {
    if (node.kind !== 'box') {
      continue;
    }

    const children = boxChildren(node);

    if (children === null) {
      continue;
    }

    const circle = node.r !== undefined && node.r >= Math.min(node.w, node.h) / 2 - 1;

    for (const child of children) {
      if (circle && child.kind === 'icon') {
        const limit = Math.min(node.w, node.h) - 16;

        if (child.size > limit) {
          child.size = Math.floor(limit);
          fixes.push('icon-in-circle');
        }
      }
    }

    fitIconsInCircles(children, fixes);
  }
}

/** Colours are theme tones; a hex or an unknown name falls back to the tone. */
function enforcePalette(nodes: readonly MutNode[], fixes: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (node.color !== undefined && !isThemeTone(node.color)) {
        node.color = 'ink';
        fixes.push('palette:text');
      }

      if (node.token !== undefined && !(node.token in TYPE_SCALE)) {
        node.token = 'body';
        fixes.push('token:body');
      }
    }

    if (node.kind === 'box') {
      if (node.fill !== undefined && !isThemeTone(node.fill)) {
        node.fill = 'surface';
        fixes.push('palette:fill');
      }

      if (node.stroke !== undefined && !isThemeTone(node.stroke)) {
        node.stroke = 'muted';
        fixes.push('palette:stroke');
      }
    }

    if (node.kind === 'line' && node.color !== undefined && !isThemeTone(node.color)) {
      node.color = 'muted';
      fixes.push('palette:line');
    }

    const children = node.kind === 'box' ? boxChildren(node) : null;

    if (children !== null) {
      enforcePalette(children, fixes);
    }
  }
}

/** An avatar that collides with a surface is painted after it, not under it. */
function raiseAvatars(icons: MutIcon[], nodes: MutNode[], fixes: string[]): void {
  for (const icon of icons) {
    const index = nodes.indexOf(icon);
    const surface = nodes.find(
      (node, other) =>
        node.kind === 'box' &&
        other > index &&
        icon.x < node.x + node.w &&
        node.x < icon.x + icon.size &&
        icon.y < node.y + node.h &&
        node.y < icon.y + icon.size,
    );

    if (surface === undefined) {
      continue;
    }

    nodes.splice(index, 1);
    nodes.push(icon);
    fixes.push('z-order:avatar');
  }
}

/** A frame gathered in one corner is not a composition: ask for another one. */
function checkFilled(nodes: readonly MutNode[], bounds: Bounds, issues: ValidationIssue[]): void {
  if (nodes.length < 2) {
    return;
  }

  const placed = (nodes.filter((node) => node.kind !== 'line') as unknown as MutPlaced[]).filter(
    (node) => !(node.kind === 'box' && node.w >= bounds.right - bounds.left),
  );

  if (placed.length < 2) {
    return;
  }

  let left = Number.POSITIVE_INFINITY;
  let right = 0;
  let top = Number.POSITIVE_INFINITY;
  let bottom = 0;

  for (const node of placed) {
    const size = sizeOf(node as MutPlaced);

    left = Math.min(left, node.x);
    right = Math.max(right, node.x + size.w);
    top = Math.min(top, node.y);
    bottom = Math.max(bottom, node.y + size.h);
  }

  const frameHeight = bounds.bottom - bounds.top;
  const frameWidth = bounds.right - bounds.left;

  /* A sparse frame is legal (one bubble in the middle); a pile of many nodes in
     a corner is not — that is a canvas scale mistake, not a composition. */
  if (
    placed.length >= 4 &&
    right - left < frameWidth * 0.4 &&
    bottom - top < frameHeight * 0.35
  ) {
    issues.push({
      code: 'off-frame',
      path: '/',
      message: `кадр собран в ${String(Math.round(right - left))}×${String(Math.round(bottom - top))} вместо ${String(Math.round(frameWidth))}×${String(Math.round(frameHeight))} — разложи сцену на весь кадр`,
    });
  }
}

/** A container hugs the text inside it: a bubble grows, it never clips. */
function growContainers(nodes: readonly MutNode[], fixes: string[]): void {
  for (const node of nodes) {
    if (node.kind !== 'box' || node.children === undefined) {
      continue;
    }

    const children = boxChildren(node);

    if (children === null || children.length === 0) {
      continue;
    }

    growContainers(children, fixes);

    let right = 0;
    let bottom = 0;
    let leftPad = Number.POSITIVE_INFINITY;
    let topPad = Number.POSITIVE_INFINITY;

    for (const child of children) {
      const size = sizeOf(child);

      right = Math.max(right, child.x + size.w);
      bottom = Math.max(bottom, child.y + size.h);
      leftPad = Math.min(leftPad, child.x);
      topPad = Math.min(topPad, child.y);
    }

    if (!Number.isFinite(leftPad) || !Number.isFinite(topPad)) {
      continue;
    }

    if (right + leftPad > node.w + 0.5) {
      node.w = Math.ceil(right + leftPad);
      fixes.push(`container-widened:${node.kind}`);
    }

    if (bottom + topPad > node.h + 0.5) {
      node.h = Math.ceil(bottom + topPad);
      fixes.push(`container-grown:${node.kind}`);
    }
  }
}

interface Rect {
  readonly node: MutText;
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
}

function collectRects(
  nodes: readonly MutNode[],
  offsetX: number,
  offsetY: number,
  rects: Rect[] = [],
): Rect[] {
  for (const node of nodes) {
    if (node.kind === 'text') {
      rects.push({
        node,
        x: node.x + offsetX,
        y: node.y + offsetY,
        w: node.w,
        h: textHeight(node),
      });
      continue;
    }

    if (node.kind !== 'box' || node.children === undefined) {
      continue;
    }

    const children = boxChildren(node);

    if (children !== null) {
      collectRects(children, offsetX + node.x, offsetY + node.y, rects);
    }
  }

  return rects;
}

function collide(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Texts may not sit on each other. A small overlap is a nudge down; a big one
 * means the composition itself is wrong and the frame goes back to the model.
 */
function separate(rects: readonly Rect[], issues: ValidationIssue[]): void {
  const sorted = [...rects].sort((left, right) => left.y - right.y);

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];

    if (current === undefined) {
      continue;
    }

    for (let other = index + 1; other < sorted.length; other += 1) {
      const next = sorted[other];

      if (next === undefined || !collide(current, next)) {
        continue;
      }

      const shift = Math.ceil(current.y + current.h + 8 - next.y);

      if (shift <= 0) {
        continue;
      }

      if (shift > NUDGE_PX) {
        issues.push({
          code: 'text-collision',
          path: `/${next.node.text.slice(0, 24)}`,
          message: `«${next.node.text.slice(0, 24)}» наезжает на «${current.node.text.slice(0, 24)}» на ${String(shift)} px — нужна другая композиция`,
        });
        continue;
      }

      next.node.y = Math.round(next.y + shift);
      next.y = next.node.y;
    }
  }
}

function countWords(nodes: readonly MutNode[]): number {
  let words = 0;

  for (const node of nodes) {
    if (node.kind === 'text') {
      words += node.text.trim().split(/\s+/u).filter(Boolean).length;
    }

    const children = boxChildren(node);

    if (children !== undefined && children !== null) {
      words += countWords(children);
    }
  }

  return words;
}

/** Clamps top-level nodes into the safe area; a large move is a rejection. */
function clampFrame(nodes: readonly MutNode[], bounds: Bounds, issues: ValidationIssue[]): void {
  const frameWidth = bounds.right - bounds.left;

  for (const node of nodes) {
    if (node.kind === 'line') {
      const x = Math.min(node.x1, node.x2);
      const y = Math.min(node.y1, node.y2);
      const shiftX = x < bounds.left ? bounds.left - x : 0;
      const shiftY = y < bounds.top ? bounds.top - y : 0;

      node.x1 += shiftX;
      node.x2 += shiftX;
      node.y1 += shiftY;
      node.y2 += shiftY;
      continue;
    }

    /* A full-frame background is not out of the safe area, it is behind it. */
    if (
      node.kind === 'box' &&
      node.x <= bounds.left &&
      node.y <= bounds.top &&
      node.x + node.w >= bounds.right &&
      node.y + node.h >= bounds.bottom &&
      node.w >= frameWidth
    ) {
      continue;
    }

    const shiftX =
      node.x < bounds.left ? bounds.left - node.x : node.x > bounds.right ? bounds.right - node.x : 0;
    const shiftY =
      node.y < bounds.top ? bounds.top - node.y : node.y > bounds.bottom ? bounds.bottom - node.y : 0;

    if (shiftX === 0 && shiftY === 0) {
      continue;
    }

    node.x += shiftX;
    node.y += shiftY;

    if (Math.abs(shiftX) + Math.abs(shiftY) > NUDGE_PX * 2) {
      issues.push({
        code: 'off-frame',
        path: `/${node.kind}`,
        message: 'узел выехал за кадр — нужна другая композиция',
      });
    }
  }
}

/**
 * Checks a drawn frame: objects are corrected, the composition is not.
 * Returns the corrected tree, the fixes applied and the reasons to redraw.
 */
export function validateDrawNodes(
  input: readonly DrawNode[],
  bounds: Bounds,
  budget: FrameBudget = UNCAPPED,
): ValidationResult {
  const nodes = structuredClone(input) as unknown as MutNode[];
  const fixes: string[] = [];
  const issues: ValidationIssue[] = [];

  normalizeChildSpace(nodes);

  if (nodes.length > budget.nodes) {
    issues.push({
      code: 'too-many-nodes',
      path: '/',
      message: `${String(nodes.length)} верхнеуровневых узлов при бюджете ${String(budget.nodes)}`,
    });
  }

  const words = countWords(nodes);

  if (words > budget.words) {
    issues.push({
      code: 'too-many-words',
      path: '/',
      message: `${String(words)} слов на кадре при бюджете ${String(budget.words)}`,
    });
  }

  fitTextWidths(nodes, bounds.right - bounds.left, fixes, issues);
  fitIconsInCircles(nodes, fixes);
  growContainers(nodes, fixes);
  enforcePalette(nodes, fixes);
  raiseAvatars(
    nodes.filter((node): node is MutIcon => node.kind === 'icon'),
    nodes,
    fixes,
  );
  separate(collectRects(nodes, 0, 0), issues);
  clampFrame(nodes, bounds, issues);
  checkFilled(nodes, bounds, issues);

  return {
    nodes: nodes as unknown as DrawNode[],
    issues,
    fixes,
    rejected: issues.length > 0,
    words,
  };
}
