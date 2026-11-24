import { CONTENT_BOUNDS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import type { DrawNode, DrawText, DrawTransition } from './schema.js';
import { ROLE_MOTION, type DrawPlan, type DrawPlanBlock, type DrawPlanPanel } from './plan.js';
import { estimateLines, fitToken, measureText } from './text-metrics.js';

/**
 * Plan to nodes. The model says what the frame is made of; this file decides
 * where it stands.
 *
 * Deterministic by construction: the same plan gives the same coordinates, so a
 * fixed frame is testable without Chrome, and the variety comes from the plan
 * (composition, block order, density, visual roles), not from random geometry.
 */

const CARD_PAD = 24;
const CARD_RADIUS = 28;
const HEADER_ICON = 72;
const COLUMN_GAP = 16;
const TEXT_GAP = 12;
const PANEL_GAP = 20;
const ICON_GAP = 16;
const BADGE_PAD_X = 16;
const BADGE_PAD_Y = 8;

const DENSITY_GAP: Readonly<Record<DrawPlan['density'], number>> = {
  tight: 12,
  normal: 20,
  airy: 32,
};

const ROW_GAP: Readonly<Record<DrawPlan['density'], number>> = {
  tight: 12,
  normal: 16,
  airy: 24,
};

export interface LayoutBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export const LAYOUT_BOUNDS: LayoutBounds = {
  left: CONTENT_BOUNDS.left,
  top: CRITICAL_SAFE_BOUNDS.top,
  right: CONTENT_BOUNDS.right,
  bottom: CRITICAL_SAFE_BOUNDS.bottom,
};

function fontSize(token: TypeToken): number {
  return TYPE_SCALE[token].fontSize;
}

function textHeight(text: string, width: number, token: TypeToken): number {
  return estimateLines(text, width, fontSize(token)) * fontSize(token) * TYPE_SCALE[token].lineHeight;
}

function textNode(input: {
  x: number;
  y: number;
  w: number;
  text: string;
  token: TypeToken;
  align?: 'left' | 'center' | 'right';
  color?: string;
  at?: number;
  transition?: DrawTransition;
}): DrawText {
  return {
    kind: 'text',
    x: Math.round(input.x),
    y: Math.round(input.y),
    w: Math.round(input.w),
    text: input.text,
    token: input.token,
    ...(input.align === undefined ? {} : { align: input.align }),
    ...(input.color === undefined ? {} : { color: input.color }),
    ...(input.at === undefined ? {} : { at: input.at }),
    ...(input.transition === undefined ? {} : { transition: input.transition }),
  };
}

function motionOf(
  block: Exclude<DrawPlanBlock, { role: 'freeform' }>,
): { at: number; transition: DrawTransition } {
  return block.motion ?? ROLE_MOTION[block.role];
}

interface Laid {
  readonly nodes: DrawNode[];
  readonly height: number;
}

function headerNodes(
  block: Extract<DrawPlanBlock, { role: 'header' }>,
  align: 'left' | 'center',
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const titleToken = fitToken(block.title, innerWidth, block.token ?? 'headline');
  const iconWidth = block.icon === undefined ? 0 : HEADER_ICON + COLUMN_GAP;
  const textWidth = innerWidth - iconWidth;
  const textAlign = block.align ?? align;
  const titleHeight = textHeight(block.title, textWidth, titleToken);
  const subtitleHeight =
    block.subtitle === undefined ? 0 : TEXT_GAP + textHeight(block.subtitle, textWidth, 'body');
  const nodes: DrawNode[] = [];
  const totalHeight = Math.max(HEADER_ICON, titleHeight + subtitleHeight);

  if (block.icon !== undefined) {
    nodes.push({
      kind: 'icon',
      x: 0,
      y: Math.round((totalHeight - HEADER_ICON) / 2),
      size: HEADER_ICON,
      emoji: block.icon,
      at: motion.at,
      transition: motion.transition,
    });
  }

  nodes.push(
    textNode({
      x: iconWidth,
      y: 0,
      w: textWidth,
      text: block.title,
      token: titleToken,
      align: textAlign,
      at: motion.at,
      transition: motion.transition,
    }),
  );

  if (block.subtitle !== undefined) {
    nodes.push(
      textNode({
        x: iconWidth,
        y: titleHeight + TEXT_GAP,
        w: textWidth,
        text: block.subtitle,
        token: 'body',
        color: 'muted',
        align: textAlign,
        at: Math.min(1.8, motion.at + 0.1),
        transition: 'appear',
      }),
    );
  }

  return { nodes, height: totalHeight + gap };
}

function iconsNodes(
  block: Extract<DrawPlanBlock, { role: 'icons' }>,
  fallbackAlign: 'left' | 'center',
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const size = block.size === 'small' ? 56 : 112;
  const textAlign = block.align ?? fallbackAlign;
  const rowWidth = block.items.length * size + (block.items.length - 1) * ICON_GAP;
  const startX = textAlign === 'center' ? Math.max(0, (innerWidth - rowWidth) / 2) : 0;
  const nodes: DrawNode[] = block.items.map((emoji, index) => ({
    kind: 'icon',
    x: Math.round(startX + index * (size + ICON_GAP)),
    y: 0,
    size,
    emoji,
    at: motion.at,
    transition: motion.transition,
  }));

  return { nodes, height: size + gap };
}

function figureNodes(
  block: Extract<DrawPlanBlock, { role: 'figure' }>,
  fallbackAlign: 'left' | 'center',
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const textAlign = block.align ?? fallbackAlign;

  if (block.shape === 'bar') {
    const trackWidth = innerWidth;
    const fillWidth = Math.max(8, Math.round(trackWidth * (block.value ?? 1)));

    return {
      nodes: [
        {
          kind: 'box',
          x: 0,
          y: 0,
          w: trackWidth,
          h: 16,
          r: 8,
          fill: 'muted',
          at: motion.at,
          transition: motion.transition,
        },
        {
          kind: 'box',
          x: 0,
          y: 0,
          w: fillWidth,
          h: 16,
          r: 8,
          fill: 'accent',
          at: motion.at,
          transition: motion.transition,
        },
      ],
      height: 16 + gap,
    };
  }

  if (block.shape === 'layers') {
    const layers = [0, 1, 2].map((index) => ({
      kind: 'box' as const,
      x: index * 24,
      y: index * 20,
      w: innerWidth - 48,
      h: 96,
      r: 20,
      fill: index === 2 ? 'accent' : 'surface',
      at: Math.min(1.8, motion.at + index * 0.05),
      transition: 'appear' as const,
    }));

    return { nodes: layers, height: 96 + 40 + gap };
  }

  const size = 160;
  const x = textAlign === 'center' ? Math.round((innerWidth - size) / 2) : 0;

  return {
    nodes: [
      {
        kind: 'box',
        x,
        y: 0,
        w: size,
        h: size,
        r: Math.round(size / 2),
        fill: 'accent',
        at: motion.at,
        transition: motion.transition,
      },
    ],
    height: size + gap,
  };
}

function rowsNodes(
  block: Extract<DrawPlanBlock, { role: 'rows' }>,
  innerWidth: number,
  gap: number,
  rowGap: number,
): Laid {
  const motion = motionOf(block);
  const token = block.token ?? 'body';
  const withValues = block.style === 'columns' && block.items.some((item) => item.right !== undefined);
  const valueWidth = withValues
    ? Math.ceil(
        Math.max(
          ...block.items.map((item) =>
            item.right === undefined ? 0 : measureText(item.right, fontSize(token)),
          ),
        ),
      ) + 8
    : 0;
  const labelWidth = withValues ? innerWidth - valueWidth - COLUMN_GAP : innerWidth;
  const rows: DrawNode[] = [];
  let y = 0;

  for (const item of block.items) {
    if (block.style === 'inline') {
      const line = item.right === undefined ? item.left : `${item.left} — ${item.right}`;

      rows.push(textNode({ x: 0, y, w: innerWidth, text: line, token }));
      y += textHeight(line, innerWidth, token) + rowGap;
      continue;
    }

    rows.push(textNode({ x: 0, y, w: labelWidth, text: item.left, token }));

    if (withValues && item.right !== undefined) {
      rows.push(
        textNode({
          x: innerWidth - valueWidth,
          y,
          w: valueWidth,
          text: item.right,
          token,
          align: 'right',
        }),
      );
    }

    y += Math.max(
      textHeight(item.left, labelWidth, token),
      item.right === undefined ? 0 : textHeight(item.right, valueWidth, token),
    ) + rowGap;
  }

  const height = y - rowGap;

  return {
    nodes: [
      {
        kind: 'box',
        x: 0,
        y: 0,
        w: innerWidth,
        h: Math.ceil(height),
        clip: false,
        at: motion.at,
        transition: motion.transition,
        children: rows,
      },
    ],
    height: height + gap,
  };
}

function dividerNodes(
  block: Extract<DrawPlanBlock, { role: 'divider' }>,
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);

  return {
    nodes: [
      {
        kind: 'line',
        x1: 0,
        y1: 4,
        x2: innerWidth,
        y2: 4,
        width: 2,
        dashed: block.dashed,
        color: 'muted',
        at: motion.at,
        transition: motion.transition,
      },
    ],
    height: 8 + gap,
  };
}

