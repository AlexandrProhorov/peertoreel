import { describe, expect, it } from 'vitest';
import {
  TikTokApiError,
  classifyErrorCode,
  classifyFailReason,
  toTikTokError,
} from './errors.js';

describe('TikTok error classification', () => {
  it('marks expired access tokens for refresh', () => {
    expect(classifyErrorCode(401, 'access_token_invalid')).toBe('token');
    expect(classifyFailReason('auth_removed')).toBe('token');
  });

  it('marks rate limits, 5xx and internal errors retryable', () => {
    expect(classifyErrorCode(429, 'rate_limit_exceeded')).toBe('retryable');
    expect(classifyErrorCode(503, 'internal_error')).toBe('retryable');
    expect(classifyFailReason('internal')).toBe('retryable');
    expect(classifyFailReason('video_pull_failed')).toBe('retryable');
  });

  it('never retries spam, auth and media validation failures', () => {
    expect(classifyErrorCode(403, 'spam_risk_too_many_posts')).toBe('terminal');
    expect(classifyFailReason('spam_risk_text')).toBe('terminal');
    expect(classifyFailReason('file_format_check_failed')).toBe('terminal');
    expect(classifyFailReason(null)).toBe('terminal');
  });

  it('normalizes network errors as retryable', () => {
    const error = toTikTokError(new TypeError('fetch failed'));

    expect(error).toBeInstanceOf(TikTokApiError);
    expect(error.kind).toBe('retryable');
    expect(error.code).toBe('network_error');
  });
});
