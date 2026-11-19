import { Easing, interpolate, spring } from 'remotion';

/**
 * Micro-interaction vocabulary. Each helper is a pure function of the frame
 * number so a device can compose several movements into one choreography
 * without any wall-clock dependency.
 */
export function popScale(
  frame: number,
  startFrame: number,
  fps: number,
  overshoot = 1.06,
): number {
  const value = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, mass: 0.55, stiffness: 170 },
  });

  return Math.min(overshoot, Math.max(0, value));
}

export function settleTilt(
  frame: number,
  startFrame: number,
  fps: number,
  degrees = -3,
): number {
  const value = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 12, mass: 0.9, stiffness: 120 },
  });

  return degrees * (1 - Math.min(1, Math.max(0, value)));
}

/** Per-word reveal frames for a type-on effect across a fixed window. */
export function typeOnFrames(
  count: number,
  startFrame: number,
  windowFrames: number,
): number[] {
  if (count <= 0) {
    return [];
  }

  const step = count <= 1 ? 0 : windowFrames / (count - 1);

  return Array.from({ length: count }, (_, index) =>
    Math.round(startFrame + index * step),
  );
}

export function counterValue(
  frame: number,
  startFrame: number,
  endFrame: number,
  from: number,
  to: number,
  decimals = 0,
): number {
  const value = interpolate(frame, [startFrame, endFrame], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

export function sweepProgress(
  frame: number,
  startFrame: number,
  durationFrames: number,
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
}

/** Gentle float for objects; deterministic, amplitude in pixels. */
export function bobOffset(
  frame: number,
  periodFrames = 52,
  amplitude = 8,
): number {
  return Math.sin((frame / periodFrames) * Math.PI * 2) * amplitude;
}
