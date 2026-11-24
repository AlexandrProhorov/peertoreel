import { z } from 'zod';
import type { DrawTransition } from './schema.js';

/**
 * The layout plan: what the frame is made of, not where it stands.
 *
 * The model decides the structure — composition, blocks, order, density,
 * emphasis and arrival. Coordinates are never in this document: `layout.ts`
 * turns it into nodes deterministically, so the same plan always gives the same
 * frame and different plans give different frames.
 *
 * Roles are semantic (`header`, `rows`, `figure`), never objects: a receipt, a
 * chat and a flight board are different sequences of the same roles.
 */

export const PLAN_DENSITY = ['tight', 'normal', 'airy'] as const;
export const PLAN_ALIGN = ['left', 'center'] as const;
export const ROWS_STYLE = ['columns', 'inline'] as const;
export const TOTAL_STYLE = ['row', 'stacked'] as const;
export const PLAN_TOKENS = ['display', 'headline', 'card', 'body', 'caption'] as const;
export const PLAN_TRANSITIONS = ['appear', 'slide', 'type', 'print', 'tick'] as const;
export const FIGURE_SHAPES = ['circle', 'bar', 'layers'] as const;
export const ICON_SIZES = ['small', 'large'] as const;
export const PLAN_SURFACES = ['card', 'none'] as const;

const motion = z
  .object({
    at: z.number().min(0).max(60).default(0),
    transition: z.enum(PLAN_TRANSITIONS),
  })
  .optional();

const token = z.enum(PLAN_TOKENS).optional();
const align = z.enum(PLAN_ALIGN).optional();

const headerBlock = z.object({
  role: z.literal('header'),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(120).optional(),
  icon: z.string().min(1).max(8).optional(),
  align,
  token,
  motion,
});

const iconsBlock = z.object({
  role: z.literal('icons'),
  items: z.array(z.string().min(1).max(8)).min(1).max(4),
  size: z.enum(ICON_SIZES).default('large'),
  align,
  motion,
});

const figureBlock = z.object({
  role: z.literal('figure'),
  shape: z.enum(FIGURE_SHAPES),
  /** Bar fill 0..1; ignored by the other shapes. */
  value: z.number().min(0).max(1).optional(),
  align,
  motion,
});

