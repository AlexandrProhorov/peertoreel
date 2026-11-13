/**
 * Provider error classification (root AGENTS §7).
 *
 * Terminal errors are never retried (bad request, auth, policy); transient ones
 * (rate limit, timeout, 5xx) are retried with backoff by the caller's queue.
 */

export type ProviderErrorKind = 'retryable' | 'terminal';

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export function classifyProviderStatus(status: number): ProviderErrorKind {
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return 'retryable';
  }

  return status >= 500 ? 'retryable' : 'terminal';
}

/** Narrow a non-2xx response into a typed, classified error. */
export function providerHttpError(
  provider: string,
  status: number,
  body: string,
): ProviderHttpError {
  const detail = body.trim().slice(0, 300);
  const kind = classifyProviderStatus(status);

  return new ProviderHttpError(
    provider,
    status,
    kind,
    `${provider} responded ${status} (${kind})${detail.length > 0 ? `: ${detail}` : ''}`,
  );
}

/** Network failures have no status; they are always worth a retry. */
export function providerNetworkError(
  provider: string,
  error: unknown,
): ProviderHttpError {
  const message = error instanceof Error ? error.message : String(error);

  return new ProviderHttpError(
    provider,
    0,
    'retryable',
    `${provider} request failed: ${message}`,
  );
}
