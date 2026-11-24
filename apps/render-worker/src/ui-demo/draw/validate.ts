import type { DrawBox, DrawIcon, DrawLine, DrawNode, DrawText } from './schema.js';
import { estimateLines, fitToken, measureText } from './text-metrics.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';

/**
 * The validator.
 *
 * The model owns the composition: what is in the frame and where it stands.
 * This module owns the objects: a text box grows to its measured string, a
 * container hugs its children, a small collision is nudged apart. Anything that
 * would require redesigning the frame is **rejected** with a reason, so the
 * caller can ask for another drawing instead of silently repainting the idea.
 */

export const FRAME_BUDGET = {
  /** Top-level nodes: a picture, not a form. */
  nodes: 5,
  /** Words on screen: 12 words read in about three seconds. */
  words: 12,
} as const;

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

function tokenOf(node: MutText): TypeToken {
  const token = node.token;

  return token !== undefined && token in TYPE_SCALE ? (token as TypeToken) : 'body';
}

function textHeight(node: MutText): number {
  const style = TYPE_SCALE[tokenOf(node)];
  const lines = estimateLines(node.text, node.w, style.fontSize);

  return lines * style.fontSize * style.lineHeight;
}

interface Rect {
  readonly node: MutText;
  readonly x: number;
  y: number;
  readonly w: number;
  readonly h: number;
}

function childrenOf(node: MutNode): readonly MutNode[] | undefined {
  return node.kind === 'box' ? node.children : undefined;
}

/** Grows a text box to its measured line, or drops the token a step. */
function fitText(node: MutText, parentWidth: number, fixes: string[]): string | null {
  const size = TYPE_SCALE[tokenOf(node)].fontSize;
  const measured = measureText(node.text, size);

  if (measured <= node.w) {
    return null;
  }

  const room = Math.max(node.w, Math.min(measured, parentWidth - node.x));

  if (room > node.w) {
    node.w = Math.ceil(room);
    fixes.push(`text-widened:${node.text.slice(0, 24)}`);

    return null;
  }

  const fitted = fitToken(node.text, node.w, tokenOf(node));

  if (fitted !== tokenOf(node)) {
    node.token = fitted;
    fixes.push(`text-token:${node.text.slice(0, 24)}:${fitted}`);

    return null;
  }

  return 'text-overflow';
}

/**
 * Walks the tree and returns absolute text boxes. Nested nodes are measured in
 * their parent's space, then moved into the frame for collision checks.
 */
function collectTexts(
  nodes: readonly MutNode[],
  parentWidth: number,
  offsetX: number,
  offsetY: number,
  fixes: string[],
  issues: ValidationIssue[],
): Rect[] {
  const rects: Rect[] = [];

  for (const node of nodes) {
    if (node.kind === 'text') {
      const overflow = fitText(node, parentWidth, fixes);

      if (overflow !== null) {
        issues.push({
          code: 'text-overflow',
          path: `/${node.text.slice(0, 24)}`,
          message: `«${node.text.slice(0, 24)}» не влезает даже минимальным кеглем`,
        });
      }

      rects.push({
        node,
        x: node.x + offsetX,
        y: node.y + offsetY,
        w: node.w,
        h: textHeight(node),
      });
      continue;
    }

    const children = childrenOf(node);

    if (children !== undefined && node.kind === 'box') {
      rects.push(
        ...collectTexts(children, node.w, offsetX + node.x, offsetY + node.y, fixes, issues),
      );
    }
  }

  return rects;
}

/** Boxes intersect on both axes. */
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

    const children = childrenOf(node);

    if (children !== undefined) {
      words += countWords(children);
    }
  }

  return words;
}

/** Clamps top-level nodes into the safe area; a large move is a rejection. */
function clampFrame(nodes: readonly MutNode[], bounds: Bounds, issues: ValidationIssue[]): void {
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

    const shiftX =
      node.x < bounds.left
        ? bounds.left - node.x
        : node.x > bounds.right
          ? bounds.right - node.x
          : 0;
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
 * Checks a drawn frame against the budget and the object rules.
 * Returns the corrected tree, the fixes applied and the reasons to redraw.
 */
export function validateDrawNodes(input: readonly DrawNode[], bounds: Bounds): ValidationResult {
  const nodes = structuredClone(input) as unknown as MutNode[];
  const fixes: string[] = [];
  const issues: ValidationIssue[] = [];

  if (nodes.length > FRAME_BUDGET.nodes) {
    issues.push({
      code: 'too-many-nodes',
      path: '/',
      message: `${String(nodes.length)} верхнеуровневых узлов при бюджете ${String(FRAME_BUDGET.nodes)}`,
    });
  }

  const words = countWords(nodes);

  if (words > FRAME_BUDGET.words) {
    issues.push({
      code: 'too-many-words',
      path: '/',
      message: `${String(words)} слов на кадре при бюджете ${String(FRAME_BUDGET.words)}`,
    });
  }

  const rects = collectTexts(nodes, bounds.right - bounds.left, 0, 0, fixes, issues);

  separate(rects, issues);
  clampFrame(nodes, bounds, issues);

  return {
    nodes: nodes as unknown as DrawNode[],
    issues,
    fixes,
    rejected: issues.length > 0,
    words,
  };
}
