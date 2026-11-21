import { describe, expect, it } from 'vitest';
import { cuesFromWords, toSrt, wordsFromAlignment, type AlignedChars } from './voice.js';

/**
 * Words and cues are derived from the provider's character alignment: the
 * subtitle must follow the voice, not the model's punctuation.
 */

function alignment(text: string, step = 0.1): AlignedChars {
  return {
    characters: [...text],
    character_start_times_seconds: [...text].map((_, index) => Number((index * step).toFixed(2))),
    character_end_times_seconds: [...text].map((_, index) =>
      Number(((index + 1) * step).toFixed(2)),
    ),
  };
}

describe('voice alignment', () => {
  it('groups characters into words with their own times', () => {
    const words = wordsFromAlignment('да нет', alignment('да нет'));

    expect(words.map((word) => word.word)).toEqual(['да', 'нет']);
    expect(words[0]?.start).toBe(0);
    expect(words[1]?.start).toBeCloseTo(0.3, 5);
  });

  it('splits long lines into short cues', () => {
    const text = 'один два три четыре пять шесть семь восемь';
    const words = wordsFromAlignment(text, alignment(text));
    const cues = cuesFromWords(words, 2);

    expect(cues.length).toBe(2);
    expect(cues[0]?.text.split(' ')).toHaveLength(6);
    expect(cues[0]?.start).toBeCloseTo(2, 5);
    expect(cues[1]?.start).toBeGreaterThan(2);
  });

  it('writes a valid SRT with millisecond stamps', () => {
    const words = wordsFromAlignment('да', alignment('да'));
    const srt = toSrt(cuesFromWords(words, 1.5));

    expect(srt).toContain('00:00:01,500 --> ');
    expect(srt.trim().endsWith('да')).toBe(true);
  });
});
