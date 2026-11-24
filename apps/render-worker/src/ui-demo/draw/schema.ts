import { z } from 'zod';

/**
 * A drawing language, not a catalogue of objects.
 *
 * The director knows what a receipt, a push or a price tag looks like; what it
 * never had was a way to say so. Four universal nodes cover those objects:
 * a box (rounded, rotated, shadowed), text, an icon and a line. A price tag is
 * a box with a hole, a push is a box holding an icon and two lines of text.
 *
 * Coordinates are absolute on the 1080×1920 canvas, like a spec sheet. Stacks
 * and repeats can come later; nothing here names an object.
 */

const tone = z.string().min(1).max(24).optional();
const size = z.number().finite();

/**
 * How a node arrives. The set is closed: a transition outside it, or one that
 * does not fit the node (a typewriter on a box), is dropped and the node simply
 * appears. Nothing is ever rejected for motion alone.
 */
export const DRAW_TRANSITIONS = ['appear', 'type', 'print', 'draw', 'tick', 'slide'] as const;
export type DrawTransition = (typeof DRAW_TRANSITIONS)[number];

const transition = z.enum(DRAW_TRANSITIONS).optional();
/** Scene-local seconds; the renderer fits the steps into the first half. */
const at = z.number().min(0).max(60).optional();

export type DrawNode =
  | DrawBox
  | DrawText
  | DrawIcon
  | DrawLine;

export interface DrawBox {
  readonly kind: 'box';
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
  /** Degrees, clockwise. A price tag hangs a few degrees off the axis. */
  readonly rot?: number;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly shadow?: boolean;
  readonly clip?: boolean;
  readonly children?: readonly DrawNode[];
  readonly opacity?: number;
  readonly at?: number;
  readonly transition?: DrawTransition;
}

export interface DrawText {
  readonly kind: 'text';
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h?: number;
  readonly text: string;
  readonly token?: string;
  readonly weight?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly color?: string;
  readonly opacity?: number;
  readonly at?: number;
  readonly transition?: DrawTransition;
}

export interface DrawIcon {
  readonly kind: 'icon';
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly emoji: string;
  readonly at?: number;
  readonly transition?: DrawTransition;
}

export interface DrawLine {
  readonly kind: 'line';
  readonly id?: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width?: number;
  readonly dashed?: boolean;
  readonly color?: string;
  readonly at?: number;
  readonly transition?: DrawTransition;
}

const boxSchema: z.ZodType<DrawBox> = z.object({
  kind: z.literal('box'),
  id: z.string().min(1).max(32).optional(),
  x: size,
  y: size,
  w: z.number().positive(),
  h: z.number().positive(),
  r: z.number().min(0).max(400).optional(),
  rot: z.number().min(-45).max(45).optional(),
  fill: tone,
  stroke: tone,
  strokeWidth: z.number().min(0).max(20).optional(),
  shadow: z.boolean().optional(),
  clip: z.boolean().optional(),
  children: z.array(z.lazy(() => drawNodeSchema)).max(24).optional(),
  opacity: z.number().min(0).max(1).optional(),
  at,
  transition,
});

const textSchema: z.ZodType<DrawText> = z.object({
  kind: z.literal('text'),
  id: z.string().min(1).max(32).optional(),
  x: size,
  y: size,
  w: z.number().positive(),
  h: z.number().positive().optional(),
  text: z.string().max(200),
  token: z.string().min(1).max(24).optional(),
  weight: z.number().min(100).max(900).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: tone,
  opacity: z.number().min(0).max(1).optional(),
  at,
  transition,
});

const iconSchema: z.ZodType<DrawIcon> = z.object({
  kind: z.literal('icon'),
  id: z.string().min(1).max(32).optional(),
  x: size,
  y: size,
  size: z.number().min(16).max(400),
  emoji: z.string().min(1).max(8),
  at,
  transition,
});

const lineSchema: z.ZodType<DrawLine> = z.object({
  kind: z.literal('line'),
  id: z.string().min(1).max(32).optional(),
  x1: size,
  y1: size,
  x2: size,
  y2: size,
  width: z.number().min(1).max(24).optional(),
  dashed: z.boolean().optional(),
  color: tone,
  at,
  transition,
});

