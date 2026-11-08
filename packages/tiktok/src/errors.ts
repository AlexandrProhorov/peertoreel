/**
 * `token` means "refresh the access token and retry once"; `retryable` means
 * "retry with backoff"; `terminal` means "do not retry, show the reason".
 */
export type TikTokErrorKind = 'token' | 'retryable' | 'terminal';

const RETRYABLE_CODES = new Set([
  'internal',
  'internal_error',
  'server_error',
  'rate_limit_exceeded',
]);

const TOKEN_CODES = new Set(['access_token_invalid']);

const RETRYABLE_FAIL_REASONS = new Set([
  'internal',
  'video_pull_failed',
  'photo_pull_failed',
]);

export interface TikTokApiErrorOptions {
  code: string;
  httpStatus?: number;
  logId?: string;
  kind?: TikTokErrorKind;
}

export class TikTokApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly logId: string | null;
  readonly kind: TikTokErrorKind;

  constructor(message: string, options: TikTokApiErrorOptions) {
    super(message);
    this.name = 'TikTokApiError';
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? 0;
    this.logId = options.logId ?? null;
    this.kind =
      options.kind ?? classifyErrorCode(options.httpStatus ?? 0, options.code);
  }
}

export function classifyErrorCode(
  httpStatus: number,
  code: string,
): TikTokErrorKind {
  if (TOKEN_CODES.has(code)) {
    return 'token';
  }

  if (httpStatus === 429 || httpStatus >= 500) {
    return 'retryable';
  }

  return RETRYABLE_CODES.has(code) ? 'retryable' : 'terminal';
}

export function classifyFailReason(failReason: string | null): TikTokErrorKind {
  if (!failReason) {
    return 'terminal';
  }

  if (failReason === 'auth_removed') {
    return 'token';
  }

  return RETRYABLE_FAIL_REASONS.has(failReason) ? 'retryable' : 'terminal';
}

/** Normalizes a fetch/network/parse error into the same shape. */
export function toTikTokError(error: unknown): TikTokApiError {
  if (error instanceof TikTokApiError) {
    return error;
  }

  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : 'TikTok request failed';

  return new TikTokApiError(message, {
    code: 'network_error',
    httpStatus: 0,
    kind: 'retryable',
  });
}
