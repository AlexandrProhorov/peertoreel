import { describe, expect, it } from 'vitest';
import { codeOf, hintFor, issuesWithHints, REPEATED_COMPOSITION } from './hints.js';

/**
 * A hint is a sentence the model can act on. These cases pin that a code is
 * found in both shapes the validator produces, and that an unknown code keeps
 * the original message instead of inventing advice.
 */

describe('retry hints', () => {
  it('reads a plain validator code', () => {
    expect(codeOf('grid-overlap: text sits on cells')).toBe('grid-overlap');
  });

  it('reads a quality code with its namespace', () => {
    expect(codeOf('quality/text-contrast: 2.1 < 4.5')).toBe('quality/text-contrast');
  });

  it('adds the advice without losing the message', () => {
    const [line] = issuesWithHints(['typography-fit: claim needs 200px in 80px']);

    expect(line).toContain('typography-fit: claim needs 200px in 80px');
    expect(line).toContain('сократи фразу');
  });

  it('leaves an unknown code alone', () => {
    expect(issuesWithHints(['some-new-code: detail'])).toEqual(['some-new-code: detail']);
    expect(hintFor(null)).toBeNull();
  });

  it('tells the model to change the composition, not the words', () => {
    expect(REPEATED_COMPOSITION).toContain('набор примитивов');
  });
});
