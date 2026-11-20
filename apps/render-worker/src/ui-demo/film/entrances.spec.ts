import { describe, expect, it } from 'vitest';
import { MIN_NON_FADE_ENTRANCES, enforceEntranceVariety } from './entrances.js';

/**
 * A hard cut is not a transition: every scene after the first dissolves unless
 * the model asked for a slide, and the film keeps at least two slides so the
 * beats have some direction. The rule is applied to the assembled film, because
 * each scene prompt is blind to its neighbours.
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
    const scenes = film(['cut', 'fade', 'slide-up', 'slide-right', 'fade']);
    const result = enforceEntranceVariety(scenes);

    expect(result.changed).toEqual([]);
    expect(result.scenes).toBe(scenes);
  });

  it('turns a hard cut into a dissolve and keeps the first cut', () => {
    const scenes = film(['fade', 'cut', 'cut', 'cut']);
    const result = enforceEntranceVariety(scenes);

    /* The first scene always arrives on a cut; the rest dissolve. Two slides are
       still added below, so the installed list is not all dissolves. */
    expect(result.scenes[0]?.enter).toBe('cut');
    expect(result.changed).toContain(1);
    expect(result.changed).toContain(2);
  });

  it('adds slides to the longest scenes when the film has none', () => {
    const scenes = film(['cut', 'fade', 'fade', 'fade'], [4, 3, 9, 6]);
    const result = enforceEntranceVariety(scenes);
    const installed = result.scenes.map((scene) => scene.enter);

    expect(result.changed).toEqual([2, 3]);
    expect(installed).toEqual(['cut', 'fade', 'slide-up', 'slide-right']);
  });

  it('counts slides, not cuts, as variety', () => {
    const scenes = film(['cut', 'cut', 'cut', 'cut']);

    expect(MIN_NON_FADE_ENTRANCES).toBe(2);
    expect(enforceEntranceVariety(scenes).changed).toHaveLength(3);
  });

  it('cannot reach the quota with a single scene, and forces its cut', () => {
    const result = enforceEntranceVariety(film(['fade']));

    expect(result.scenes[0]?.enter).toBe('cut');
    expect(result.changed).toEqual([0]);
  });

  it('is deterministic for equal durations', () => {
    const scenes = film(['cut', 'fade', 'fade', 'fade'], [5, 5, 5, 5]);

    expect(enforceEntranceVariety(scenes).changed).toEqual([1, 2]);
    expect(enforceEntranceVariety(scenes).changed).toEqual(
      enforceEntranceVariety(scenes).changed,
    );
  });
});
