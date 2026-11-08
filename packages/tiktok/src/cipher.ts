import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * AES-256-GCM for TikTok tokens at rest. Format:
 * `v1.<iv base64url>.<tag base64url>.<ciphertext base64url>`.
 * The key is a 32-byte value, base64 or 64 hex characters.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = parseTokenKey(secret);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');

    if (parts.length !== 4) {
      throw new Error('Unsupported encrypted token payload');
    }

    const [version, iv, tag, ciphertext] = parts;

    if (
      version !== VERSION ||
      !iv ||
      !tag ||
      !ciphertext ||
      Buffer.from(iv, 'base64url').length !== IV_BYTES ||
      Buffer.from(tag, 'base64url').length !== TAG_BYTES
    ) {
      throw new Error('Unsupported encrypted token payload');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function parseTokenKey(secret: string): Buffer {
  const value = secret.trim();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const key = Buffer.from(value, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a 32-byte key (base64 or 64 hex characters)',
    );
  }

  return key;
}

export function generateTokenKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
