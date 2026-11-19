/**
 * Fade is the default entrance: light, unobtrusive, and it dominates the model's
 * choices, which is fine. What is not fine is a film where every cut is a fade —
 * the scenes stop reading as separate beats.
 *
 * The prompt cannot enforce a film-wide quota: every scene is generated on its
 * own and knows nothing about its neighbours' entrances. So the rule is applied
 * here, deterministically, on the assembled film. A scene the model already
 * varied is never touched.
 */

/** Entrances a film needs besides fade, so the cuts read as cuts. */
export const MIN_NON_FADE_ENTRANCES = 2;

/** Order of preference when a scene has to be varied: bold but readable. */
const VARIETY_ROTATION = ['zoom', 'slide-up', 'wipe-left', 'slide-right'] as const;

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

function variedCount(scenes: readonly EnterableScene[]): number {
  /* The first scene is a cut by construction, so it already counts. */
  return scenes.filter((scene) => (scene.enter ?? 'cut') !== 'fade').length;
}

/**
 * Guarantees `MIN_NON_FADE_ENTRANCES` non-fade entrances. When the model used
 * too many fades, the longest scenes get a varied entrance first: a zoom on a
 * three-second scene is visible, a zoom on a six-frame one is not.
 */
export function enforceEntranceVariety<T extends EnterableScene>(
  scenes: readonly T[],
): EntranceVarietyResult<T> {
  const missing = MIN_NON_FADE_ENTRANCES - variedCount(scenes);

  if (missing <= 0 || scenes.length < 2) {
    return { scenes, changed: [] };
  }

  /* Candidate scenes: everything after the first, longest first. Ties keep the
     episode order, so the result does not depend on a sort implementation. */
  const candidates = scenes
    .map((scene, index) => ({ scene, index }))
    .slice(1)
    .filter(({ scene }) => (scene.enter ?? 'cut') === 'fade')
    .sort(
      (left, right) =>
        right.scene.durationSec - left.scene.durationSec || left.index - right.index,
    );

  const next = [...scenes];
  const changed: number[] = [];

  for (let step = 0; step < Math.min(missing, candidates.length); step += 1) {
    const target = candidates[step];

    if (target === undefined) {
      break;
    }

    const enter = VARIETY_ROTATION[step % VARIETY_ROTATION.length] ?? 'zoom';

    next[target.index] = { ...target.scene, enter };
    changed.push(target.index);
  }

  return { scenes: next, changed };
}
