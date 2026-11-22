import {
  getRecipeVariant,
  getStoryboardRecipe,
  type AssetResolutionTier,
  type EpisodeVisualSource,
  type ScenePart,
  type StoryboardScene,
} from '@peertoreel/contracts';

/** Russian labels for the storyboard's fixed scene parts. */
const PART_LABELS: Record<ScenePart, string> = {
  hook: 'Хук',
  beat: 'Основная часть',
  cta: 'Призыв',
};

export type EpisodePreviewSource = EpisodeVisualSource | 'tier0';

const SOURCE_LABELS: Record<EpisodePreviewSource, string> = {
  pixabay: 'Pixabay',
  'deepseek-svg': 'DeepSeek SVG',
  tier0: 'Стартовый ассет',
};

const TIER_LABELS: Record<AssetResolutionTier, string> = {
  starter: 'Tier 0',
  cache: 'Кэш',
  provider: 'Генерация',
  fallback: 'Fallback',
};

export interface SceneRecipeLabel {
  recipe: string;
  variant: string;
}

export function scenePartLabel(part: ScenePart): string {
  return PART_LABELS[part];
}

/** Source badge for a subject decision (M3.6b.9). */
export function visualSourceLabel(source: EpisodePreviewSource): string {
  return SOURCE_LABELS[source];
}

export function assetTierLabel(tier: AssetResolutionTier): string {
  return TIER_LABELS[tier];
}

/** `$0.0023` for a measured cost; the ledger never shows estimates. */
export function formatCostUsd(costUsd: number | null): string {
  return costUsd === null ? '—' : `$${costUsd.toFixed(4)}`;
}

/** Diagnostic codes are shown verbatim: they are the stable machine contract. */
export function diagnosticCodes(
  diagnostics: readonly { code: string }[],
): string {
  return diagnostics.map((diagnostic) => diagnostic.code).join(', ');
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
