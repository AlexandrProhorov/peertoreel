import { CANVAS } from './platform.js';

/**
 * Scene transitions are the cut itself becoming motion.
 *
 * One rule keeps this honest: a transition only moves the incoming scene. Our
 * timeline is sequential — scenes never overlap — so there is no outgoing frame
 * to blend with. A crossfade between two live scenes is a different feature
 * (it needs the timeline to hold both) and is not pretended here.
 *
 * The style is a pure function of the transition and the frame, so a test can
 * check it without Chrome, and the same frame always produces the same picture.
 */

export const ENTER_IDS = [
  'cut',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'fade',
  'zoom',
  'wipe-left',
  'wipe-right',
] as const;

export type SceneEnterId = (typeof ENTER_IDS)[number];

/**
 * Frames a transition takes. Sliding is a short, sharp move; opacity, scale and
 * a wipe need a beat longer to read as an entrance rather than a glitch.
 */
export const ENTER_FRAMES: Readonly<Record<SceneEnterId, number>> = {
  cut: 0,
  'slide-left': 9,
  'slide-right': 9,
  'slide-up': 9,
  'slide-down': 9,
  fade: 12,
  zoom: 12,
  'wipe-left': 12,
  'wipe-right': 12,
};

const SLIDE_FROM: Readonly<Record<string, readonly [number, number]>> = {
  'slide-left': [CANVAS.width, 0],
  'slide-right': [-CANVAS.width, 0],
  'slide-up': [0, CANVAS.height],
  'slide-down': [0, -CANVAS.height],
};

/** Scale a zoom enters from; 6 % reads as "arrived", not as a moving camera. */
const ZOOM_FROM = 1.06;

export interface SceneEnterStyle {
  readonly opacity?: number;
  readonly transform?: string;
  readonly transformOrigin?: string;
  readonly clipPath?: string;
}

function isEnterId(value: string): value is SceneEnterId {
  return (ENTER_IDS as readonly string[]).includes(value);
}

/**
 * Style for the incoming scene at `frame` (clip-local, 0 is the first frame of
 * the scene). Unknown names fall back to a cut: the schema rejects them earlier,
 * and a renderer must never invent motion it was not asked for.
 */
export function sceneEnterStyle(enter: string, frame: number): SceneEnterStyle {
  if (!isEnterId(enter)) {
    return {};
  }

  const total = ENTER_FRAMES[enter];

  if (total === 0) {
    return {};
  }

  const progress = Math.min(1, Math.max(0, frame / total));

  if (progress >= 1) {
    return {};
  }

  const from = SLIDE_FROM[enter];

  if (from !== undefined) {
    const x = from[0] * (1 - progress);
    const y = from[1] * (1 - progress);

    return { transform: `translate(${x}px, ${y}px)` };
  }

  switch (enter) {
    case 'fade':
      return { opacity: progress };
    case 'zoom':
      return {
        transform: `scale(${(ZOOM_FROM - (ZOOM_FROM - 1) * progress).toFixed(4)})`,
        transformOrigin: 'center center',
      };
    case 'wipe-left':
      /* The scene is revealed from its left edge: the inset shrinks to zero. */
      return { clipPath: `inset(0 ${((1 - progress) * 100).toFixed(2)}% 0 0)` };
    case 'wipe-right':
      return { clipPath: `inset(0 0 0 ${((1 - progress) * 100).toFixed(2)}%)` };
    default:
      return {};
  }
}

/** Frames the transition takes, for tests and for the gallery. */
export function sceneEnterFrames(enter: string): number {
  return isEnterId(enter) ? ENTER_FRAMES[enter] : 0;
}
