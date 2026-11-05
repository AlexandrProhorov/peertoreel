import { UnrecoverableError } from 'bullmq';

/**
 * Provider errors expose `retryable`. A terminal error (401, bad payload,
 * missing key) must not consume all BullMQ attempts; main.ts converts it to
 * `UnrecoverableError` and the job fails immediately.
 */
export function isTerminalProviderError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    (error as { retryable?: unknown }).retryable === false
  );
}

export function isUnrecoverableError(error: Error): boolean {
  return (
    error instanceof UnrecoverableError || error.name === 'UnrecoverableError'
  );
}

/** A terminal error is final immediately; a transient one only after retries. */
export function isFinalStageFailure(
  error: Error,
  attemptsMade: number,
  attempts: number,
): boolean {
  return isUnrecoverableError(error) || attemptsMade >= attempts;
}