function totalNodes(
  block: Extract<DrawPlanBlock, { role: 'total' }>,
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const nodes: DrawNode[] = [];

  if (block.style === 'stacked') {
    const valueToken = fitToken(block.value, innerWidth, block.token ?? 'headline');
    const labelHeight = textHeight(block.label, innerWidth, 'body');

    nodes.push(
      textNode({
        x: 0,
        y: 0,
        w: innerWidth,
        text: block.label,
        token: 'body',
        color: 'muted',
        at: motion.at,
        transition: 'appear',
      }),
      textNode({
        x: 0,
        y: labelHeight + TEXT_GAP,
        w: innerWidth,
        text: block.value,
        token: valueToken,
        at: motion.at,
        transition: motion.transition,
      }),
    );

    return {
      nodes,
      height: labelHeight + TEXT_GAP + textHeight(block.value, innerWidth, valueToken) + gap,
    };
  }

  const requested = block.token ?? 'headline';
  const valueWidth = Math.ceil(measureText(block.value, fontSize(requested))) + 8;
  const labelWidth = Math.max(120, innerWidth - valueWidth - COLUMN_GAP);
  const labelToken = fitToken(block.label, labelWidth, requested);
  const height = Math.max(
    textHeight(block.label, labelWidth, labelToken),
    textHeight(block.value, valueWidth, requested),
  );

  nodes.push(
    textNode({
      x: 0,
      y: 0,
      w: labelWidth,
      text: block.label,
      token: labelToken,
      at: motion.at,
      transition: 'appear',
    }),
    textNode({
      x: innerWidth - valueWidth,
      y: 0,
      w: valueWidth,
      text: block.value,
      token: requested,
      align: 'right',
      at: motion.at,
      transition: motion.transition,
    }),
  );

  return { nodes, height: height + gap };
}

