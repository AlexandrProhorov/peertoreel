import type { Script } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { anchorTokens, deriveVisualAnchor } from './anchor.js';

function script(directions: string[], anchor?: string): Script {
  return {
    title: 'Тестовый сценарий',
    ...(anchor ? { visualAnchor: anchor } : {}),
    hook: 'Хук',
    beats: directions.map((visualDirection) => ({
      text: 'Текст',
      visualDirection,
      durationSec: 5,
    })),
    cta: 'Финал',
  };
}

describe('deriveVisualAnchor', () => {
  it('keeps an explicit anchor', () => {
    expect(deriveVisualAnchor(script(['cave painting'], 'dog'))).toBe('dog');
  });

  it('derives the repeated subject from old scripts', () => {
    expect(
      deriveVisualAnchor(
        script([
          'ancient human dog cave painting',
          'scientist dog experiment facial expression',
          'dog owner hugging brain',
          'dog following pointing gesture',
          'dog sniffing detection',
          'dog protecting owner',
          'happy dog running sunset',
        ]),
      ),
    ).toBe('dog');
  });

  it('prefers a repeated bigram over its individual words', () => {
    expect(
      deriveVisualAnchor(
        script([
          'black hole space',
          'black hole accretion disk',
          'scientist telescope',
          'black hole stars',
        ]),
      ),
    ).toBe('black hole');
  });

  it('returns null when directions share no subject', () => {
    expect(deriveVisualAnchor(script(['blue sky', 'green field']))).toBeNull();
  });
});

describe('anchorTokens', () => {
  it('splits a phrase and removes stop words', () => {
    expect(anchorTokens('black hole')).toEqual(['black', 'hole']);
    expect(anchorTokens('dog in the snow')).toEqual(['dog', 'snow']);
    expect(anchorTokens(null)).toEqual([]);
  });
});
