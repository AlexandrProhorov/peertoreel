import { CANVAS } from './platform.js';
import { easeInOut, sceneEnterFrames } from './scene-enter.js';

/**
 * Scenes overlap during a transition and the timeline does not move.
 *
 * An incoming scene is mounted `overlap` frames before its own boundary and
 * ends on that boundary: the picture dissolves inside the last frames of the
 * previous scene instead of adding a pause between them. The film keeps the
 * length the arc planned, scene boundaries keep their places, and every
 * entrance is finished exactly when the scene formally starts.
 */

export interface PlacedScene<T> {
  readonly scene: T;
  readonly from: number;
  readonly durationInFrames: number;
  /** Frames this scene starts before its own boundary. */
  readonly overlap: number;
}

export interface PlacedTimeline<T> {
  readonly placed: readonly PlacedScene<T>[];
  readonly totalFrames: number;
}

interface TimedScene {
  readonly enter?: string;
  readonly durationSec: number;
}

function sceneFrames(scene: TimedScene, fps: number): number {
  return Math.max(1, Math.round(scene.durationSec * fps));
}

/**
 * Frames of overlap before a scene, clamped so neither side loses its own
 * frames: the overlap never exceeds the previous scene or the scene itself.
 */
function overlapBefore(
  scene: TimedScene,
  previousFrames: number,
  frames: number,
  isFirst: boolean,
): number {
  if (isFirst) {
    return 0;
  }

  return Math.min(
    sceneEnterFrames(scene.enter ?? 'cut'),
    Math.max(0, previousFrames - 1),
    Math.max(0, frames - 1),
  );
}

export function placeScenes<T extends TimedScene>(
  scenes: readonly T[],
  fps: number,
): PlacedTimeline<T> {
  const placed: Array<PlacedScene<T>> = [];
  let cursor = 0;
  let previousFrames = 0;

  scenes.forEach((scene, index) => {
    const frames = sceneFrames(scene, fps);
    const overlap = overlapBefore(scene, previousFrames, frames, index === 0);
    const from = cursor - overlap;

    /* The scene owns its frames plus the overlap it borrows from the previous
       one; the cursor advances by its own frames only, so boundaries stand. */
    placed.push({ scene, from, durationInFrames: frames + overlap, overlap });
    cursor += frames;
    previousFrames = frames;
  });

  return { placed, totalFrames: cursor };
}

function progressOf(
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): number | null {
  if (overlapFrames <= 0) {
    return null;
  }

  const start = durationInFrames - overlapFrames;

  if (localFrame <= start) {
    return null;
  }

  return Math.min(1, (localFrame - start) / overlapFrames);
}

/**
 * Opacity of the outgoing scene during a transition: a straight dissolve, eased
 * so neither side snaps in or out.
 */
export function sceneExitOpacity(
  nextEnter: string | undefined,
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): number {
  if (nextEnter === undefined || nextEnter === 'cut') {
    return 1;
  }

  const progress = progressOf(localFrame, durationInFrames, overlapFrames);

  return progress === null ? 1 : 1 - easeInOut(progress);
}

export interface SceneExitStyle {
  readonly opacity?: number;
  readonly transform?: string;
}

/** Where a slide enters from; the outgoing frame drifts the other way. */
const SLIDE_VECTORS: Readonly<Record<string, readonly [number, number]>> = {
  'slide-left': [CANVAS.width * 0.012, 0],
  'slide-right': [-CANVAS.width * 0.012, 0],
  'slide-up': [0, CANVAS.height * 0.012],
  'slide-down': [0, -CANVAS.height * 0.012],
};

/**
 * How the outgoing scene leaves. Every transition dissolves; a slide adds a
 * drift of the same size in the opposite direction, so the two frames move
 * together by a few pixels instead of one pushing the other off screen.
 */
export function sceneExitStyle(
  nextEnter: string | undefined,
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): SceneExitStyle {
  const progress = progressOf(localFrame, durationInFrames, overlapFrames);

  if (progress === null || nextEnter === undefined) {
    return {};
  }

  const eased = easeInOut(progress);
  const vector = SLIDE_VECTORS[nextEnter];

  if (vector === undefined) {
    return { opacity: 1 - eased };
  }

  const x = -vector[0] * eased;
  const y = -vector[1] * eased;

  return {
    transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
    opacity: 1 - eased,
  };
}