function badgeNodes(
  block: Extract<DrawPlanBlock, { role: 'badge' }>,
  fallbackAlign: 'left' | 'center',
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const textAlign = block.align ?? fallbackAlign;
  const textWidth = Math.ceil(measureText(block.text, fontSize('caption'))) + BADGE_PAD_X * 2;
  const height = Math.ceil(textHeight(block.text, textWidth, 'caption')) + BADGE_PAD_Y * 2;
  const x = textAlign === 'center' ? Math.round((innerWidth - textWidth) / 2) : 0;

  return {
    nodes: [
      {
        kind: 'box',
        x,
        y: 0,
        w: textWidth,
        h: height,
        r: Math.round(height / 2),
        fill: block.tone,
        at: motion.at,
        transition: motion.transition,
        children: [
          textNode({
            x: BADGE_PAD_X,
            y: BADGE_PAD_Y,
            w: textWidth - BADGE_PAD_X * 2,
            text: block.text,
            token: 'caption',
            color: block.tone === 'accent' ? 'ink' : 'surface',
            align: 'center',
            at: motion.at,
            transition: 'appear',
          }),
        ],
      },
    ],
    height: height + gap,
  };
}

function footerNodes(
  block: Extract<DrawPlanBlock, { role: 'footer' }>,
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const height = textHeight(block.text, innerWidth, 'caption');

  return {
    nodes: [
      textNode({
        x: 0,
        y: 0,
        w: innerWidth,
        text: block.text,
        token: 'caption',
        color: 'muted',
        align: 'center',
        at: motion.at,
        transition: motion.transition,
      }),
    ],
    height: height + gap,
  };
}

