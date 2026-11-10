import {
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
} from '@peertoreel/contracts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveAssetKey } from './assets.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const STARTER_DIR = path.join(PUBLIC_DIR, 'assets', 'starter');

describe('starter SVG pack', () => {
  it('ships 10 to 16 authored starter icons', () => {
    expect(STARTER_ASSET_KEYS.length).toBeGreaterThanOrEqual(10);
    expect(STARTER_ASSET_KEYS.length).toBeLessThanOrEqual(16);
  });

  it('has no SVG file outside the catalog', () => {
    const files = readdirSync(STARTER_DIR)
      .filter((name) => name.endsWith('.svg'))
      .sort();
    const expected = STARTER_ASSET_KEYS.map((key) => `${key}.svg`).sort();

    expect(files).toEqual(expected);
  });

  it('resolves every catalog key to an existing local file', () => {
    for (const key of STARTER_ASSET_KEYS) {
      const entry = STARTER_ASSET_CATALOG[key];
      const location = resolveAssetKey(entry.path);

      expect(location).toEqual({ kind: 'local', key: entry.path });
      expect(existsSync(path.join(PUBLIC_DIR, entry.path))).toBe(true);
    }
  });

  it('contains no baked text nodes or external image references', () => {
    for (const key of STARTER_ASSET_KEYS) {
      const source = readFileSync(
        path.join(PUBLIC_DIR, STARTER_ASSET_CATALOG[key].path),
        'utf8',
      );

      expect(source.trimStart().startsWith('<svg')).toBe(true);
      expect(source).not.toMatch(/<text[\s>]/);
      expect(source).not.toMatch(/<tspan[\s>]/);
      expect(source).not.toMatch(/<image[\s>]/);
      expect(source).not.toMatch(/href\s*=\s*["']https?:/);
    }
  });
});
