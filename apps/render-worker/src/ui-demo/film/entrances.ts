/**
 * Fade is the default entrance: light, unobtrusive, and it dominates the model's
 * choices, which is fine. Two things are not: a film cut together with hard cuts,
 * and the same slide repeated because each scene was written blind to its
 * neighbours.
 *
 * The prompt cannot enforce a film-wide rule, so the rule is applied here,
 * deterministically, on the assembled film.
 */

/** Slides a film needs besides the dissolves, so the beats have a direction. */
export const MIN_NON_FADE_ENTRANCES = 2;

/** Order of preference when a scene has to be varied. */
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
 * A slide direction is used once per film — two identical drifts in a row read as
 * a pattern — and the film keeps `MIN_NON_FADE_ENTRANCES` slides, assigned to the
 * longest scenes first.
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
  const changed = new Set<number>();

  next.forEach((scene, index) => {
    if (scene !== scenes[index]) {
      changed.add(index);
    }
  });

  /* One direction per film: a repeated slide is replaced by an unused one, or by
     a dissolve when the directions run out. */
  const used = new Set<string>();

  next.forEach((scene, index) => {
    const enter = scene.enter;

    if (index === 0 || enter === undefined || enter === 'fade') {
      return;
    }

    if (!used.has(enter)) {
      used.add(enter);

      return;
    }

    const replacement =
      VARIETY_ROTATION.find(
        (direction) => !used.has(direction) && direction !== next[index - 1]?.enter,
      ) ?? 'fade';

    used.add(replacement);
    next[index] = { ...scene, enter: replacement } as T;
    changed.add(index);
  });

  const missing = MIN_NON_FADE_ENTRANCES - next.filter(isVaried).length;

  if (missing <= 0 || next.length < 2) {
    return { scenes: changed.size === 0 ? scenes : next, changed: [...changed] };
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

    const enter =
      VARIETY_ROTATION.find((direction) => !used.has(direction)) ?? 'slide-up';

    used.add(enter);
    next[target.index] = { ...target.scene, enter } as T;
    changed.add(target.index);
  }

  return { scenes: next, changed: [...changed] };
}