export const drawNodeSchema: z.ZodType<DrawNode> = z.union([
  boxSchema,
  textSchema,
  iconSchema,
  lineSchema,
]);

const WEIGHT: Readonly<Record<string, number>> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  semiBold: 600,
  bold: 700,
  extrabold: 800,
  extraBold: 800,
};

/**
 * The model writes `type` for `kind`, a weight name instead of a number and a
 * shadow object instead of a flag. None of that is a different picture, so it
 * is repaired here instead of losing the frame.
 */
const TRANSITION_ALIASES: Readonly<Record<string, DrawTransition>> = {
  fade: 'appear',
  'fade-in': 'appear',
  fadein: 'appear',
  reveal: 'appear',
  typing: 'type',
  typewriter: 'type',
  printing: 'print',
  drawing: 'draw',
  count: 'tick',
  counting: 'tick',
  counter: 'tick',
  slideup: 'slide',
  'slide-up': 'slide',
  rise: 'slide',
};

/** A transition that cannot show on this node is dropped: the node appears. */
function transitionFits(node: Record<string, unknown>, name: string): boolean {
  switch (name) {
    case 'appear':
    case 'slide':
      return true;
    case 'type':
      return node['kind'] === 'text';
    case 'tick':
      return node['kind'] === 'text' && /\d/.test(String(node['text'] ?? ''));
    case 'print':
      return (
        node['kind'] === 'box' &&
        Array.isArray(node['children']) &&
        (node['children'] as unknown[]).length > 1
      );
    case 'draw':
      return node['kind'] === 'line';
    default:
      return false;
  }
}

function repairMotion(node: Record<string, unknown>): void {
  const raw = node['transition'];

  if (raw !== undefined) {
    const name = typeof raw === 'string' ? (TRANSITION_ALIASES[raw] ?? raw) : '';

    if (name === 'appear' || transitionFits(node, name)) {
      node['transition'] = name;
    } else {
      delete node['transition'];
    }
  }

  if (node['at'] !== undefined) {
    const at = Number(node['at']);

    if (Number.isFinite(at)) {
      node['at'] = Math.min(60, Math.max(0, at));
    } else {
      delete node['at'];
    }
  }
}

function normalizeNode(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const node: Record<string, unknown> = { ...(value as Record<string, unknown>) };

  if (node['kind'] === undefined && typeof node['type'] === 'string') {
    node['kind'] = node['type'];
  }

  delete node['type'];

  if (typeof node['weight'] === 'string') {
    node['weight'] = WEIGHT[node['weight']] ?? 400;
  }

  if (typeof node['shadow'] === 'object' && node['shadow'] !== null) {
    node['shadow'] = true;
  }

  for (const flag of ['shadow', 'clip']) {
    const value = node[flag];

    if (typeof value === 'string') {
      node[flag] = value !== 'false' && value !== '';
    }
  }

  if (Array.isArray(node['children'])) {
    node['children'] = (node['children'] as unknown[]).map(normalizeNode);
  }

  repairMotion(node);

  return node;
}

