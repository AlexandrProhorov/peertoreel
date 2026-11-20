/**
 * Fade is the default entrance: light, unobtrusive, and it dominates the model's
 * choices, which is fine. What is not fine is a film cut together with hard cuts,
 * or one where every transition is the same gesture.
 *
 * The prompt cannot enforce a film-wide rule: every scene is generated on its
 * own and knows nothing about its neighbours. So the rule is applied here,
 * deterministically, on the assembled film.
 */

/** Slides a film needs besides the dissolves, so the cuts read as beats. */
export const MIN_NON_FADE_ENTRANCES = 2;

/** Order of preference when a scene has to be varied: a direction, nothing more. */
const VARIETY_ROTATION = ['slide-up', 'slide-right', 'slide-down', 'slide-left'] as const;

/** Everything the rule needs from a scene; the episode union satisfies it. */
export interface EnterableScene {
  readonly enter?: string;
  readonly durationSec: number;
}

export interface EntranceVarietyResult<T> {
  readonly scenes: readonly T[];
  /** Scene indices whose entrance was replaced, for the report. */
  readonly changed: readonly number[];
}

function isVaried(scene: EnterableScene): boolean {
  return scene.enter !== undefined && scene.enter !== 'fade' && scene.enter !== 'cut';
}

/**
 * A hard cut is not a transition. The first scene arrives on a cut by
 * construction; every other scene dissolves unless the model asked for a slide.
 * On top of that the film keeps `MIN_NON_FADE_ENTRANCES` slides, assigned to the
 * longest scenes first: a drift on a three-second scene is visible, on a
 * six-frame one it is not.
 */
export function enforceEntranceVariety<T extends EnterableScene>(
  scenes: readonly T[],
): EntranceVarietyResult<T> {
  const next = scenes.map((scene, index) => {
    if (index === 0) {
      return (scene.enter === 'cut' ? scene : { ...scene, enter: 'cut' }) as T;
    }

    return (scene.enter === undefined || scene.enter === 'cut'
      ? { ...scene, enter: 'fade' }
      : scene) as T;
  });
  const changed = new Set<number>(
    next
      .map((scene, index) => (scene === scenes[index] ? -1 : index))
      .filter((index) => index >= 0),
  );
  const missing = MIN_NON_FADE_ENTRANCES - next.filter(isVaried).length;

  if (changed.size === 0 && missing <= 0) {
    return { scenes, changed: [] };
  }

  if (missing <= 0 || next.length < 2) {
    return { scenes: next, changed: [...changed] };
  }

  const candidates = next
    .map((scene, index) => ({ scene, index }))
    .slice(1)
    .filter(({ scene }) => !isVaried(scene))
    .sort(
      (left, right) =>
        right.scene.durationSec - left.scene.durationSec || left.index - right.index,
    );

  for (let step = 0; step < Math.min(missing, candidates.length); step += 1) {
    const target = candidates[step];

    if (target === undefined) {
      break;
    }

    const enter = VARIETY_ROTATION[step % VARIETY_ROTATION.length] ?? 'slide-up';

    next[target.index] = { ...target.scene, enter };
    changed.add(target.index);
  }

  return { scenes: next, changed: [...changed] };
}


