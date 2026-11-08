import { describe, expect, it } from 'vitest';
import { TokenCipher, generateTokenKey, parseTokenKey } from './cipher.js';

describe('TokenCipher', () => {
  it('round-trips a token with a base64 key', () => {
    const cipher = new TokenCipher(generateTokenKey());

    const payload = cipher.encrypt('act.secret-token');

    expect(payload).not.toContain('act.secret-token');
    expect(payload.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(payload)).toBe('act.secret-token');
  });

  it('accepts a 64-character hex key', () => {
    const key = 'a'.repeat(64);
    const cipher = new TokenCipher(key);
    const payload = cipher.encrypt('token');

    expect(new TokenCipher(Buffer.from(key, 'hex').toString('base64')).decrypt(payload)).toBe(
      'token',
    );
  });

  it('rejects a tampered payload or a different key', () => {
    const cipher = new TokenCipher(generateTokenKey());
    const payload = cipher.encrypt('token');
    const parts = payload.split('.');

    parts[3] = `${parts[3]}x`;

    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
    expect(() =>
      new TokenCipher(generateTokenKey()).decrypt(payload),
    ).toThrow();
  });

  it('rejects an invalid key length', () => {
    expect(() => parseTokenKey('short')).toThrow(/32-byte/);
  });
});
