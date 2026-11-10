import { describe, expect, it } from 'vitest';
import {
  STYLE_PRESETS,
  buildAssetId,
  buildAssetObjectKey,
  parseAssetRequest,
  storyboardStyleSchema,
} from './index.js';

const HASH = 'a'.repeat(64);

describe('asset contract', () => {
  it('defaults provider access to off', () => {
    const request = parseAssetRequest({
      assetKey: 'brick',
      styleId: 'studio_flat_2d_v1',
    });

    expect(request.allowProvider).toBe(false);
    expect(request.kind).toBe('svg');
    expect(request.tags).toEqual([]);
  });

  it('parses an explicit provider request', () => {
    const request = parseAssetRequest({
      tags: ['robot'],
      styleId: 'studio_flat_2d_v1',
      kind: 'png',
      allowProvider: true,
      fallbackKey: 'brick',
    });

    expect(request).toMatchObject({
      tags: ['robot'],
      kind: 'png',
      allowProvider: true,
      fallbackKey: 'brick',
    });
  });

  it('builds content-addressed object keys and rejects bad hashes', () => {
    expect(buildAssetObjectKey(HASH, 'svg')).toBe(
      `assets/aa/${HASH}/${HASH}.svg`,
    );
    expect(() => buildAssetObjectKey('nope', 'svg')).toThrow();
    expect(() => buildAssetObjectKey(HASH, '')).toThrow();
  });

  it('derives a stable asset id from source and key', () => {
    expect(buildAssetId('starter', 'dog-snout')).toBe('starter/dog-snout');
    expect(buildAssetId('library', 'subject/robot')).toBe(
      'library/subject_robot',
    );
    expect(() => buildAssetId('library', '   ')).toThrow();
  });
});

describe('style preset contract', () => {
  it('exposes studio_flat_2d_v1 as data', () => {
    const preset = STYLE_PRESETS.studio_flat_2d_v1;

    expect(preset.id).toBe('studio_flat_2d_v1');
    expect(preset.assetPalette.length).toBeGreaterThanOrEqual(5);
    expect(preset.palette.background.length).toBeGreaterThan(0);
  });

  it('accepts assetPalette in a storyboard style and keeps it optional', () => {
    const base = {
      styleId: 'studio_flat_2d_v1',
      palette: {
        background: ['#0B1220'],
        accent: '#F59E0B',
        text: '#F4F1EA',
        cold: '#38BDF8',
        danger: '#EF4444',
      },
      typography: { heading: 'Montserrat', body: 'Inter', headingWeight: 900 },
      effects: ['vignette'],
    };

    expect(storyboardStyleSchema.safeParse(base).success).toBe(true);
    expect(
      storyboardStyleSchema.safeParse({
        ...base,
        assetPalette: [...STYLE_PRESETS.studio_flat_2d_v1.assetPalette],
      }).success,
    ).toBe(true);
    expect(
      storyboardStyleSchema.safeParse({ ...base, assetPalette: ['oops'] }).success,
    ).toBe(false);
  });
});
