import type { SceneCamera } from '@peertoreel/contracts';

/**
 * The one camera implementation for every scene (ADR-0016 D8).
 *
 * Pure math only: no React, no Remotion, no wall clock. `shot` sets the base
 * scale, `movement`/`speed` produce a translate+scale delta, and `parallax`
 * coefficients scale both per depth so far layers move less than near ones.
 */

/** Default per-depth coefficients, far to near, when `camera.parallax` is absent. */
export const DEFAULT_PARALLAX: readonly number[] = [0.15, 0.35, 0.6, 0.8, 1];

const SHOT_SCALES: Readonly<Record<SceneCamera['shot'], number>> = {
  extreme_wide: 0.92,
  wide: 1,
  medium: 1.05,
  close_up: 1.12,
  extreme_close: 1.2,
};

export interface CameraMotion {
  readonly translateXPercent: number;
  readonly translateYPercent: number;
  readonly scale: number;
}

export interface CameraTransform extends CameraMotion {
  readonly shotScale: number;
  /** Coefficient used for this layer, 0 (far) .. 1 (near). */
  readonly parallax: number;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function cameraProgress(
  frame: number,
  durationInFrames: number,
): number {
  return durationInFrames <= 1 ? 0 : clamp01(frame / (durationInFrames - 1));
}

export function shotScale(shot: SceneCamera['shot']): number {
  return SHOT_SCALES[shot];
}

/**
 * Movement delta, independent of `shot` and `parallax`. The pan/zoom/tilt
 * formulas intentionally match M3.2 so legacy scenes keep their motion style.
 */
export function movementMotion(
  movement: SceneCamera['movement'],
  speed: number,
  progress: number,
): CameraMotion {
  const strength = 0.6 + speed;
  const p = clamp01(progress);

  switch (movement) {
    case 'pan':
      return {
        translateXPercent: lerp(-1.6, 1.6, p) * strength,
        translateYPercent: 0,
        scale: 1.06,
      };
    case 'zoom_in':
      return {
        translateXPercent: 0,
        translateYPercent: 0,
        scale: lerp(1, 1.06 + speed * 0.08, p),
      };
    case 'zoom_out':
      return {
        translateXPercent: 0,
        translateYPercent: 0,
        scale: lerp(1.08, 1, p),
      };
    case 'dolly':
      return {
        translateXPercent: 0,
        translateYPercent: lerp(0, 1.4, p),
        scale: lerp(1, 1.05, p),
      };
    case 'tilt':
      return {
        translateXPercent: 0,
        translateYPercent: lerp(0, -1.8, p),
        scale: 1.04,
      };
    case 'orbit':
      return {
        translateXPercent: Math.sin(p * Math.PI * 2) * 1.2,
        translateYPercent: 0,
        scale: 1.05,
      };
    case 'static':
      return { translateXPercent: 0, translateYPercent: 0, scale: 1 };
  }
}

/**
 * Sample parallax coefficients at a normalized depth (0 = farthest layer,
 * 1 = nearest). An absent array uses `DEFAULT_PARALLAX`, so a missing value is
 * still deterministic framing rather than a no-op.
 */
export function parallaxCoefficient(
  parallax: readonly number[] | undefined,
  depth: number,
): number {
  const coefficients =
    parallax !== undefined && parallax.length > 0
      ? parallax
      : DEFAULT_PARALLAX;
  const lastIndex = coefficients.length - 1;
  const position = clamp01(depth) * lastIndex;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const from = coefficients[lower] ?? coefficients[0] ?? 1;
  const to = coefficients[upper] ?? from;

  return lerp(from, to, position - lower);
}

export function cameraTransform(
  camera: SceneCamera,
  progress: number,
  depth = 1,
): CameraTransform {
  const motion = movementMotion(camera.movement, camera.speed, progress);
  const baseScale = shotScale(camera.shot);
  const coefficient = parallaxCoefficient(camera.parallax, depth);

  return {
    translateXPercent: motion.translateXPercent * coefficient,
    translateYPercent: motion.translateYPercent * coefficient,
    scale: 1 + (baseScale * motion.scale - 1) * coefficient,
    shotScale: baseScale,
    parallax: coefficient,
  };
}

export function toCssTransform(transform: CameraMotion): string {
  return `translate(${transform.translateXPercent}%, ${transform.translateYPercent}%) scale(${transform.scale})`;
}
