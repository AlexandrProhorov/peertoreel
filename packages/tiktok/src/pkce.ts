import { createHash, randomBytes } from 'node:crypto';

/**
 * TikTok requires PKCE for desktop/localhost authorization and rejects the
 * consent page with `code_challenge` when the parameter is missing.
 *
 * TikTok's Login Kit desktop guide asks for the **hex** SHA-256 digest as the
 * challenge (`code_challenge = SHA256(code_verifier)`), not the RFC 7636
 * base64url form. Follow the provider, not the RFC default.
 */
export function createCodeVerifier(): string {
  // 48 random bytes -> 64 base64url characters (within the 43..128 range,
  // only unreserved characters allowed by RFC 7636).
  return randomBytes(48).toString('base64url');
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('hex');
}
