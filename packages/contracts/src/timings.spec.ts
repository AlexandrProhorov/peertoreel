import { describe, expect, it } from 'vitest';
import {
  derivedWordSchema,
  derivedWordsSchema,
} from './timings.js';

describe('timing contracts', () => {
  it('accepts a valid derived word', () => {
    expect(
      derivedWordSchema.safeParse({ text: 'слово', startSec: 0.2, endSec: 0.5 })
        .success,
    ).toBe(true);
  });

  it('accepts a zero-length word', () => {
    expect(
      derivedWordSchema.safeParse({ text: 'слово', startSec: 0.5, endSec: 0.5 })
        .success,
    ).toBe(true);
  });

  it('rejects a word that ends before it starts', () => {
    expect(
      derivedWordSchema.safeParse({ text: 'слово', startSec: 0.5, endSec: 0.2 })
        .success,
    ).toBe(false);
  });

  it('rejects a negative start', () => {
    expect(
      derivedWordSchema.safeParse({ text: 'слово', startSec: -1, endSec: 0.2 })
        .success,
    ).toBe(false);
  });

  it('rejects an empty word list entry', () => {
    expect(
      derivedWordSchema.safeParse({ text: '', startSec: 0, endSec: 0.2 })
        .success,
    ).toBe(false);
  });

  it('parses a word list', () => {
    expect(
      derivedWordsSchema.safeParse([
        { text: 'При', startSec: 0, endSec: 0.3 },
        { text: 'мир!', startSec: 0.4, endSec: 0.8 },
      ]).success,
    ).toBe(true);
  });
});
