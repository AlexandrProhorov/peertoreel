import {
  DEFAULT_STYLE_PRESET_ID,
  STORYBOARD_EFFECT_IDS,
  STYLE_PRESETS,
  getStylePreset,
  type StoryboardEffectId,
  type StoryboardStyle,
  type StylePresetId,
} from '@peertoreel/contracts';

/**
 * Style preset → storyboard style (ADR-0017 D7).
 *
 * Renderer/adapter code never hand-copies palette values: the preset is the
 * single source, including `assetPalette` used by SVG normalization.
 */

function presetEffects(presetId: StylePresetId): StoryboardEffectId[] {
  const preset = STYLE_PRESETS[presetId];

  return preset.effects.filter((effect): effect is StoryboardEffectId =>
    (STORYBOARD_EFFECT_IDS as readonly string[]).includes(effect),
  );
}

export function buildStoryboardStyle(
  presetId: StylePresetId = DEFAULT_STYLE_PRESET_ID,
): StoryboardStyle {
  const preset = STYLE_PRESETS[presetId];

  return {
    styleId: preset.id,
    palette: {
      background: [...preset.palette.background],
      accent: preset.palette.accent,
      text: preset.palette.text,
      cold: preset.palette.cold,
      danger: preset.palette.danger,
    },
    typography: {
      heading: preset.typography.heading,
      body: preset.typography.body,
      headingWeight: preset.typography.headingWeight,
    },
    effects: presetEffects(presetId),
    assetPalette: [...preset.assetPalette],
  };
}

/**
 * Palette used by normalization; empty means "no quantization target". A
 * storyboard-declared `style.assetPalette` wins in the resolver request.
 */
export function assetPaletteFor(styleId: string): readonly string[] {
  return getStylePreset(styleId)?.assetPalette ?? [];
}
