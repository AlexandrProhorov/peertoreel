/**
 * Growing a box is cheaper than a retry.
 *
 * When copy does not fit, the repair order is fixed: grow the box towards free
 * space, keep the type size, and only shrink the font when the frame has no room
 * left. Growth never moves the element and never crosses another element — a
 * box that slides into its neighbour is a different defect, not a fix.
 *
 * The function is pure so the rule can be tested without a renderer.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GrowResult {
  readonly layout: Rect;
  readonly grew: boolean;
}

const GAP = 16;

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

function overlapsVertically(first: Rect, second: Rect): boolean {
  return (
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y) > 0.5
  );
}

function overlapsHorizontally(first: Rect, second: Rect): boolean {
  return (
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x) > 0.5
  );
}

/** The nearest free edge to the right and below, in pixels. */
function limits(layout: Rect, obstacles: readonly Rect[], bounds: Bounds): {
  right: number;
  bottom: number;
} {
  let right = bounds.right;
  let bottom = bounds.bottom;

  for (const obstacle of obstacles) {
    /* What is already inside the box is its content, not an obstacle. */
    if (contains(layout, obstacle)) {
      continue;
    }

    if (obstacle.x >= layout.x + layout.width - 0.5 && overlapsVertically(layout, obstacle)) {
      right = Math.min(right, obstacle.x - GAP);
    }

    if (obstacle.y >= layout.y + layout.height - 0.5 && overlapsHorizontally(layout, obstacle)) {
      bottom = Math.min(bottom, obstacle.y - GAP);
    }
  }

  return { right, bottom };
}

export function growToFit(
  layout: Rect,
  need: { readonly width: number; readonly height: number },
  obstacles: readonly Rect[],
  bounds: Bounds,
): GrowResult {
  const limit = limits(layout, obstacles, bounds);
  const maxWidth = Math.max(layout.width, limit.right - layout.x);
  const maxHeight = Math.max(layout.height, limit.bottom - layout.y);
  const width = Math.min(maxWidth, Math.max(layout.width, need.width));
  const height = Math.min(maxHeight, Math.max(layout.height, need.height));

  if (width === layout.width && height === layout.height) {
    return { layout, grew: false };
  }

  return {
    layout: {
      ...layout,
      width: Number(width.toFixed(1)),
      height: Number(height.toFixed(1)),
    },
    grew: true,
  };
}
