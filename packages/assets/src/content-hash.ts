import { createHash } from 'node:crypto';

/**
 * Byte identity for the asset library (ADR-0017 D3). The hash is computed over
 * the *normalized* bytes, so two providers returning the same normalized SVG
 * collapse into one record/variant.
 */
export function sha256Hex(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  return createHash('sha256').update(bytes).digest('hex');
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