import { CONTENT_BOUNDS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import { estimateLines, fitToken, measureText } from './text-metrics.js';

/** Minimum vertical gap between two texts stacked in one column. */
const TEXT_GAP = 12;
/** Free room a divider keeps from the row above it. */
const DIVIDER_GAP = 10;
/** Tokens big enough that an exact repeat is a duplicated headline, not a row. */
const BIG_TOKENS: ReadonlySet<string> = new Set(['display', 'headline']);
/** A copy this far below the original is a repeated footer, not a second row. */
const REPEAT_DISTANCE = 400;
/** Minimum gap between two stacked neighbours that share a column. */
const STACK_GAP = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function kindOf(record: Record<string, unknown>): unknown {
  return record['kind'] ?? record['type'];
}

function textToken(record: Record<string, unknown>): TypeToken {
  const token = String(record['token'] ?? 'body');

  return token in TYPE_SCALE ? (token as TypeToken) : 'body';
}

function textHeight(record: Record<string, unknown>): number {
  const style = TYPE_SCALE[textToken(record)];
  const width = Number(record['w'] ?? 1);
  const lines = estimateLines(String(record['text'] ?? ''), width, style.fontSize);

  return lines * style.fontSize * style.lineHeight;
}

function verticalBand(record: Record<string, unknown>): { top: number; bottom: number } {
  if (kindOf(record) === 'line') {
    const y1 = Number(record['y1'] ?? 0);
    const y2 = Number(record['y2'] ?? y1);

    return { top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
  }

  const y = Number(record['y'] ?? 0);

  if (kindOf(record) === 'text') {
    return { top: y, bottom: y + textHeight(record) };
  }

  return { top: y, bottom: y + Number(record['h'] ?? record['size'] ?? 0) };
}

/**
 * A headline in a narrow column wraps and lands on the line below it. Before
 * spending vertical space, use the free room to the right: the text grows up to
 * the nearest sibling that shares its row, or the parent's edge.
 *
 * Growth keeps the visual anchor: a left-aligned line keeps its left edge, a
 * right-aligned price keeps its right edge, a centred title stays centred.
 */
function widenTexts(records: readonly Record<string, unknown>[], limitWidth: number): void {
  for (const record of records) {
    if (kindOf(record) !== 'text') {
      continue;
    }

    const text = String(record['text'] ?? '');
    const x = Number(record['x'] ?? 0);
    const width = Number(record['w'] ?? 1);
    const fontSize = TYPE_SCALE[textToken(record)].fontSize;
    const wraps = estimateLines(text, width, fontSize) > 1;
    const band = verticalBand(record);
    let right = limitWidth;

    for (const other of records) {
      if (other === record) {
        continue;
      }

      const otherX = Number(other['x'] ?? NaN);

      if (!Number.isFinite(otherX) || otherX <= x) {
        continue;
      }

      const otherBand = verticalBand(other);

      if (otherBand.bottom <= band.top || otherBand.top >= band.bottom) {
        continue;
      }

      right = Math.min(right, otherX);
    }

    const target = right - x;

    if (target < 40) {
      continue;
    }

    /* Growth is capped by the free room, not by the glyph guess: the box is
       only a measure, and a too-narrow guess cuts the line anyway. */
    if (wraps && target > width) {
      const align = String(record['align'] ?? 'left');

      if (align === 'right') {
        record['x'] = x + width - target;
      } else if (align === 'center') {
        record['x'] = x + (width - target) / 2;
      }

      record['w'] = Math.floor(target);
    } else if (!wraps && width > target && String(record['align'] ?? 'left') === 'left') {
      /* A row of a receipt: the name keeps its column, the price has its own.
         A wide name box would otherwise catch the price and move it down. */
      record['w'] = Math.floor(target);
    }
  }
}

/**
 * A receipt row is two columns: the label and the sum. The model often gives the
 * sum a wide box that starts right after the label, so «Итого» has four glyphs
 * of room and breaks into pieces. The sum moves to the right edge of its own
 * column (it is right aligned anyway) and the label takes the freed width.
 */
function fitRows(records: readonly Record<string, unknown>[], limitWidth: number): void {
  const texts = records
    .filter((record) => kindOf(record) === 'text')
    .map((record) => {
      const fontSize = TYPE_SCALE[textToken(record)].fontSize;

      return {
        record,
        x: Number(record['x'] ?? 0),
        w: Number(record['w'] ?? 1),
        y: Number(record['y'] ?? 0),
        fontSize,
        measured: measureText(String(record['text'] ?? ''), fontSize),
        ...verticalBand(record),
      };
    });

  for (const left of texts) {
    if (left.measured <= left.w) {
      continue;
    }

    for (const right of texts) {
      if (right === left || right.x <= left.x) {
        continue;
      }

      const shared = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      const shortest = Math.min(left.bottom - left.top, right.bottom - right.top);

      if (shortest <= 0 || shared < shortest * 0.5) {
        continue;
      }

      const slack = right.w - right.measured;

      if (slack <= 8) {
        continue;
      }

      const rightEdge = right.x + right.w;
      const width = Math.ceil(measureText(String(right.record['text'] ?? ''), right.fontSize, 1)) + 6;

      right.record['x'] = rightEdge - width;
      right.record['w'] = width;
      right.x = rightEdge - width;
      right.w = width;

      const target = right.x - 8 - left.x;

      if (target > left.w && left.x + target <= limitWidth) {
        left.record['w'] = Math.floor(target);
        left.w = target;
      }

      /* Still too narrow for the label: it drops one step of the type scale.
         «Итого» at 56 px reads; «Итого» broken into «Ито/го» does not. */
      downgradeToFit(left.record, left.w);
      left.fontSize = TYPE_SCALE[textToken(left.record)].fontSize;
      left.measured = measureText(String(left.record['text'] ?? ''), left.fontSize);
      break;
    }
  }
}

/** One step down the type scale until the line fits; caption is the floor. */
function downgradeToFit(record: Record<string, unknown>, width: number): void {
  const current = textToken(record);
  const fitted = fitToken(String(record['text'] ?? ''), width, current);

  if (fitted !== current) {
    record['token'] = fitted;
  }
}

/**
 * Text that wraps needs more room than the author gave it: a headline over two
 * lines lands on the caption below. Heights are estimated from the token and
 * the string, then neighbours are pushed down until they clear each other.
 *
 * Only texts that share a column are separated: a price on the right of a
 * receipt row sits on the same line and must stay there.
 */
function separateText(records: readonly Record<string, unknown>[]): void {
  const items = records
    .filter((record) => kindOf(record) === 'text')
    .map((record) => ({
      record,
      x: Number(record['x'] ?? 0),
      w: Number(record['w'] ?? 1),
      y: Number(record['y'] ?? 0),
      height: textHeight(record),
    }))
    .sort((left, right) => left.y - right.y);

  const placed: { x: number; w: number; top: number; bottom: number }[] = [];

  for (const item of items) {
    let y = item.y;
    let moved = true;

    while (moved) {
      moved = false;

      for (const other of placed) {
        if (item.x >= other.x + other.w || other.x >= item.x + item.w) {
          continue;
        }

        if (y >= other.bottom + TEXT_GAP || y + item.height <= other.top) {
          continue;
        }

        y = other.bottom + TEXT_GAP;
        moved = true;
      }
    }

    item.record['y'] = y;
    placed.push({ x: item.x, w: item.w, top: y, bottom: y + item.height });
  }
}

/**
 * The model sometimes writes the same line twice, slightly offset, drops a second
 * text over the first, or repeats the headline as a footer. All three read as a
 * smudge: the later node is dropped. Big type repeated far apart is still a
 * duplicate; a receipt row repeated far apart is not.
 */
function dedupeText(records: readonly Record<string, unknown>[]): unknown[] {
  const kept: {
    text: string;
    token: string;
    x: number;
    w: number;
    y: number;
    index: number;
  }[] = [];
  const result: unknown[] = [];

  for (const record of records) {
    if (kindOf(record) !== 'text') {
      result.push(record);
      continue;
    }

    const text = String(record['text'] ?? '');
    const token = String(record['token'] ?? 'body');
    const x = Number(record['x'] ?? 0);
    const y = Number(record['y'] ?? 0);
    const width = Number(record['w'] ?? 1);

    const sameColumn = kept.filter(
      (other) => Math.abs(other.x - x) < 32 && Math.abs(other.w - width) < 32,
    );

    /* The same sentence twice: big type repeats are dropped at any distance, a
       short cut of a longer line only when it sits far away as a footer. */
    const repeated = sameColumn.find((other) => {
      const distance = Math.abs(other.y - y);

      if (BIG_TOKENS.has(token) && other.text === text) {
        return true;
      }

      return (
        distance > REPEAT_DISTANCE && other.text.length > text.length && other.text.includes(text)
      );
    });

    if (repeated !== undefined) {
      continue;
    }

    const similar = sameColumn.find(
      (other) =>
        Math.abs(other.y - y) < 120 &&
        (other.text === text || other.text.startsWith(text) || text.startsWith(other.text)),
    );

    if (similar !== undefined) {
      /* The longer copy wins: the model wrote the full line, then a cut one. */
      if (text.length > similar.text.length) {
        result[similar.index] = record;
        similar.text = text;
      }

      continue;
    }

    const sameSpot = kept.find((other) => Math.abs(other.x - x) < 8 && Math.abs(other.y - y) < 8);

    if (sameSpot !== undefined) {
      continue;
    }

    kept.push({ text, token, x, w: width, y, index: result.length });
    result.push(record);
  }

  return result;
}

/**
 * Salvage runs top-down and inside-out: children are repaired first, because a
 * parent's width is what limits its children. Every level gets the same passes,
 * so a flight card's rows are separated like a receipt's.
 */
function nodeHeight(record: Record<string, unknown>): number {
  switch (kindOf(record)) {
    case 'text':
      return textHeight(record);
    case 'icon':
      return Number(record['size'] ?? 0);
    case 'line':
      return 0;
    default:
      return Number(record['h'] ?? 0);
  }
}

/** A box that hugs its content less than this is left alone (breathing room). */
const SHRINK_MARGIN = 40;

/**
 * A box too short for its children clips their text: it grows to the content.
 * A box far taller than its content is a hollow surface: it shrinks back to the
 * rows it actually holds, keeping the top padding the author used.
 */
function fitContainers(records: readonly Record<string, unknown>[]): void {
  for (const record of records) {
    if (kindOf(record) !== 'box' || !Array.isArray(record['children'])) {
      continue;
    }

    const children = record['children'] as Record<string, unknown>[];

    if (children.length === 0) {
      continue;
    }

    let contentBottom = 0;
    let topPad = Number.POSITIVE_INFINITY;

    for (const child of children) {
      const top = Number(child['y'] ?? child['y1'] ?? 0);
      contentBottom = Math.max(contentBottom, top + nodeHeight(child));
      topPad = Math.min(topPad, top);
    }

    if (!Number.isFinite(topPad) || contentBottom <= 0) {
      continue;
    }

    const target = Math.ceil(contentBottom + Math.max(0, topPad));
    const height = Number(record['h'] ?? 0);

    if (target > height) {
      record['h'] = target;
    } else if (height - target > SHRINK_MARGIN) {
      record['h'] = target;
    }
  }
}

/**
 * A dashed divider written straight after the last row ends up under its
 * descenders. The divider moves down to keep a readable gap; its endpoints move
 * with it.
 */
function spaceDividers(records: readonly Record<string, unknown>[]): void {
  const texts = records
    .filter((record) => kindOf(record) === 'text')
    .map((record) => ({ record, ...verticalBand(record), x: Number(record['x'] ?? 0), w: Number(record['w'] ?? 1) }));

  for (const record of records) {
    if (kindOf(record) !== 'line') {
      continue;
    }

    const y = Number(record['y1'] ?? 0);
    const span = {
      x: Math.min(Number(record['x1'] ?? 0), Number(record['x2'] ?? 0)),
      w: Math.abs(Number(record['x2'] ?? 0) - Number(record['x1'] ?? 0)),
    };

    let bottom = 0;

    for (const text of texts) {
      if (text.x >= span.x + span.w || span.x >= text.x + text.w) {
        continue;
      }

      /* A divider inside the text band cuts the glyphs: it moves below the row.
         A divider that merely touches the row keeps a readable gap. */
      if (text.top < y && y < text.bottom) {
        bottom = Math.max(bottom, text.bottom);
      } else if (y >= text.bottom && y - text.bottom < DIVIDER_GAP) {
        bottom = Math.max(bottom, text.bottom);
      }
    }

    if (bottom === 0) {
      continue;
    }

    const shift = bottom + DIVIDER_GAP - y;

    if (shift > 0) {
      record['y1'] = y + shift;
      record['y2'] = Number(record['y2'] ?? y) + shift;
    }
  }
}

/**
 * A receipt row is two columns on one line: the item and its price. The model
 * writes them a few pixels apart, and the row reads as a stair. Same-token
 * neighbours on the same line share the higher edge.
 */
function alignRows(records: readonly Record<string, unknown>[]): void {
  const texts = records
    .filter((record) => kindOf(record) === 'text')
    .map((record) => ({
      record,
      token: String(record['token'] ?? 'body'),
      x: Number(record['x'] ?? 0),
      w: Number(record['w'] ?? 1),
      y: Number(record['y'] ?? 0),
      ...verticalBand(record),
    }));

  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) {
      const a = texts[left];
      const b = texts[right];

      if (a === undefined || b === undefined || a.token !== b.token || a.y === b.y) {
        continue;
      }

      const shared = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const shortest = Math.min(a.bottom - a.top, b.bottom - b.top);
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x;

      if (!apart || shortest <= 0 || shared < shortest * 0.5) {
        continue;
      }

      const top = Math.min(a.y, b.y);
      a.record['y'] = top;
      b.record['y'] = top;
      a.y = top;
      b.y = top;
      a.top = top;
      b.top = top;
    }
  }
}

