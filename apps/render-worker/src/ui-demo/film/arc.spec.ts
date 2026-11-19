import { describe, expect, it } from 'vitest';
import { arcSchema } from './arc.js';

/**
 * The arc is prose: the model describes the visual action in one or two
 * sentences. Limits below what a model naturally writes rejected three valid
 * arcs in a row, and the film never started.
 */
describe('arc contract', () => {
  const scene = (action: string, seconds = 8) => ({
    id: 'hook',
    role: 'крючок',
    action,
    intent: 'зритель понимает механизм',
    seconds,
    theme: 'studio-dark' as const,
  });

  it('accepts a long visual action', () => {
    const action = 'Вокруг первой мысли '.repeat(15).trim();

    expect(action.length).toBeGreaterThan(250);
    expect(() =>
      arcSchema.parse({
        thesis: 'Подписки копятся быстрее, чем приносят пользу',
        scenes: [scene(action), scene('вторая сцена'), scene('третья сцена')],
      }),
    ).not.toThrow();
  });

  it('still rejects a film outside the 24..32 second window', () => {
    expect(() =>
      arcSchema.parse({
        thesis: 'мысль',
        scenes: [scene('a', 2), scene('b', 2), scene('c', 2)],
      }),
    ).toThrow(/25–30/);
  });
});
