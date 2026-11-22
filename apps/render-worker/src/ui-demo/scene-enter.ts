import { CANVAS } from './platform.js';

/**
 * Scene transitions are nearly invisible on purpose: the viewer should notice
 * the scene changed, not the move that changed it.
 *
 * Two tools only. A dissolve — the default — where both scenes are on screen and
 * opacity trades between them. A soft slide — the same dissolve plus a drift of
 * one to two percent of the frame, so the cut has a direction without looking
 * like a presentation slide.
 *
 * The style is a pure function of (name, progress), so a test can check it
 * without Chrome and the same frame always draws the same picture.
 */

export const ENTER_IDS = [
  'cut',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'fade',
] as const;

export type SceneEnterId = (typeof ENTER_IDS)[number];

/**
 * 300 ms at 30 fps: long enough to read as a dissolve, short enough not to be a
 * pause. The same number is the overlap between two scenes, so the entrance
 * lands exactly on the scene boundary.
 */
export const ENTER_FRAMES: Readonly<Record<SceneEnterId, number>> = {
  cut: 0,
  'slide-left': 9,
  'slide-right': 9,
  'slide-up': 9,
  'slide-down': 9,
  fade: 9,
};

/**
 * The slide drift: 1.2 % of the frame. At 1080 px wide that is 13 px — felt as a
 * direction, not seen as a movement.
 */
const SLIDE_SHARE = 0.012;

/** Direction the incoming scene comes from, in frames. */
const SLIDE_FROM: Readonly<Record<string, readonly [number, number]>> = {
  'slide-left': [CANVAS.width * SLIDE_SHARE, 0],
  'slide-right': [-CANVAS.width * SLIDE_SHARE, 0],
  'slide-up': [0, CANVAS.height * SLIDE_SHARE],
  'slide-down': [0, -CANVAS.height * SLIDE_SHARE],
};

export interface SceneEnterStyle {
  readonly opacity?: number;
  readonly transform?: string;
  readonly transformOrigin?: string;
  readonly clipPath?: string;
}

function isEnterId(value: string): value is SceneEnterId {
  return (ENTER_IDS as readonly string[]).includes(value);
}

/** Smoothstep: zero velocity at both ends, so nothing starts or stops abruptly. */
export function easeInOut(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));

  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Style for the incoming scene at `frame` (clip-local; frame 0 is where the
 * overlap begins). Unknown names fall back to a cut: a renderer must never
 * invent motion it was not asked for.
 */
export function sceneEnterStyle(enter: string, frame: number): SceneEnterStyle {
  if (!isEnterId(enter)) {
    return {};
  }

  const total = ENTER_FRAMES[enter];

  if (total === 0) {
    return {};
  }

  const raw = Math.min(1, Math.max(0, frame / total));

  if (raw >= 1) {
    return {};
  }

  const eased = easeInOut(raw);
  const from = SLIDE_FROM[enter];

  if (from !== undefined) {
    const x = from[0] * (1 - eased);
    const y = from[1] * (1 - eased);

    return {
      transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
      opacity: eased,
    };
  }

  return { opacity: eased };
}

/** Frames the transition takes, for tests and for the timeline. */
export function sceneEnterFrames(enter: string): number {
  return isEnterId(enter) ? ENTER_FRAMES[enter] : 0;
}
