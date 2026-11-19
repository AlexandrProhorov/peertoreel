/**
 * Stage geometry. The canvas, the platform's own UI zones and the three
 * bound types live here so devices never restate them:
 *
 * - `DEVICE_BOUNDS`  — the full visual device (backgrounds, shadows, decoration).
 * - `CONTENT_BOUNDS` — where the device's inner layout is allowed to draw.
 * - `CRITICAL_SAFE_BOUNDS` — where text, numbers and critical elements must stay.
 *
 * A surface may pass under the platform rail (the reference does); text may not.
 */
export const CANVAS = { width: 1080, height: 1920 } as const;

/** Platform-owned overlay at the frame edges: right rail and bottom caption area. */
export const PLATFORM_OVERLAY = { right: 190, bottom: 300 } as const;

export const FRAME_INSET = 72;

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export const DEVICE_BOUNDS: Bounds = {
  left: 0,
  top: 0,
  right: CANVAS.width,
  bottom: CANVAS.height,
};

export const CONTENT_BOUNDS: Bounds = {
  left: FRAME_INSET,
  top: 0,
  right: CANVAS.width - FRAME_INSET,
  bottom: CANVAS.height,
};

export const CRITICAL_SAFE_BOUNDS: Bounds = {
  left: FRAME_INSET,
  top: 80,
  right: CANVAS.width - PLATFORM_OVERLAY.right,
  bottom: CANVAS.height - PLATFORM_OVERLAY.bottom,
};

export function boundsWidth(bounds: Bounds): number {
  return bounds.right - bounds.left;
}

export function boundsHeight(bounds: Bounds): number {
  return bounds.bottom - bounds.top;
}

export function contains(
  outer: Bounds,
  inner: Bounds,
  tolerance = 0.5,
): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/** Padding shorthand for a device that must draw inside `bounds`. */
export function boundsCss(bounds: Bounds): {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    position: 'absolute',
    left: bounds.left,
    top: bounds.top,
    width: boundsWidth(bounds),
    height: boundsHeight(bounds),
  };
}