function counterNodes(
  block: Extract<DrawPlanBlock, { role: 'counter' }>,
  fallbackAlign: 'left' | 'center',
  innerWidth: number,
  gap: number,
): Laid {
  const motion = motionOf(block);
  const valueToken = fitToken(block.value, innerWidth, block.token ?? 'display');
  const textAlign = block.align ?? fallbackAlign;
  const valueHeight = textHeight(block.value, innerWidth, valueToken);

  return {
    nodes: [
      textNode({
        x: 0,
        y: 0,
        w: innerWidth,
        text: block.value,
        token: valueToken,
        align: textAlign,
        at: motion.at,
        transition: motion.transition,
      }),
      textNode({
        x: 0,
        y: valueHeight + TEXT_GAP,
        w: innerWidth,
        text: block.label,
        token: 'body',
        color: 'muted',
        align: textAlign,
        at: Math.min(1.8, motion.at + 0.05),
        transition: 'appear',
      }),
    ],
    height: valueHeight + TEXT_GAP + textHeight(block.label, innerWidth, 'body') + gap,
  };
}

function layBlock(
  block: DrawPlanBlock,
  align: 'left' | 'center',
  innerWidth: number,
  gap: number,
  rowGap: number,
): Laid {
  switch (block.role) {
    case 'header':
      return headerNodes(block, align, innerWidth, gap);
    case 'icons':
      return iconsNodes(block, align, innerWidth, gap);
    case 'figure':
      return figureNodes(block, align, innerWidth, gap);
    case 'rows':
      return rowsNodes(block, innerWidth, gap, rowGap);
    case 'divider':
      return dividerNodes(block, innerWidth, gap);
    case 'total':
      return totalNodes(block, innerWidth, gap);
    case 'badge':
      return badgeNodes(block, align, innerWidth, gap);
    case 'footer':
      return footerNodes(block, innerWidth, gap);
    case 'counter':
      return counterNodes(block, align, innerWidth, gap);
    case 'freeform':
      throw new Error('freeform blocks are reserved by composePlan, not laid out');
  }
}

/** A band the plan reserves for a painted region. */
export interface FreeformRegion {
  readonly intent: string;
  readonly bounds: LayoutBounds;
}

/** The frame in drawing order: laid-out nodes, then a painted band, then more. */
export type PlanSegment =
  | { readonly nodes: DrawNode[] }
  | { readonly region: FreeformRegion };

export interface ComposedPlan {
  readonly nodes: DrawNode[];
  readonly regions: FreeformRegion[];
  readonly segments: PlanSegment[];
}

/** Stacks blocks top-down in a local coordinate space starting at zero. */
function stackBlocks(
  blocks: readonly DrawPlanBlock[],
  align: 'left' | 'center',
  innerWidth: number,
  gap: number,
  rowGap: number,
): Laid {
  const nodes: DrawNode[] = [];
  let y = 0;

  for (const block of blocks) {
    const laid = layBlock(block, align, innerWidth, gap, rowGap);

    for (const node of laid.nodes) {
      nodes.push(shift(node, 0, y));
    }

    y += laid.height;
  }

  return { nodes, height: Math.max(0, y - gap) };
}

function panelNodes(
  panel: DrawPlanPanel,
  plan: DrawPlan,
  x: number,
  top: number,
  width: number,
  gap: number,
  rowGap: number,
): DrawNode[] {
  const innerWidth = panel.surface === 'card' ? width - CARD_PAD * 2 : width;
  const laid = stackBlocks(panel.blocks, plan.align, innerWidth, gap, rowGap);

  if (panel.surface === 'none') {
    return laid.nodes.map((node) => shift(node, x, top));
  }

  return [
    {
      kind: 'box',
      x,
      y: top,
      w: width,
      h: Math.ceil(laid.height + CARD_PAD * 2),
      r: CARD_RADIUS,
      fill: 'surface',
      shadow: true,
      children: laid.nodes.map((node) => shift(node, CARD_PAD, CARD_PAD)),
    },
  ];
}

