import type { UiEpisode } from '../spec.js';

/**
 * Diversity is set at the input, not hoped for from temperature.
 *
 * Every run gets a dramatic form and a carrier of magnitude. The form decides
 * how the film argues (before/after, accumulation, dialogue, process); the
 * carrier decides what stands for "more" (area, count, distance, brightness).
 * Temperature gave spread, but not structure: two runs could still choose the
 * same grid-and-progress-bar answer.
 */

export const DRAMATIC_FORMS = [
  'контраст до/после',
  'накопление',
  'диалог',
  'процесс',
  'столкновение',
] as const;

export const MAGNITUDE_CARRIERS = [
  'площадь',
  'количество',
  'расстояние',
  'яркость',
  'высота',
] as const;

export type DramaticForm = (typeof DRAMATIC_FORMS)[number];
export type MagnitudeCarrier = (typeof MAGNITUDE_CARRIERS)[number];

export interface Assignment {
  readonly form: DramaticForm;
  readonly carrier: MagnitudeCarrier;
}

/** Same slug → same assignment: a rerun of a topic keeps its brief. */
export function assignmentFor(slug: string): Assignment {
  let hash = 7;

  for (const char of slug) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return {
    form: DRAMATIC_FORMS[hash % DRAMATIC_FORMS.length] ?? DRAMATIC_FORMS[0],
    carrier:
      MAGNITUDE_CARRIERS[(hash >>> 3) % MAGNITUDE_CARRIERS.length] ??
      MAGNITUDE_CARRIERS[0],
  };
}

/**
 * The structural signature of a film: which primitives are used in which order
 * and how the scene moves. Copy and colour are left out — two films with the
 * same signature are the same answer to different topics.
 */
export function structuralSignature(episode: UiEpisode): string {
  return episode.scenes
    .map((scene) => {
      if (scene.device !== 'spec') {
        return scene.device;
      }

      const primitives = [...new Set(scene.spec.elements.map((element) => element.primitive))]
        .sort()
        .join('+');
      const motion = scene.spec.sequence
        .map((step) => step.transition)
        .filter((transition) => transition !== 'appear' && transition !== 'hold')
        .join('>');

      return `${primitives}/${motion}`;
    })
    .join('|');
}
