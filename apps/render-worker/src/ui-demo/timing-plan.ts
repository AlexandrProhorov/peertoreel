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

export interface OrderedStep {
  readonly element: string;
  readonly transition: string;
  readonly text?: string;
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