/**
 * Lays a plan out inside the safe content area. `stack` puts one column of
 * blocks on one surface; `panels` sets two or three surfaces side by side for a
 * comparison; `freeform` bands are reserved and returned, not drawn — a paint
 * call fills them.
 */
export function composePlan(plan: DrawPlan, bounds: LayoutBounds = LAYOUT_BOUNDS): ComposedPlan {
  const gap = DENSITY_GAP[plan.density];
  const rowGap = ROW_GAP[plan.density];
  const frameWidth = bounds.right - bounds.left;
  const frameHeight = bounds.bottom - bounds.top;

  if (plan.composition === 'panels') {
    if (plan.panels.some((panel) => panel.blocks.some((block) => block.role === 'freeform'))) {
      throw new Error('freeform inside panels is not supported yet');
    }

    const count = plan.panels.length;
    const width = Math.floor((frameWidth - PANEL_GAP * (count - 1)) / count);
    const nodes = plan.panels.flatMap((panel, index) =>
      panelNodes(panel, plan, bounds.left + index * (width + PANEL_GAP), bounds.top, width, gap, rowGap),
    );

    return { nodes, regions: [], segments: [{ nodes }] };
  }

  const hasFreeform = plan.blocks.some((block) => block.role === 'freeform');

  if (hasFreeform && plan.surface === 'card') {
    throw new Error('freeform needs surface none: a painted region is not a stacked block');
  }

  const innerWidth = plan.surface === 'card' ? frameWidth - CARD_PAD * 2 : frameWidth;
  const nodes: DrawNode[] = [];
  const regions: FreeformRegion[] = [];
  const local: PlanSegment[] = [];
  let y = 0;

  for (const block of plan.blocks) {
    if (block.role === 'freeform') {
      const height = Math.round(frameHeight * block.height);
      const top = bounds.top + y;

      const region: FreeformRegion = {
        intent: block.intent,
        bounds: { left: bounds.left, top, right: bounds.right, bottom: top + height },
      };

      regions.push(region);
      local.push({ region });
      y += height + gap;
      continue;
    }

    const laid = layBlock(block, plan.align, innerWidth, gap, rowGap);
    const placed = laid.nodes.map((node) => shift(node, 0, y));

    nodes.push(...placed);
    local.push({ nodes: placed });
    y += laid.height;
  }

  if (plan.surface === 'none') {
    const shiftAll = (list: DrawNode[]): DrawNode[] =>
      list.map((node) => shift(node, bounds.left, bounds.top));

    return {
      nodes: shiftAll(nodes),
      regions,
      segments: local.map((segment) =>
        'nodes' in segment ? { nodes: shiftAll(segment.nodes) } : segment,
      ),
    };
  }

  /* Children are relative to the card: they start after the padding, not on the
     rounded edge, otherwise the first line is cut by the card itself. */
  const card: DrawNode[] = [
    {
      kind: 'box',
      x: bounds.left,
      y: bounds.top,
      w: frameWidth,
      h: Math.ceil(Math.max(0, y - gap) + CARD_PAD * 2),
      r: CARD_RADIUS,
      fill: 'surface',
      shadow: true,
      children: nodes.map((node) => shift(node, CARD_PAD, CARD_PAD)),
    },
  ];

  return { nodes: card, regions, segments: [{ nodes: card }] };
}

/**
 * Nodes only. A plan with a freeform band cannot be laid out without a painter,
 * so it fails explicitly instead of silently dropping the picture.
 */
export function layoutPlan(plan: DrawPlan, bounds: LayoutBounds = LAYOUT_BOUNDS): DrawNode[] {
  const composed = composePlan(plan, bounds);

  if (composed.regions.length > 0) {
    throw new Error('draw plan contains a freeform region: fill it with paintRegion');
  }

  return composed.nodes;
}

/** Moves a node and its line endpoints. Box children are relative and follow. */
function shift(node: DrawNode, dx: number, dy: number): DrawNode {
  if (node.kind === 'line') {
    return { ...node, x1: node.x1 + dx, y1: node.y1 + dy, x2: node.x2 + dx, y2: node.y2 + dy };
  }

  return { ...node, x: node.x + dx, y: node.y + dy };
}
