import { Easing, interpolate } from 'remotion';

const ENTER_FRAMES = 5;
const EXIT_FRAMES = 3;
const FLASH_FRAMES = 2;
const FLASH_PEAK = 0.55;

export interface SceneMotion {
  readonly opacity: number;
  /** White flash at the cut, like the reference's whip transition. */
  readonly flash: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * One place for the transition grammar: the reference does not morph between
 * scenes, it cuts with a 3–5 frame zoom/blur and a white flash. Everything is
 * frame-driven, so two renders of the same input are identical.
 */
export function sceneMotion(
  frame: number,
  durationInFrames: number,
): SceneMotion {
  const enter = interpolate(
    frame,
    [0, ENTER_FRAMES],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    },
  );
  const exitStart = Math.max(0, durationInFrames - EXIT_FRAMES);
  const exit = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.cubic),
    },
  );
  const flash = interpolate(
    frame,
    [0, FLASH_FRAMES],
    [FLASH_PEAK, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.quad),
    },
  );

  return {
    /* No scale: resampling a full 1080×1920 layer is not bit-stable across
       Chromium processes. The cut keeps its opacity ramp and flash. */
    opacity: clamp01((0.75 + 0.25 * enter) * (1 - 0.45 * exit)),
    flash,
  };
}
