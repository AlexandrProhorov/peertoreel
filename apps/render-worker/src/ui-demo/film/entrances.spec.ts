import { describe, expect, it } from 'vitest';
import { MIN_NON_FADE_ENTRANCES, enforceEntranceVariety } from './entrances.js';

/**
 * Fade may dominate; a film of nothing but fades may not happen. The rule is
 * applied to the assembled film, because each scene prompt is blind to its
 * neighbours' entrances.
 */

interface Scene {
  readonly id: string;
  readonly enter?: string;
  readonly durationSec: number;
}

function film(entrances: readonly string[], seconds: readonly number[] = []): Scene[] {
  return entrances.map((enter, index) => ({
    id: `s${index + 1}`,
    enter,
    durationSec: seconds[index] ?? 5,
  }));
}

describe('entrance variety', () => {
  it('leaves a varied film untouched', () => {
    const scenes = film(['cut', 'zoom', 'fade', 'cut']);
    const result = enforceEntranceVariety(scenes);

    expect(result.changed).toEqual([]);
    expect(result.scenes).toBe(scenes);
  });

  it('varies the longest scene first when everything else is a fade', () => {
    const scenes = film(['cut', 'fade', 'fade', 'fade'], [4, 3, 9, 6]);
    const result = enforceEntranceVariety(scenes);
    const installed = result.scenes.map((scene) => scene.enter);

    /* The film already has one non-fade entrance (the cut), so one more is
       enough; the longest scene gets it. */
    expect(result.changed).toEqual([2]);
    expect(installed).toEqual(['cut', 'fade', 'slide-up', 'fade']);
  });

  it('stops at the quota and never touches the first scene', () => {
    const scenes = film(['fade', 'fade', 'fade']);
    const result = enforceEntranceVariety(scenes);

    expect(result.changed).toEqual([1, 2]);
    expect(result.scenes[0]?.enter).toBe('fade');
  });

  it('cannot reach the quota with a single scene, and says so by doing nothing', () => {
    expect(enforceEntranceVariety(film(['fade'])).changed).toEqual([]);
  });

  it('counts cut and slides as variety, not only bold transitions', () => {
    const scenes = film(['cut', 'cut', 'fade', 'fade']);

    expect(MIN_NON_FADE_ENTRANCES).toBe(2);
    expect(enforceEntranceVariety(scenes).changed).toEqual([]);
  });

  it('is deterministic for equal durations', () => {
    const scenes = film(['cut', 'fade', 'fade', 'fade'], [5, 5, 5, 5]);

    expect(enforceEntranceVariety(scenes).changed).toEqual([1]);
    expect(enforceEntranceVariety(scenes).changed).toEqual(
      enforceEntranceVariety(scenes).changed,
    );
  });
});
