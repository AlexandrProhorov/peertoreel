/**
 * Growing a box is cheaper than a retry.
 *
 * When copy does not fit, the repair order is fixed: grow the box towards free
 * space, keep the type size, and only shrink the font when the frame has no room
 * left. Growth prefers the right and bottom edges, so most repairs keep the
 * element in place; when that side is blocked by a neighbour or the frame, the
 * free space on the opposite side is used and the box moves by exactly the
 * missing amount. It never crosses another element and never leaves the bounds.
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

interface Free {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

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

/** Nearest free edge on all four sides, in pixels. */
function limits(layout: Rect, obstacles: readonly Rect[], bounds: Bounds): Free {
  let left = bounds.left;
  let right = bounds.right;
  let top = bounds.top;
  let bottom = bounds.bottom;

  for (const obstacle of obstacles) {
    /* What is already inside the box is its content, not an obstacle. */
    if (contains(layout, obstacle)) {
      continue;
    }

    if (
      obstacle.x + obstacle.width <= layout.x + 0.5 &&
      overlapsVertically(layout, obstacle)
    ) {
      left = Math.max(left, obstacle.x + obstacle.width + GAP);
    }

    if (obstacle.x >= layout.x + layout.width - 0.5 && overlapsVertically(layout, obstacle)) {
      right = Math.min(right, obstacle.x - GAP);
    }

    if (obstacle.y + obstacle.height <= layout.y + 0.5 && overlapsHorizontally(layout, obstacle)) {
      top = Math.max(top, obstacle.y + obstacle.height + GAP);
    }

    if (obstacle.y >= layout.y + layout.height - 0.5 && overlapsHorizontally(layout, obstacle)) {
      bottom = Math.min(bottom, obstacle.y - GAP);
    }
  }

  return { left, right, top, bottom };
}

/**
 * Expand one axis: forward (right/down) first, the remaining deficit backwards.
 * Returns the new start and size; the caller keeps the opposite edge fixed.
 */
function expand(
  start: number,
  size: number,
  need: number,
  freeBefore: number,
  freeAfter: number,
): { start: number; size: number } {
  const deficit = Math.max(0, need - size);
  const forward = Math.min(Math.max(0, freeAfter), deficit);
  const backward = Math.min(Math.max(0, freeBefore), deficit - forward);

  return { start: start - backward, size: size + forward + backward };
}

export function growToFit(
  layout: Rect,
  need: { readonly width: number; readonly height: number },
  obstacles: readonly Rect[],
  bounds: Bounds,
): GrowResult {
  const limit = limits(layout, obstacles, bounds);
  const horizontal = expand(
    layout.x,
    layout.width,
    Math.max(layout.width, need.width),
    layout.x - limit.left,
    limit.right - (layout.x + layout.width),
  );
  const vertical = expand(
    layout.y,
    layout.height,
    Math.max(layout.height, need.height),
    layout.y - limit.top,
    limit.bottom - (layout.y + layout.height),
  );

  if (horizontal.size === layout.width && vertical.size === layout.height) {
    return { layout, grew: false };
  }

  return {
    layout: {
      x: Number(horizontal.start.toFixed(1)),
      y: Number(vertical.start.toFixed(1)),
      width: Number(horizontal.size.toFixed(1)),
      height: Number(vertical.size.toFixed(1)),
    },
    grew: true,
  };
}
