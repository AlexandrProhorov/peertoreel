import { describe, expect, it } from 'vitest';
import {
  PLAN_COMPACTION,
  TRANSITION_SECONDS,
  deriveTiming,
  endOfActionSec,
  sceneDurationSec,
  stretchTiming,
} from './timing-plan.js';

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

/**
 * A scene must finish. The plan is intent; the action and the time to read it
 * are the floor. These cases encode the accepted stable run and the defect in
 * `03-discount`, scene 1, which ended on the last frame of its animation.
 */
describe('scene duration', () => {
  it('ends after the last action, not on its final frame', () => {
    const cues = [{ at: 1.6, transition: 'scale' }];

    /* `scale` is not in the transition table, so the renderer treats it as 0.4 s
       and the action ends at 2.0 s. The plan says 2 s — the defect. */
    expect(endOfActionSec(cues)).toBe(2);
    expect(sceneDurationSec({ plannedSec: 2, cues })).toBe(2.8);
  });

  it('holds longer when the last step leaves text to read', () => {
    const text = sceneDurationSec({ plannedSec: 0, cues: [{ at: 4.9, transition: 'fill' }] });
    const motion = sceneDurationSec({ plannedSec: 0, cues: [{ at: 4.9, transition: 'move' }] });

    expect(text).toBeGreaterThan(motion);
    expect(motion).toBe(6.1);
  });

  it('honours the plan instead of packing it down', () => {
    const cues = [{ at: 7.6, transition: 'move' }];

    /* The action ends at 8.0 s and the hold adds 0.8 s; the plan's ten seconds
       are the film's timing contract and are not shortened silently. */
    expect(sceneDurationSec({ plannedSec: 10, cues })).toBe(
      Number((10 * PLAN_COMPACTION).toFixed(2)),
    );
  });

  it('fills a long plan by stretching the action, not with a frozen tail', () => {
    const action = deriveTiming([
      { element: 'a', transition: 'appear' },
      { element: 'a', transition: 'scale' },
    ]);
    const target = sceneDurationSec({ plannedSec: 10, cues: action.cues });
    const stretched = stretchTiming(action, target);
    const last = stretched.cues.at(-1);

    /* Ten seconds are filmed: the action is spread across them and ends before
       the hold, so no frame stands still for seconds. */
    expect(target).toBe(10);
    expect(stretched.durationSec).toBe(10);
    expect(last?.at).toBeGreaterThan(action.cues.at(-1)?.at ?? 0);
    expect((last?.at ?? 0) + (TRANSITION_SECONDS['scale'] ?? 0)).toBeLessThan(10);
  });

  it('never compresses the plan below the action', () => {
    const cues = [
      { at: 0, transition: 'appear' },
      { at: 2.6, transition: 'scale' },
    ];

    /* Ten percent of two seconds is 1.8 s, but the action ends at 3.0 s. */
    expect(sceneDurationSec({ plannedSec: 2, cues })).toBe(3.8);
  });
});
