import { describe, expect, it } from 'vitest';
import { normalizeTexts, planFrames, type TreatmentScene } from './treatment.js';

function scene(id: string, frame: 'carrier' | 'statement'): TreatmentScene {
  return {
    id,
    function: 'proof',
    frame,
    intent: 'мысль',
    narration: 'Раз. Два.',
    seconds: 5,
    theme: 'studio-dark',
    texts: [{ text: 'Раз.', role: 'setup' }],
  };
}

describe('treatment: text plan', () => {
  it('keeps verbatim setup and punchline in order', () => {
    const { texts, fixes } = normalizeTexts(
      'За год набегает 35 880 ₽ — этого хватит на хороший отпуск.',
      [
        { text: 'За год набегает 35 880 ₽', role: 'setup' },
        { text: 'этого хватит на хороший отпуск.', role: 'punchline' },
      ],
    );

    expect(texts).toEqual([
      { text: 'За год набегает 35 880 ₽', role: 'setup' },
      { text: 'этого хватит на хороший отпуск.', role: 'punchline' },
    ]);
    expect(fixes).toHaveLength(0);
  });

  it('falls back to sentences when the plan paraphrases the line', () => {
    const { texts, fixes } = normalizeTexts('Первое. Второе.', [
      { text: 'выгодная покупка', role: 'setup' },
    ]);

    expect(texts).toEqual([
      { text: 'Первое.', role: 'setup' },
      { text: 'Второе.', role: 'punchline' },
    ]);
    expect(fixes).toContain('texts-from-sentences');
  });

  it('turns a number role without digits into a setup', () => {
    const { texts } = normalizeTexts('Три подписки.', [
      { text: 'Три подписки', role: 'number' },
    ]);

    expect(texts[0]?.role).toBe('setup');
  });
});

describe('treatment: frame rhythm', () => {
  it('never leaves three carriers in a row and keeps a quarter as statements', () => {
    const { frames, adjusted } = planFrames([
      scene('a', 'carrier'),
      scene('b', 'carrier'),
      scene('c', 'carrier'),
      scene('d', 'carrier'),
      scene('e', 'carrier'),
    ]);

    for (let index = 2; index < frames.length; index += 1) {
      expect(frames.slice(index - 2, index + 1).every((frame) => frame === 'carrier')).toBe(false);
    }

    expect(frames.filter((frame) => frame === 'statement').length).toBeGreaterThanOrEqual(2);
    expect(adjusted.length).toBeGreaterThan(0);
  });
});
