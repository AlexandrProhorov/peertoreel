import {
  DEFAULT_STYLE_PRESET_ID,
  STORYBOARD_STYLE_IDS,
  STYLE_PRESETS,
  storyboardStyleSchema,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { assetPaletteFor, buildStoryboardStyle } from './style.js';

describe('studio_flat_2d_v1 style preset', () => {
  it('is a known storyboard style id', () => {
    expect(STORYBOARD_STYLE_IDS).toContain('studio_flat_2d_v1');
    expect(DEFAULT_STYLE_PRESET_ID).toBe('studio_flat_2d_v1');
  });

  it('builds a schema-valid storyboard style', () => {
    const style = buildStoryboardStyle();

    expect(storyboardStyleSchema.safeParse(style).success).toBe(true);
    expect(style.palette).toEqual(STYLE_PRESETS.studio_flat_2d_v1.palette);
    expect(style.typography.heading).toBe('Montserrat');
    expect(style.effects).toEqual(['vignette', 'glow']);
    expect(style.assetPalette).toHaveLength(8);
  });

  it('applies the preset palette over a scene style', () => {
    const style = buildStoryboardStyle();

    expect(style.palette.accent).toBe(
      STYLE_PRESETS.studio_flat_2d_v1.palette.accent,
    );
    expect(style.assetPalette).toEqual(
      STYLE_PRESETS.studio_flat_2d_v1.assetPalette,
    );
    expect(storyboardStyleSchema.safeParse(style).success).toBe(true);
  });

  it('exposes the palette for normalization and an empty list for unknown styles', () => {
    expect(assetPaletteFor('studio_flat_2d_v1')).toEqual(
      STYLE_PRESETS.studio_flat_2d_v1.assetPalette,
    );
    expect(assetPaletteFor('flat_2d_motion')).toEqual([]);
  });
});
