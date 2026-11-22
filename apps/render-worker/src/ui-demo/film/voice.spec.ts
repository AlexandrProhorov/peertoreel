import { describe, expect, it } from 'vitest';
import {
  CLAUSE_PAUSE_SEC,
  SENTENCE_PAUSE_SEC,
  cuesFromWords,
  estimateWords,
  placeLines,
  splitNarrationLines,
  toSrt,
  wordsFromAlignment,
  type AlignedChars,
} from './voice.js';

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

describe('estimated word times', () => {
  it('spreads the words over the measured audio', () => {
    const words = estimateWords('раз два три', 3);

    expect(words).toHaveLength(3);
    expect(words[0]?.start).toBe(0);
    expect(words.at(-1)?.end).toBeCloseTo(3, 3);
    expect(words[1]?.start).toBeGreaterThan(0);
  });

  it('gives a short word a visible minimum', () => {
    const words = estimateWords('а оченьдлинноеслово', 2);

    expect(words[0]?.end ?? 0).toBeGreaterThanOrEqual(0.12);
  });

  it('gives a punctuation pause to the word that carries it', () => {
    const words = estimateWords('да, нет.', 2);
    const first = (words[0]?.end ?? 0) - (words[0]?.start ?? 0);
    const second = (words[1]?.end ?? 0) - (words[1]?.start ?? 0);

    expect(second).toBeGreaterThan(first);
    expect(words.at(-1)?.end).toBeCloseTo(2, 3);
  });
});

describe('narration lines', () => {
  it('cuts at sentence boundaries and marks a full stop as a beat', () => {
    const lines = splitNarrationLines('Первое предложение. Второе предложение.');

    expect(lines.map((line) => line.text)).toEqual([
      'Первое предложение.',
      'Второе предложение.',
    ]);
    expect(lines[0]?.pauseAfterSec).toBe(SENTENCE_PAUSE_SEC);
  });

  it('splits an over-long sentence at the comma nearest the middle', () => {
    const narration =
      'Чем дольше рассрочка, тем дальше уезжает итоговая сумма от настоящей цены, и это расстояние стоит денег.';
    const lines = splitNarrationLines(narration);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.text.length <= 80)).toBe(true);
    expect(lines[0]?.text.endsWith(',')).toBe(true);
    expect(lines[0]?.pauseAfterSec).toBe(CLAUSE_PAUSE_SEC);
    expect(lines.map((line) => line.text).join(' ')).toBe(narration);
  });

  it('falls back to a word boundary when no clause separator is left', () => {
    const narration = Array.from({ length: 20 }, () => 'слово').join(' ');
    const lines = splitNarrationLines(narration);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.text.length <= 80)).toBe(true);
    expect(lines.map((line) => line.text).join(' ')).toBe(narration);
  });

  it('returns nothing for empty narration', () => {
    expect(splitNarrationLines('   ')).toEqual([]);
  });
});

describe('line placement', () => {
  it('places lines with pauses between them and none after the last', () => {
    const lines = splitNarrationLines('Первая строка. Вторая строка.');
    const { cues, totalSec } = placeLines(lines, [0.8, 1.2]);

    expect(cues[0]).toEqual({ text: 'Первая строка.', startSec: 0, endSec: 0.8 });
    expect(cues[1]?.startSec).toBeCloseTo(1.1, 3);
    expect(cues[1]?.endSec).toBeCloseTo(2.3, 3);
    expect(totalSec).toBeCloseTo(2.3, 3);
  });

  it('rejects a line without a measured duration', () => {
    expect(() => placeLines(splitNarrationLines('Одна строка.'), [])).toThrow();
  });
});
