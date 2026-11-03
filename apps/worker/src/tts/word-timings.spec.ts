import { describe, expect, it } from 'vitest';
import { isRetryableStatus } from './elevenlabs.js';
import { deriveWordTimings } from './word-timings.js';

const alignment = {
  characters: ['П', 'р', 'и', ' ', 'м', 'и', 'р', '!', ' ', 'Д', 'а'],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.35, 0.5, 0.6, 0.7, 0.8, 0.85, 1.0, 1.2],
};

describe('word timings', () => {
  it('derives word boundaries from character alignment', () => {
    expect(deriveWordTimings(alignment)).toEqual([
      { text: 'При', startSec: 0, endSec: 0.3 },
      { text: 'мир!', startSec: 0.4, endSec: 0.8 },
      { text: 'Да', startSec: 0.9, endSec: 1.2 },
    ]);
  });

  it('fails on an empty alignment', () => {
    expect(() =>
      deriveWordTimings({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      }),
    ).toThrow('Alignment produced no words');
  });

  it('tolerates mismatched array lengths', () => {
    const words = deriveWordTimings({
      characters: ['П', 'р', 'и'],
      character_start_times_seconds: [0, 0.1],
      character_end_times_seconds: [0.1, 0.2],
    });

    expect(words).toEqual([{ text: 'Пр', startSec: 0, endSec: 0.2 }]);
  });
});

describe('tts error classification', () => {
  it('retries only transient statuses', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});
