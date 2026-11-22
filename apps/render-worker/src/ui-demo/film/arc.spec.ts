import { describe, expect, it } from 'vitest';
import { arcPlanFor, arcSchema, arcSchemaFor } from './arc.js';

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
    narration: 'Голос объясняет мысль сцены.',
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

  it('rejects narration that describes the frame instead of speaking', () => {
    expect(() =>
      arcSchema.parse({
        thesis: 'мысль',
        scenes: [
          scene('a', 8),
          { ...scene('b', 8), narration: 'Надпись «0%» тает.' },
          scene('c', 8),
        ],
      }),
    ).toThrow(/не описывает картинку/);
  });

  it('keeps narration that names the thought', () => {
    expect(() =>
      arcSchema.parse({
        thesis: 'мысль',
        scenes: [
          scene('a', 8),
          {
            ...scene('b', 8),
            narration: 'Обещание нуля процентов исчезает, а переплата остаётся.',
          },
          scene('c', 8),
        ],
      }),
    ).not.toThrow();
  });

  it('still rejects a film outside the 24..32 second window', () => {
    expect(() =>
      arcSchema.parse({
        thesis: 'мысль',
        scenes: [scene('a', 2), scene('b', 2), scene('c', 2)],
      }),
    ).toThrow(/24–32/);
  });

  it('plans a minute-long film: more scenes and a wider window', () => {
    const plan = arcPlanFor(60);

    expect(plan.seconds).toEqual({ min: 55, max: 65 });
    expect(plan.scenes.min).toBe(10);
    expect(plan.scenes.max).toBe(12);

    const minute = arcSchemaFor(plan.seconds);
    const scenes = Array.from({ length: 9 }, (_, index) => scene(`действие ${index}`, 7));

    expect(() =>
      minute.parse({ thesis: 'минутный фильм', scenes }),
    ).not.toThrow();
    expect(() => minute.parse({ thesis: 'короткий', scenes: scenes.slice(0, 3) })).toThrow(
      /55–65/,
    );
  });
});