/**
 * The thesis sits at the very bottom of the frame, under the platform caption
 * rail. Only the top-level nodes are clamped: children are relative to a parent.
 */
function clampToSafeArea(records: readonly Record<string, unknown>[]): void {
  for (const record of records) {
    const height = nodeHeight(record);

    if (height <= 0) {
      continue;
    }

    const y = Number(record['y'] ?? 0);

    if (y + height > CRITICAL_SAFE_BOUNDS.bottom) {
      record['y'] = Math.max(CRITICAL_SAFE_BOUNDS.top, CRITICAL_SAFE_BOUNDS.bottom - height);
    }
  }
}

/**
 * Two neighbours in the same column may not share a row: the later one moves
 * down until it clears the earlier one. Boxes move as a whole, so their children
 * follow; an icon beside a text keeps its place because their columns differ.
 */
function stackSiblings(records: readonly Record<string, unknown>[]): void {
  const items = records
    .map((record) => ({
      record,
      x: Number(record['x'] ?? record['x1'] ?? 0),
      w:
        kindOf(record) === 'line'
          ? Math.abs(Number(record['x2'] ?? 0) - Number(record['x1'] ?? 0))
          : Number(record['w'] ?? record['size'] ?? 0),
      y: Number(record['y'] ?? record['y1'] ?? 0),
      height: nodeHeight(record),
    }))
    .filter((item) => item.height > 0)
    .sort((left, right) => left.y - right.y);

  const placed: { x: number; w: number; bottom: number }[] = [];

  for (const item of items) {
    let y = item.y;
    let moved = true;

    while (moved) {
      moved = false;

      for (const other of placed) {
        if (item.x >= other.x + other.w || other.x >= item.x + item.w) {
          continue;
        }

        if (y >= other.bottom + STACK_GAP) {
          continue;
        }

        y = other.bottom + STACK_GAP;
        moved = true;
      }
    }

    if (y !== item.y) {
      const shift = y - item.y;

      if (kindOf(item.record) === 'line') {
        item.record['y1'] = Number(item.record['y1'] ?? 0) + shift;
        item.record['y2'] = Number(item.record['y2'] ?? 0) + shift;
      } else {
        item.record['y'] = y;
      }
    }

    placed.push({ x: item.x, w: item.w, bottom: y + item.height });
  }
}

