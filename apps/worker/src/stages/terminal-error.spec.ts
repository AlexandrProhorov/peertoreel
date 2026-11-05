import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import {
  isFinalStageFailure,
  isTerminalProviderError,
  isUnrecoverableError,
} from './terminal-error.js';

describe('terminal error handling', () => {
  it('flags provider errors with retryable=false', () => {
    expect(isTerminalProviderError({ retryable: false })).toBe(true);
  });

  it('leaves retryable and ordinary errors alone', () => {
    expect(isTerminalProviderError({ retryable: true })).toBe(false);
    expect(isTerminalProviderError(new Error('boom'))).toBe(false);
    expect(isTerminalProviderError(null)).toBe(false);
  });

  it('recognizes BullMQ UnrecoverableError', () => {
    expect(isUnrecoverableError(new UnrecoverableError('terminal'))).toBe(true);
    expect(isUnrecoverableError(new Error('transient'))).toBe(false);
  });

  it('fails immediately on a terminal error and after the last attempt otherwise', () => {
    expect(isFinalStageFailure(new UnrecoverableError('terminal'), 1, 3)).toBe(
      true,
    );
    expect(isFinalStageFailure(new Error('429'), 1, 3)).toBe(false);
    expect(isFinalStageFailure(new Error('429'), 3, 3)).toBe(true);
  });
});
