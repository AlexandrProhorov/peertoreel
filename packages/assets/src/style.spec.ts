import {
  DEFAULT_STYLE_PRESET_ID,
  STORYBOARD_STYLE_IDS,
  STYLE_PRESETS,
  storyboardStyleSchema,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { assetPaletteFor, buildStoryboardStyle } from './style.js';

describe('studio_flat_2d_v2 style preset', () => {
  it('is the default storyboard style and a known id', () => {
    expect(STORYBOARD_STYLE_IDS).toContain('studio_flat_2d_v2');
    expect(DEFAULT_STYLE_PRESET_ID).toBe('studio_flat_2d_v2');
  });

  it('builds a schema-valid storyboard style', () => {
    const style = buildStoryboardStyle();

    expect(storyboardStyleSchema.safeParse(style).success).toBe(true);
    expect(style.palette).toEqual(STYLE_PRESETS.studio_flat_2d_v2.palette);
    expect(style.typography.heading).toBe('Montserrat');
    expect(style.effects).toEqual(['vignette', 'glow']);
    expect(style.assetPalette).toHaveLength(16);
  });

  it('keeps the v1 preset addressable', () => {
    expect(assetPaletteFor('studio_flat_2d_v1')).toEqual(
      STYLE_PRESETS.studio_flat_2d_v1.assetPalette,
    );
    expect(assetPaletteFor('studio_flat_2d_v1')).toHaveLength(8);
  });

  it('exposes the palette for normalization and an empty list for unknown styles', () => {
    expect(assetPaletteFor('studio_flat_2d_v2')).toEqual(
      STYLE_PRESETS.studio_flat_2d_v2.assetPalette,
    );
    expect(assetPaletteFor('flat_2d_motion')).toEqual([]);
  });
});
