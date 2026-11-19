import { sceneEnterFrames } from './scene-enter.js';
import { CANVAS } from './platform.js';

/**
 * Scenes overlap during a transition.
 *
 * The old timeline was strictly sequential: a scene ended, the next one entered
 * over black. That gave the film a visible black beat on every cut. A dissolve
 * needs both scenes on screen at once, so the incoming scene starts before the
 * outgoing one ends and the film becomes shorter by the sum of the overlaps.
 *
 * The overlap is the transition's own length: a nine-frame slide covers nine
 * frames of the previous scene, a twelve-frame fade dissolves over twelve. A cut
 * keeps the timeline sequential.
 */

export interface PlacedScene<T> {
  readonly scene: T;
  readonly from: number;
  readonly durationInFrames: number;
  /** Frames this scene starts before the previous one ends. */
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

/**
 * Frames of overlap before `scene`, clamped so a scene never swallows its
 * neighbour: both sides must keep at least one frame of their own.
 */
function overlapBefore(
  scene: TimedScene,
  previousEnd: number,
  frames: number,
  isFirst: boolean,
): number {
  if (isFirst) {
    return 0;
  }

  return Math.min(
    sceneEnterFrames(scene.enter ?? 'cut'),
    Math.max(0, previousEnd - 1),
    Math.max(0, frames - 1),
  );
}

export function placeScenes<T extends TimedScene>(
  scenes: readonly T[],
  fps: number,
): PlacedTimeline<T> {
  const placed: Array<PlacedScene<T>> = [];
  let cursor = 0;

  scenes.forEach((scene, index) => {
    const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));
    const overlap = overlapBefore(scene, cursor, durationInFrames, index === 0);
    const from = cursor - overlap;

    placed.push({ scene, from, durationInFrames, overlap });
    cursor = from + durationInFrames;
  });

  return { placed, totalFrames: cursor };
}

/**
 * Opacity of the outgoing scene during a transition. Every transition is a
 * dissolve as well as a move: the old frame dims while the new one brightens, so
 * the cut never reads as a hard swap and no fully black frame is shown.
 */
export function sceneExitOpacity(
  nextEnter: string | undefined,
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): number {
  if (nextEnter === undefined || nextEnter === 'cut' || overlapFrames <= 0) {
    return 1;
  }

  const start = durationInFrames - overlapFrames;

  if (localFrame <= start) {
    return 1;
  }

  return Math.max(0, 1 - (localFrame - start) / overlapFrames);
}

export interface SceneExitStyle {
  readonly opacity?: number;
  readonly transform?: string;
  readonly transformOrigin?: string;
}

/** Where a slide enters from, and therefore where it pushes the old scene. */
const SLIDE_VECTORS: Readonly<Record<string, readonly [number, number]>> = {
  'slide-left': [CANVAS.width, 0],
  'slide-right': [-CANVAS.width, 0],
  'slide-up': [0, CANVAS.height],
  'slide-down': [0, -CANVAS.height],
};

function transitionProgress(
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
 * How the outgoing scene leaves during a transition. A slide pushes: the old
 * frame travels in the same direction the new one comes from, so the two frames
 * stay edge to edge and no black ever shows between them. A wipe reveals in
 * place, a fade dims, a zoom drifts back.
 */
export function sceneExitStyle(
  nextEnter: string | undefined,
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): SceneExitStyle {
  const progress = transitionProgress(localFrame, durationInFrames, overlapFrames);

  if (progress === null || nextEnter === undefined) {
    return {};
  }

  if (nextEnter === 'fade') {
    return { opacity: 1 - progress };
  }

  const vector = SLIDE_VECTORS[nextEnter];

  if (vector !== undefined) {
    /* The incoming scene starts at `-vector`; the outgoing leaves along it. */
    const x = vector[0] * -progress;
    const y = vector[1] * -progress;

    return { transform: `translate(${x}px, ${y}px)`, opacity: 1 - progress };
  }

  if (nextEnter === 'zoom') {
    return {
      transform: `scale(${(1 + 0.04 * progress).toFixed(4)})`,
      transformOrigin: 'center center',
      opacity: 1 - progress,
    };
  }

  /* A wipe reveals the old frame; it dims with the dissolve like the rest. */
  return { opacity: 1 - progress };
}
