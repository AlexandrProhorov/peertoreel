import { drawNodesSchema, normalizeDrawNodes, type DrawNode } from './schema.js';
import type { FreeformRegion } from './layout.js';

/**
 * Painted regions.
 *
 * A plan may reserve a band for a picture the layout engine cannot compose:
 * tilted cards, overlapping layers, a torn edge. The band is fixed by
 * `composePlan`; this module asks the model for nodes inside that band, clamps
 * them into it, and shifts them into the frame. Everything outside the band is
 * still laid out by code, so a freeform scene cannot drift as a whole.
 */

export type FreeformPainter = (input: {
  readonly intent: string;
  readonly width: number;
  readonly height: number;
}) => Promise<string>;

const PAINT_SYSTEM = `Ты рисуешь часть кадра вертикального ролика 1080×1920. Тебе дана область W×H и замысел:
нарисуй только его, внутри этой области.

Узлы:
- box: x, y, w, h, r, rot (−45..45), fill, stroke, strokeWidth, shadow, clip, opacity; дети в
  координатах родителя.
- text: x, y, w, text, token (display|headline|card|body|caption), weight, align, color.
- icon: x, y, size, emoji.
- line: x1, y1, x2, y2, width, dashed, color.

Правила:
- координаты от 0 до W по x и от 0 до H по y; ничего не выходит за область;
- цвета только из темы: background, surface, ink, muted, accent;
- текст короткий: заголовок до 24 символов, подпись до 40;
- у узла может быть at (0..1.8) и transition (appear|type|print|draw|tick|slide);
- пустота допустима, если несёт смысл.

Ответ — только JSON { "nodes": [ ... ] }, без markdown.`;

function parseNodes(text: string): DrawNode[] {
  const trimmed = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/u, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('freeform answer has no JSON');
  }

  const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    throw new Error('freeform answer has no nodes array');
  }

  return drawNodesSchema.parse(normalizeDrawNodes((parsed as { nodes: unknown[] }).nodes)) as DrawNode[];
}

/** Painted content keeps this much air from the band edge: rotation and shadow
 *  extend the visual box beyond x/y/w/h. */
const BLEED = 12;

function clampX(value: number, width: number): number {
  return Math.min(Math.max(BLEED, value), Math.max(BLEED, width - BLEED));
}

/** Keeps every node inside the reserved band, without changing its design. */
export function clampToRegion(
  nodes: readonly DrawNode[],
  width: number,
  height: number,
): DrawNode[] {
  return nodes.map((node) => {
    switch (node.kind) {
      case 'line':
        return {
          ...node,
          x1: clampX(node.x1, width),
          x2: clampX(node.x2, width),
          y1: clampX(node.y1, height),
          y2: clampX(node.y2, height),
        };
      case 'icon': {
        const size = Math.min(node.size, width, height);

        return { ...node, size, x: clampX(node.x, width - size), y: clampX(node.y, height - size) };
      }
      case 'box': {
        const w = Math.min(node.w, width);
        const h = Math.min(node.h, height);

        return {
          ...node,
          w,
          h,
          x: clampX(node.x, width - w),
          y: clampX(node.y, height - h),
          children:
            node.children === undefined ? undefined : clampToRegion(node.children, w, h),
        };
      }
      case 'text': {
        const w = Math.min(node.w, width);

        return { ...node, w, x: clampX(node.x, width - w), y: clampX(node.y, height) };
      }
    }
  });
}

/**
 * Paints one reserved band: asks the model, validates the answer with the same
 * node schema, clamps it into the band and moves it into the frame.
 */
export async function paintRegion(
  region: FreeformRegion,
  paint: FreeformPainter,
): Promise<DrawNode[]> {
  const width = region.bounds.right - region.bounds.left;
  const height = region.bounds.bottom - region.bounds.top;
  const answer = await paint({ intent: region.intent, width, height });
  const nodes = clampToRegion(parseNodes(answer), width, height);

  return nodes.map((node) => shift(node, region.bounds.left, region.bounds.top));
}

function shift(node: DrawNode, dx: number, dy: number): DrawNode {
  if (node.kind === 'line') {
    return { ...node, x1: node.x1 + dx, y1: node.y1 + dy, x2: node.x2 + dx, y2: node.y2 + dy };
  }

  return { ...node, x: node.x + dx, y: node.y + dy };
}

export { PAINT_SYSTEM };