function repairList(nodes: readonly unknown[], limitWidth: number): unknown[] {
  const records: Record<string, unknown>[] = [];

  for (const value of nodes) {
    if (!isRecord(value)) {
      continue;
    }

    const record = value;

    if (Array.isArray(record['children'])) {
      const ownWidth = Number(record['w']);
      const innerWidth = Number.isFinite(ownWidth) ? ownWidth : limitWidth;

      record['children'] = repairList(record['children'] as unknown[], innerWidth);
    }

    records.push(record);
  }

  fitContainers(records);
  widenTexts(records, limitWidth);
  fitRows(records, limitWidth);
  separateText(records);
  stackSiblings(records);
  alignRows(records);
  spaceDividers(records);

  return dedupeText(records);
}

export const drawNodesSchema = z.array(drawNodeSchema).min(1).max(40);

/** Repairs a raw answer without re-composing it: used by painted regions. */
export function normalizeDrawNodes(value: unknown): unknown {
  return Array.isArray(value) ? value.map(normalizeNode) : value;
}

export const drawSceneNodesSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) {
    return value;
  }

  const repaired = repairList((value as unknown[]).map(normalizeNode), CONTENT_BOUNDS.right);

  clampToSafeArea(repaired.filter(isRecord));
  spaceDividers(repaired.filter(isRecord));

  return repaired;
}, drawNodesSchema);
