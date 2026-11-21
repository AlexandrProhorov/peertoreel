/**
 * Time is derived, not guessed.
 *
 * The model returns an ordered list of steps; this module turns it into absolute
 * cue times and a scene duration. A cue list can no longer promise 2.2 s inside a
 * 2 s scene, and a scene can no longer start with an empty frame: the first step
 * always lands on 0.
 *
 * Durations match the renderer's own animation lengths, otherwise a step would
 * be cut in half. Keep the two tables in sync.
 */

/** Seconds each transition takes on screen; 0 means "instant state change". */
export const TRANSITION_SECONDS: Readonly<Record<string, number>> = {
  appear: 0.3,
  disappear: 0.3,
  type: 0.8,
  fill: 0.8,
  draw: 0.8,
  break: 0.8,
  drag: 1,
  release: 0.7,
  activate: 0.3,
  hold: 0,
};

/** Breath between two steps, so a scene does not read as one flicker. */
const STEP_GAP_SECONDS = 0.2;
/** Room after the last step: a cut on the final frame looks like a glitch. */
const TAIL_SECONDS = 0.4;

/**
 * A scene must finish. The arc's seconds are the model's intent, not a hard cap:
 * a cut on the final frame of an animation reads as a glitch, so every scene
 * stays open after its last step. The hold depends on what the step leaves on
 * screen — typed text needs time to be read, a moved object needs a beat to land.
 * Measured against the accepted runs: the stable film kept 0.6–2.0 s tails, and
 * every clipped scene in the trimmed runs had a tail under 0.2 s.
 */
const MOTION_HOLD_SECONDS = 0.8;
const TEXT_HOLD_SECONDS = 1.6;
const TEXT_TRANSITIONS: ReadonlySet<string> = new Set(['type', 'fill', 'draw', 'break']);
/** Hard floor: below this even an instant state change is cut mid-motion. */
export const MIN_HOLD_SECONDS = 0.25;
/** The plan is packed by ten percent: shorter scenes, same rhythm of steps. */
export const PLAN_COMPACTION = 0.9;
/**
 * A plan may extend a scene past its action, but only this much. The arc is
 * written by the same model that wrote the steps, and it regularly promises ten
 * seconds for five steps; honouring that literally leaves four seconds of a
 * frozen frame, which the frame review flags as dead time. The stable run kept
 * the action and the beat cadence, not the promise.
 */
export const PLAN_EXTRA_SECONDS = 1;

export interface OrderedStep {
  readonly element: string;
  readonly transition: string;
  readonly text?: string;
  /** `tap`: the element that receives the press and reacts. */
  readonly target?: string;
  /** 1..3: a heavier step keeps the frame longer before the next one. */
  readonly weight?: number;
}

export interface DerivedTiming {
  readonly cues: ReadonlyArray<OrderedStep & { at: number }>;
  readonly durationSec: number;
}

export function deriveTiming(steps: readonly OrderedStep[]): DerivedTiming {
  const cues: Array<OrderedStep & { at: number }> = [];
  let cursor = 0;

  for (const step of steps) {
    const seconds = TRANSITION_SECONDS[step.transition] ?? 0.4;

    /* `weight` marks the key beat; it must not buy silence. A heavier step used
       to add a pause, and the pause is exactly the dead time the frame review
       found. */
    cues.push({ ...step, at: Number(cursor.toFixed(2)) });
    cursor += seconds + STEP_GAP_SECONDS;
  }

  /* After the loop the cursor sits one gap past the end of the last animation. */
  const endOfContent = Math.max(0, cursor - STEP_GAP_SECONDS);
  const durationSec = Math.max(1, Number((endOfContent + TAIL_SECONDS).toFixed(2)));

  return { cues, durationSec };
}

/**
 * Where the last animation stops. A scene shorter than this cuts a step in
 * half — the defect that ended `03-discount`, scene 1, exactly on its last
 * frame.
 */
export function endOfActionSec(
  cues: ReadonlyArray<{ readonly at: number; readonly transition: string }>,
): number {
  const last = cues.at(-1);

  return last === undefined
    ? 0
    : Number((last.at + (TRANSITION_SECONDS[last.transition] ?? 0.4)).toFixed(2));
}

export interface SceneTimingInput {
  /** The arc's seconds: the model's intent for this scene. */
  readonly plannedSec: number;
  readonly cues: ReadonlyArray<{ readonly at: number; readonly transition: string }>;
}

/** How long the last step must stay on screen before the cut. */
export function holdAfterSec(transition: string | undefined): number {
  return transition !== undefined && TEXT_TRANSITIONS.has(transition)
    ? TEXT_HOLD_SECONDS
    : MOTION_HOLD_SECONDS;
}

/**
 * The shortest scene that finishes: the action ends and the last frame holds.
 * Applied to every scene, including one whose cue times were fixed by the model.
 */
export function sceneFloorSec(
  cues: ReadonlyArray<{ readonly at: number; readonly transition: string }>,
): number {
  const contentEnd = endOfActionSec(cues);
  const floor = Math.max(
    contentEnd + holdAfterSec(cues.at(-1)?.transition),
    contentEnd + MIN_HOLD_SECONDS,
  );

  return Number(floor.toFixed(2));
}

/**
 * Scene length is derived, not chosen: the action finishes, the last frame
 * holds long enough to be read or to land, and the plan is packed by ten
 * percent. The planned seconds never cut a step and never win over the hold.
 */
export function sceneDurationSec(input: SceneTimingInput): number {
  const floor = sceneFloorSec(input.cues);
  const packed = input.plannedSec > 0 ? input.plannedSec * PLAN_COMPACTION : 0;

  return Number(Math.max(floor, Math.min(packed, floor + PLAN_EXTRA_SECONDS)).toFixed(2));
}

/**
 * A planned scene may be longer than its action: the arc asks for seven seconds,
 * the model writes four. Keeping `max(planned, action)` leaves a dead tail that
 * reads as a frozen frame; stretching the cue list keeps the plan and removes
 * the hang. The last animation still ends before the tail.
 */
export function stretchTiming(timing: DerivedTiming, targetSec: number): DerivedTiming {
  if (!(targetSec > timing.durationSec)) {
    return timing;
  }

  const endContent = Math.max(0.1, timing.durationSec - TAIL_SECONDS);
  const targetEnd = Math.max(endContent, targetSec - TAIL_SECONDS);
  const factor = targetEnd / endContent;

  return {
    durationSec: Number(targetSec.toFixed(2)),
    cues: timing.cues.map((cue) => ({
      ...cue,
      at: Number((cue.at * factor).toFixed(2)),
    })),
  };
}
