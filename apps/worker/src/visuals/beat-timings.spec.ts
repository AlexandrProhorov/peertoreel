import type { Script } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import type { DerivedWord } from '../tts/word-timings.js';
import { deriveBeatTimings } from './beat-timings.js';

const script: Script = {
  title: 'Почему небо синее',
  hook: 'Первый кадр',
  beats: [
    {
      text: 'Второй кадр',
      visualDirection: 'second visual',
      durationSec: 5,
    },
    {
      text: 'Третий кадр',
      visualDirection: 'third visual',
      durationSec: 6,
    },
  ],
  cta: 'Подпишись',
};

function wordsFrom(entries: Array<[string, number, number]>): DerivedWord[] {
  return entries.map(([text, startSec, endSec]) => ({ text, startSec, endSec }));
}

describe('deriveBeatTimings', () => {
  it('aligns hook, beats and CTA with the spoken words', () => {
    const timings = deriveBeatTimings(
      script,
      wordsFrom([
        ['Первый', 0, 0.5],
        ['кадр', 0.5, 1],
        ['Второй', 1.2, 1.7],
        ['кадр,', 1.7, 2.2],
        ['Третий', 2.5, 3],
        ['КАДР', 3, 3.5],
        ['Подпишись', 3.8, 4.5],
      ]),
    );

    expect(timings).toEqual([
      {
        part: 'hook',
        beatIndex: null,
        text: 'Первый кадр',
        visualDirection: 'second visual',
        startSec: 0,
        endSec: 1.2,
      },
      {
        part: 'beat',
        beatIndex: 0,
        text: 'Второй кадр',
        visualDirection: 'second visual',
        startSec: 1.2,
        endSec: 2.5,
      },
      {
        part: 'beat',
        beatIndex: 1,
        text: 'Третий кадр',
        visualDirection: 'third visual',
        startSec: 2.5,
        endSec: 3.8,
      },
      {
        part: 'cta',
        beatIndex: null,
        text: 'Подпишись',
        visualDirection: 'third visual',
        startSec: 3.8,
        endSec: 4.5,
      },
    ]);
  });

  it('ignores punctuation and case differences', () => {
    const timings = deriveBeatTimings(
      script,
      wordsFrom([
        ['ПЕРВЫЙ,', 0, 0.5],
        ['КАДР!', 0.5, 1],
        ['второй', 1, 1.5],
        ['кадр', 1.5, 2],
        ['третий', 2, 2.5],
        ['кадр', 2.5, 3],
        ['подпишись', 3, 3.5],
      ]),
    );

    expect(timings.map((timing) => timing.part)).toEqual([
      'hook',
      'beat',
      'beat',
      'cta',
    ]);
    expect(timings.at(-1)?.endSec).toBe(3.5);
  });

  it('falls back to planned durations scaled to the audio when text diverges', () => {
    const timings = deriveBeatTimings(
      script,
      wordsFrom([
        ['Совсем', 0, 1],
        ['другой', 1, 2],
        ['текст', 2, 3],
      ]),
    );

    // Weights: hook 3, beats 5 + 6, CTA 3 = 17; audio is 3 seconds.
    const scale = 3 / 17;

    expect(timings[0]?.startSec).toBe(0);
    expect(timings[0]?.endSec).toBeCloseTo(3 * scale, 6);
    expect(timings[1]?.endSec).toBeCloseTo(8 * scale, 6);
    expect(timings[2]?.endSec).toBeCloseTo(14 * scale, 6);
    expect(timings[3]?.endSec).toBe(3);
  });

  it('covers leading and trailing silence', () => {
    const timings = deriveBeatTimings(
      script,
      wordsFrom([
        ['Первый', 0.5, 0.8],
        ['кадр', 0.8, 1.1],
        ['Второй', 1.1, 1.4],
        ['кадр', 1.4, 1.7],
        ['Третий', 1.7, 2],
        ['кадр', 2, 2.3],
        ['Подпишись', 2.3, 2.6],
      ]),
    );

    expect(timings[0]?.startSec).toBe(0);
    expect(timings.at(-1)?.endSec).toBe(2.6);
  });

  it('fails on an empty alignment', () => {
    expect(() => deriveBeatTimings(script, [])).toThrow('word_timings пуст');
  });

  it('fails when the alignment contains no usable words', () => {
    expect(() =>
      deriveBeatTimings(script, wordsFrom([['—', 0, 1]])),
    ).toThrow('word_timings не содержит слов');
  });
});
