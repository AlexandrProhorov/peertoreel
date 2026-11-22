import { describe, expect, it } from 'vitest';
import {
  allocateWordTimings,
  splitForTts,
} from './tts-fallback.js';

describe('Google TTS spike fallback (pure timing helpers)', () => {
  it('splits narration at word boundaries and preserves words', () => {
    const text =
      'Первый большой кусок текста для озвучки. Второй кусок тоже достаточно длинный, чтобы проверить разбиение.';
    const chunks = splitForTts(text, 40);

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40);
      expect(chunk.trim()).toBe(chunk);
    }

    expect(chunks.join(' ')).toBe(text);
  });

  it('slices a single word longer than the limit', () => {
    const chunks = splitForTts('а'.repeat(25), 10);

    expect(chunks).toEqual(['а'.repeat(10), 'а'.repeat(10), 'а'.repeat(5)]);
  });

  it('allocates contiguous word times inside one scene window', () => {
    const words = allocateWordTimings('Раз два три', 2, 3);

    expect(words).toHaveLength(3);
    expect(words[0]?.startSec).toBe(2);
    expect(words[0]?.endSec).toBe(words[1]?.startSec);
    expect(words[1]?.endSec).toBe(words[2]?.startSec);
    expect(words[2]?.endSec).toBeCloseTo(5, 3);
  });

  it('weights longer words with more time', () => {
    const words = allocateWordTimings('Я молекула', 0, 3);

    expect(words[1]!.endSec - words[1]!.startSec).toBeGreaterThan(
      words[0]!.endSec - words[0]!.startSec,
    );
  });

  it('returns no words for empty text', () => {
    expect(allocateWordTimings('   ', 0, 10)).toEqual([]);
  });
});
