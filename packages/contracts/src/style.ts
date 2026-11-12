/**
 * Style presets are data (ADR-0017 D7). A preset owns the scene palette, the
 * `assetPalette` used by SVG/OKLab normalization, typography and effects.
 *
 * This module deliberately imports nothing: `storyboard.ts` reads
 * `STYLE_PRESET_IDS` to extend its style-id enum, and a cycle would break the
 * package build.
 */

export const STYLE_PRESET_IDS = [
  'studio_flat_2d_v1',
  'studio_flat_2d_v2',
] as const;
export type StylePresetId = (typeof STYLE_PRESET_IDS)[number];

export interface StylePresetPalette {
  /** Background gradient stops, darkest first. */
  readonly background: readonly string[];
  readonly accent: string;
  readonly text: string;
  readonly cold: string;
  readonly danger: string;
}

export interface StylePresetTypography {
  readonly heading: string;
  readonly body: string;
  readonly headingWeight: number;
}

export interface StylePreset {
  readonly id: StylePresetId;
  readonly label: string;
  readonly palette: StylePresetPalette;
  /**
   * Allowed colors for imported SVG/raster subjects, in tie-break order.
   * OKLab quantization maps every fill/stroke to the nearest slot.
   */
  readonly assetPalette: readonly string[];
  readonly typography: StylePresetTypography;
  readonly effects: readonly string[];
}

const STUDIO_FLAT_2D_ASSET_PALETTE = [
  '#0B1220',
  '#16233C',
  '#F4F1EA',
  '#F59E0B',
  '#FBBF24',
  '#38BDF8',
  '#7DD3FC',
  '#EF4444',
] as const;

/**
 * Muted palette (2026-11-12 visual review): two shades per role, ~40–50%
 * saturation. The model picks at most five colors from these slots; OKLab
 * normalization snaps the rest.
 */
const STUDIO_FLAT_2D_V2_ASSET_PALETTE = [
  '#0C1B31', // ink
  '#17304C', // ink, raised
  '#23405F', // surface
  '#315273', // surface, raised
  '#F5F1E8', // paper
  '#EFE6D2', // paper, shaded
  '#F2A025', // amber
  '#FFC94F', // amber, light
  '#35B4D8', // sky
  '#86DEEF', // sky, light
  '#EC6555', // coral
  '#FFA08F', // coral, light
  '#6BB98A', // sage
  '#A6DFAE', // sage, light
  '#E04C42', // danger
  '#FF9C92', // danger, light
] as const;

export const STYLE_PRESETS: Readonly<Record<StylePresetId, StylePreset>> = {
  studio_flat_2d_v1: {
    id: 'studio_flat_2d_v1',
    label: 'Studio flat 2D',
    palette: {
      background: ['#0B1220', '#16233C'],
      accent: '#F59E0B',
      text: '#F4F1EA',
      cold: '#38BDF8',
      danger: '#EF4444',
    },
    assetPalette: STUDIO_FLAT_2D_ASSET_PALETTE,
    typography: {
      heading: 'Montserrat',
      body: 'Inter',
      headingWeight: 900,
    },
    effects: ['vignette', 'glow'],
  },
  studio_flat_2d_v2: {
    id: 'studio_flat_2d_v2',
    label: 'Studio flat 2D (muted)',
    palette: {
      background: ['#0C1B31', '#17304C'],
      accent: '#F2A025',
      text: '#F5F1E8',
      cold: '#35B4D8',
      danger: '#E04C42',
    },
    assetPalette: STUDIO_FLAT_2D_V2_ASSET_PALETTE,
    typography: {
      heading: 'Montserrat',
      body: 'Inter',
      headingWeight: 900,
    },
    effects: ['vignette', 'glow'],
  },
};

export const DEFAULT_STYLE_PRESET_ID: StylePresetId = 'studio_flat_2d_v2';

export function isStylePresetId(value: string): value is StylePresetId {
  return (STYLE_PRESET_IDS as readonly string[]).includes(value);
}

export function getStylePreset(presetId: string): StylePreset | null {
  return isStylePresetId(presetId) ? STYLE_PRESETS[presetId] : null;
}
