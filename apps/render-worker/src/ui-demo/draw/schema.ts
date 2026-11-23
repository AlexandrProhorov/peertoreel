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
}

export interface DrawIcon {
  readonly kind: 'icon';
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly emoji: string;
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
});

const textSchema: z.ZodType<DrawText> = z.object({
  kind: z.literal('text'),
  id: z.string().min(1).max(32).optional(),
  x: size,
  y: size,
  w: z.number().positive(),
  h: z.number().positive().optional(),
  text: z.string().min(1).max(200),
  token: z.string().min(1).max(24).optional(),
  weight: z.number().min(100).max(900).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: tone,
  opacity: z.number().min(0).max(1).optional(),
});

const iconSchema: z.ZodType<DrawIcon> = z.object({
  kind: z.literal('icon'),
  id: z.string().min(1).max(32).optional(),
  x: size,
  y: size,
  size: z.number().min(16).max(400),
  emoji: z.string().min(1).max(8),
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

  return node;
}

import { TYPE_SCALE, type TypeToken } from '../typography.js';

/**
 * Text that wraps needs more room than the author gave it: a headline over two
 * lines lands on the caption below. Heights are estimated from the token and
 * the string, then siblings are pushed down until they clear each other.
 */
function separateText(nodes: readonly unknown[]): unknown[] {
  const placed: number[] = [];
  const result = [...nodes];

  const items = result
    .map((node) => node as Record<string, unknown> | null)
    .filter(
      (record): record is Record<string, unknown> =>
        record !== null && typeof record === 'object' && (record['kind'] ?? record['type']) === 'text',
    )
    .map((record) => {
      const token = String(record['token'] ?? 'body') as TypeToken;
      const fontSize = TYPE_SCALE[token]?.fontSize ?? 44;
      const text = String(record['text'] ?? '');
      const width = Number(record['w'] ?? 1);
      const y = Number(record['y'] ?? 0);
      const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.54)));
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));

      return { record, y, height: lines * fontSize * 1.15 };
    })
    .sort((left, right) => left.y - right.y);

  for (const item of items) {
    const above = placed.at(-1);
    let y = item.y;

    if (above !== undefined && y < above + 12) {
      y = above + 12;
      item.record['y'] = y;
    }

    placed.push(y + item.height);
  }

  return result;
}

/**
 * The model sometimes writes the same line twice, slightly offset, or drops a
 * second text over the first. Both read as a smudge: the later node is dropped
 * when it repeats a neighbour or covers more than half of it.
 */
function dedupeText(nodes: readonly unknown[]): unknown[] {
  const kept: { text: string; x: number; y: number; index: number }[] = [];
  const result: unknown[] = [];

  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) {
      result.push(node);
      continue;
    }

    const record = node as Record<string, unknown>;
    const kind = record['kind'] ?? record['type'];

    if (Array.isArray(record['children'])) {
      record['children'] = dedupeText(record['children'] as unknown[]);
    }

    if (kind !== 'text') {
      result.push(record);
      continue;
    }

    const text = String(record['text'] ?? '');
    const x = Number(record['x'] ?? 0);
    const y = Number(record['y'] ?? 0);
    const similar = kept.find(
      (other) =>
        Math.abs(other.x - x) < 32 &&
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

    kept.push({ text, x, y, index: result.length });
    result.push(record);
  }

  return result;
}

export const drawSceneNodesSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) {
    return value;
  }

  return dedupeText(
    separateText(
      (value as unknown[]).map(normalizeNode).map((node) => {
        if (typeof node !== 'object' || node === null) {
          return node;
        }

        const record = node as Record<string, unknown>;

        if (Array.isArray(record['children'])) {
          record['children'] = separateText(record['children'] as unknown[]);
        }

        return record;
      }),
    ),
  );
}, z.array(drawNodeSchema).min(1).max(40));
