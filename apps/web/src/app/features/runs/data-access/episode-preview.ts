import {
  getRecipeVariant,
  getStoryboardRecipe,
  type ScenePart,
  type StoryboardScene,
} from '@peertoreel/contracts';

/** Russian labels for the storyboard's fixed scene parts. */
const PART_LABELS: Record<ScenePart, string> = {
  hook: 'Хук',
  beat: 'Основная часть',
  cta: 'Призыв',
};

export interface SceneRecipeLabel {
  recipe: string;
  variant: string;
}

export function scenePartLabel(part: ScenePart): string {
  return PART_LABELS[part];
}

/**
 * Human labels come from the recipe catalog, not from a table in the component.
 * A non-recipe scene has no recipe/variant line in the preview.
 */
export function sceneRecipeLabel(
  scene: StoryboardScene,
): SceneRecipeLabel | null {
  if (scene.implementation.type !== 'recipe') {
    return null;
  }

  const { recipeId, variant } = scene.implementation;
  const recipe = getStoryboardRecipe(recipeId);
  const selected = getRecipeVariant(recipeId, variant);

  return {
    recipe: recipe?.id ?? recipeId,
    variant: selected?.label ?? variant,
  };
}
