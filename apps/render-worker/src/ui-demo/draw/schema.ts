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

  if (Array.isArray(node['children'])) {
    node['children'] = (node['children'] as unknown[]).map(normalizeNode);
  }

  return node;
}

export const drawSceneNodesSchema = z.preprocess(
  (value) => (Array.isArray(value) ? (value as unknown[]).map(normalizeNode) : value),
  z.array(drawNodeSchema).min(1).max(40),
);
