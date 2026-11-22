import type { StoryboardScene } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  assetTierLabel,
  diagnosticCodes,
  formatCostUsd,
  scenePartLabel,
  sceneRecipeLabel,
  visualSourceLabel,
} from './episode-preview';

const recipeScene = {
  id: 'hook',
  part: 'hook',
  implementation: {
    type: 'recipe',
    recipeId: 'hook-hero',
    variant: 'subject-lead',
  },
} as unknown as StoryboardScene;

describe('episode preview labels', () => {
  it('labels the fixed scene parts in Russian', () => {
    expect(scenePartLabel('hook')).toBe('Хук');
    expect(scenePartLabel('beat')).toBe('Основная часть');
    expect(scenePartLabel('cta')).toBe('Призыв');
  });

  it('reads the recipe name and variant label from the catalog', () => {
    expect(sceneRecipeLabel(recipeScene)).toEqual({
      recipe: 'hook-hero',
      variant: 'Subject leads, headline anchors the top',
    });
  });

  it('does not invent a recipe line for programmatic scenes', () => {
    const scene = {
      id: 'cta',
      part: 'cta',
      implementation: { type: 'programmatic' },
    } as unknown as StoryboardScene;

    expect(sceneRecipeLabel(scene)).toBeNull();
  });

  it('labels the subject source, tier and measured cost', () => {
    expect(visualSourceLabel('pixabay')).toBe('Pixabay');
    expect(visualSourceLabel('deepseek-svg')).toBe('DeepSeek SVG');
    expect(visualSourceLabel('tier0')).toBe('Стартовый ассет');
    expect(assetTierLabel('starter')).toBe('Tier 0');
    expect(assetTierLabel('cache')).toBe('Кэш');
    expect(assetTierLabel('provider')).toBe('Генерация');
    expect(formatCostUsd(0.0023)).toBe('$0.0023');
    expect(formatCostUsd(null)).toBe('—');
  });

  it('shows diagnostic codes verbatim', () => {
    expect(
      diagnosticCodes([
        { code: 'provider_failed' },
        { code: 'fallback_used' },
      ]),
    ).toBe('provider_failed, fallback_used');
  });
});
