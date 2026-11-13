import type { StoryboardScene } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { scenePartLabel, sceneRecipeLabel } from './episode-preview';

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
});
