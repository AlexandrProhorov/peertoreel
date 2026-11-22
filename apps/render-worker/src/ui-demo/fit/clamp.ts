import { CRITICAL_SAFE_BOUNDS } from '../platform.js';

/**
 * Geometry repair, pure: no element may sit under the platform rail or leave the
 * content bounds. The model places boxes by feel, so the renderer clamps them —
 * a layout is a request, not a promise.
 */
export interface Clampable {
  readonly layout: {
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
  };
}

export function clampLayout<T extends Clampable>(element: T): T {
  const left = CRITICAL_SAFE_BOUNDS.left;
  const top = CRITICAL_SAFE_BOUNDS.top;
  const right = CRITICAL_SAFE_BOUNDS.right;
  const bottom = CRITICAL_SAFE_BOUNDS.bottom;
  const layout = { ...element.layout };

  if (layout.width !== undefined) {
    if (layout.x + layout.width > right) {
      layout.x =
        layout.width <= right - left ? right - layout.width : left;
      if (layout.width > right - left) {
        layout.width = right - left;
      }
    }

    if (layout.x < left) {
      layout.x = left;
    }
  }

  if (layout.height !== undefined) {
    if (layout.y + layout.height > bottom) {
      layout.y =
        layout.height <= bottom - top ? bottom - layout.height : top;
      if (layout.height > bottom - top) {
        layout.height = bottom - top;
      }
    }

    if (layout.y < top) {
      layout.y = top;
    }
  }

  return { ...element, layout };
}
