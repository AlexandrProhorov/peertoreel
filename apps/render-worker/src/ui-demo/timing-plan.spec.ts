import { describe, expect, it } from 'vitest';
import { TRANSITION_SECONDS, deriveTiming, stretchTiming } from './timing-plan.js';

/**
 * Time is computed, not guessed: an ordered step list becomes cue times and a
 * scene length that always contains every animation.
 */
describe('derived timing', () => {
  it('starts the first step at zero and grows with each step', () => {
    const timing = deriveTiming([
      { element: 'a', transition: 'appear' },
      { element: 'a', transition: 'fill' },
    ]);

    expect(timing.cues[0]?.at).toBe(0);
    expect(timing.cues[1]?.at).toBe(
      Number(((TRANSITION_SECONDS['appear'] ?? 0) + 0.2).toFixed(2)),
    );
  });

  it('keeps every animation inside the scene', () => {
    const steps = [
      { element: 'a', transition: 'appear' },
      { element: 'b', transition: 'type' },
      { element: 'a', transition: 'break' },
    ] as const;
    const timing = deriveTiming(steps);

    for (const cue of timing.cues) {
      const seconds = TRANSITION_SECONDS[cue.transition] ?? 0;

      expect(cue.at + seconds).toBeLessThanOrEqual(timing.durationSec);
    }
  });

  it('is monotonic even when a step is instant', () => {
    const timing = deriveTiming([
      { element: 'a', transition: 'appear' },
      { element: 'a', transition: 'hold' },
      { element: 'a', transition: 'type' },
    ]);

    const times = timing.cues.map((cue) => cue.at);

    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it('a heavier step does not buy silence', () => {
    const light = deriveTiming([
      { element: 'a', transition: 'appear' },
      { element: 'a', transition: 'type' },
    ]);
    const heavy = deriveTiming([
      { element: 'a', transition: 'appear', weight: 3 },
      { element: 'a', transition: 'type' },
    ]);

    /* The weight marks the beat; the gap between events stays constant, because
       a pause is exactly the dead time the frame review measures. */
    expect(heavy.cues[1]?.at).toBe(light.cues[1]?.at);
  });

  it('stretches a short action across a longer planned scene', () => {    const action = deriveTiming([
      { element: 'a', transition: 'appear' },
      { element: 'a', transition: 'type' },
    ]);
    const stretched = stretchTiming(action, 8);
    const last = stretched.cues.at(-1);

    expect(stretched.durationSec).toBe(8);
    expect(stretched.cues[0]?.at).toBe(0);
    expect(last?.at).toBeGreaterThan(action.cues.at(-1)?.at ?? 0);
    expect((last?.at ?? 0) + (TRANSITION_SECONDS['type'] ?? 0)).toBeLessThanOrEqual(8);
  });

  it('never shortens a scene whose action is longer than the plan', () => {
    const action = deriveTiming([
      { element: 'a', transition: 'drag' },
      { element: 'a', transition: 'release' },
    ]);

    expect(stretchTiming(action, 2)).toBe(action);
  });
});
