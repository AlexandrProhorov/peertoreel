import { describe, expect, it } from 'vitest';
import { createCodeChallenge, createCodeVerifier } from './pkce.js';

describe('PKCE', () => {
  it('creates an RFC 7636 verifier', () => {
    const verifier = createCodeVerifier();

    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(verifier).not.toBe(createCodeVerifier());
  });

  it('creates the hex SHA-256 challenge expected by TikTok', () => {
    expect(createCodeChallenge('verifier')).toBe(
      '88c9eae68eb300b2971a2bec9e5a26ff4179fd661d6b7d861e4c6557b9aaee14',
    );
  });
});