const rowsBlock = z.object({
  role: z.literal('rows'),
  items: z
    .array(
      z.object({
        left: z.string().min(1).max(120),
        right: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(16),
  style: z.enum(ROWS_STYLE).default('columns'),
  token,
  motion,
});

const dividerBlock = z.object({
  role: z.literal('divider'),
  dashed: z.boolean().default(true),
  motion,
});

const totalBlock = z.object({
  role: z.literal('total'),
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(40),
  style: z.enum(TOTAL_STYLE).default('row'),
  token,
  motion,
});

const badgeBlock = z.object({
  role: z.literal('badge'),
  text: z.string().min(1).max(24),
  tone: z.enum(['accent', 'muted']).default('accent'),
  align,
  motion,
});

/**
 * A region the layout does not compose: the plan says what it should express,
 * and a dedicated paint call draws inside the reserved band.
 */
const freeformBlock = z.object({
  role: z.literal('freeform'),
  intent: z.string().min(1).max(200),
  /** Share of the safe frame height reserved for the painted picture. */
  height: z.number().min(0.2).max(0.6).default(0.4),
});

const footerBlock = z.object({
  role: z.literal('footer'),
  text: z.string().min(1).max(120),
  motion,
});

const counterBlock = z.object({
  role: z.literal('counter'),
  value: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  align,
  token,
  motion,
});

export const drawPlanBlockSchema = z.discriminatedUnion('role', [
  headerBlock,
  iconsBlock,
  figureBlock,
  rowsBlock,
  dividerBlock,
  totalBlock,
  badgeBlock,
  footerBlock,
  counterBlock,
  freeformBlock,
]);

const panelSchema = z.object({
  surface: z.enum(PLAN_SURFACES).default('card'),
  blocks: z.array(drawPlanBlockSchema).min(1).max(8),
});

const stackPlan = z.object({
  composition: z.literal('stack'),
  surface: z.enum(PLAN_SURFACES).default('card'),
  density: z.enum(PLAN_DENSITY).default('normal'),
  align: z.enum(PLAN_ALIGN).default('left'),
  blocks: z.array(drawPlanBlockSchema).min(1).max(10),
});

const panelsPlan = z.object({
  composition: z.literal('panels'),
  density: z.enum(PLAN_DENSITY).default('normal'),
  align: z.enum(PLAN_ALIGN).default('left'),
  panels: z.array(panelSchema).min(2).max(3),
});

const ROLES = new Set<string>([
  'header',
  'icons',
  'figure',
  'rows',
  'divider',
  'total',
  'badge',
  'footer',
  'counter',
]);

/**
 * The model writes `type` for `role` and sometimes a colour name in `token`
 * (the habit comes from the node language). Neither is a different frame, so it
 * is repaired instead of losing the plan.
 */
function normalizeBlock(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const block: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  const legacy = block['type'];

  if (block['role'] === undefined && typeof legacy === 'string' && ROLES.has(legacy)) {
    block['role'] = legacy;
  }

  delete block['type'];

  if (typeof block['token'] === 'string' && !(PLAN_TOKENS as readonly string[]).includes(block['token'])) {
    delete block['token'];
  }

  if (typeof block['align'] === 'string' && !(PLAN_ALIGN as readonly string[]).includes(block['align'])) {
    delete block['align'];
  }

  const motionValue = block['motion'];

  if (motionValue !== undefined) {
    if (typeof motionValue !== 'object' || motionValue === null) {
      delete block['motion'];
    } else {
      const transitionValue = (motionValue as Record<string, unknown>)['transition'];

      if (
        typeof transitionValue !== 'string' ||
        !(PLAN_TRANSITIONS as readonly string[]).includes(transitionValue)
      ) {
        delete block['motion'];
      }
    }
  }

  return block;
}

function normalizePlan(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const plan: Record<string, unknown> = { ...source };

  if (!('composition' in plan) && Array.isArray(plan['blocks'])) {
    plan['composition'] = 'stack';
  }

  if (Array.isArray(plan['blocks'])) {
    plan['blocks'] = plan['blocks'].map(normalizeBlock);
  }

  if (Array.isArray(plan['panels'])) {
    plan['panels'] = (plan['panels'] as unknown[]).map((panel) => {
      if (typeof panel !== 'object' || panel === null) {
        return panel;
      }

      const record = panel as Record<string, unknown>;

      return Array.isArray(record['blocks'])
        ? { ...record, blocks: (record['blocks'] as unknown[]).map(normalizeBlock) }
        : panel;
    });
  }

  return plan;
}

export const drawPlanSchema = z.preprocess(
  normalizePlan,
  z.discriminatedUnion('composition', [stackPlan, panelsPlan]),
);

export type DrawPlanBlock = z.infer<typeof drawPlanBlockSchema>;
export type DrawPlan = z.infer<typeof drawPlanSchema>;
export type DrawPlanPanel = z.infer<typeof panelSchema>;

/** Default arrival per role: the plan may override it. */
export const ROLE_MOTION: Readonly<
  Record<DrawPlanBlock['role'], { transition: DrawTransition; at: number }>
> = {
  header: { transition: 'appear', at: 0 },
  icons: { transition: 'appear', at: 0.2 },
  figure: { transition: 'appear', at: 0.3 },
  rows: { transition: 'print', at: 0.1 },
  divider: { transition: 'draw', at: 0.5 },
  total: { transition: 'tick', at: 0.9 },
  badge: { transition: 'appear', at: 0.4 },
  footer: { transition: 'appear', at: 1.2 },
  counter: { transition: 'tick', at: 0.2 },
  freeform: { transition: 'appear', at: 0.2 },
};
