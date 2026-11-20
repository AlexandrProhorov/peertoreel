import { describe, expect, it } from 'vitest';
import { MIN_NON_FADE_ENTRANCES, enforceEntranceVariety } from './entrances.js';

/**
 * A hard cut is not a transition: every scene after the first dissolves unless
 * the model asked for a slide. Directions are used once per film, and the film
 * keeps at least two slides so the beats have some shape.
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
    const result = enforceEntranceVariety(film(['fade', 'cut', 'cut', 'cut']));

    expect(result.scenes[0]?.enter).toBe('cut');
    expect(result.changed).toContain(1);
    expect(result.changed).toContain(2);
  });

  it('adds slides to the longest scenes when the film has none', () => {
    const scenes = film(['cut', 'fade', 'fade', 'fade'], [4, 3, 9, 6]);
    const result = enforceEntranceVariety(scenes);

    expect(result.changed).toEqual([2, 3]);
    expect(result.scenes.map((scene) => scene.enter)).toEqual([
      'cut',
      'fade',
      'slide-up',
      'slide-right',
    ]);
  });

  it('never repeats a slide direction', () => {
    const result = enforceEntranceVariety(
      film(['cut', 'slide-up', 'slide-up', 'slide-down', 'slide-down']),
    );

    expect(result.scenes.map((scene) => scene.enter)).toEqual([
      'cut',
      'slide-up',
      'slide-right',
      'slide-down',
      'slide-left',
    ]);
  });

  it('falls back to a dissolve when every direction is taken', () => {
    const result = enforceEntranceVariety(
      film(['cut', 'slide-up', 'slide-right', 'slide-down', 'slide-left', 'slide-up']),
    );

    expect(result.scenes[5]?.enter).toBe('fade');
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
