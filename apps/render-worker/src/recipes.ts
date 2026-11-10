import {
  STARTER_ASSET_CATALOG,
  getRecipeVariant,
  getStoryboardRecipe,
  isStarterAssetKey,
  parseRecipeSlots,
  type ComponentParamDiagnostic,
  type JsonObject,
  type RecipeChartKind,
  type RecipeLayerKind,
  type RecipeLayerLayout,
  type RecipeMetric,
  type RecipeSceneImplementation,
  type RecipeSlots,
  type RecipeStep,
  type RecipeSubject,
  type StoryboardComponentId,
  type StoryboardRecipeId,
} from '@peertoreel/contracts';

export interface ResolvedRecipeChartItem {
  readonly label: string;
  readonly value: string | null;
  readonly detail: string | null;
  readonly fraction: number | null;
}

export interface ResolvedRecipeLayer {
  readonly id: string;
  readonly kind: RecipeLayerKind;
  /** Text content, local asset path, or a preset name for ambient layers. */
  readonly content: string | null;
  readonly chart: RecipeChartKind | null;
  readonly items: readonly ResolvedRecipeChartItem[];
  readonly layout: RecipeLayerLayout;
  /** Fraction of the scene duration, 0..1. */
  readonly from: number;
  readonly to: number;
}

export interface ResolvedSceneRecipe {
  readonly id: StoryboardRecipeId;
  readonly variant: string;
  readonly layers: readonly ResolvedRecipeLayer[];
}

export interface ResolvedRecipeScene {
  readonly componentId: StoryboardComponentId;
  readonly params: JsonObject;
  readonly recipe: ResolvedSceneRecipe;
  readonly slotDiagnostics: ComponentParamDiagnostic[];
}

/** A catalog layer points at a slot/layer kind the renderer cannot bind. */
export class UnsupportedRecipeLayerError extends Error {
  constructor(
    readonly recipeId: string,
    readonly layerId: string,
    reason: string,
  ) {
    super(`Recipe "${recipeId}" layer "${layerId}" is invalid: ${reason}`);
    this.name = 'UnsupportedRecipeLayerError';
  }
}

/** A recipe subject references a key outside the curated starter pack. */
export class UnknownStarterAssetError extends Error {
  constructor(
    readonly recipeId: string,
    readonly assetKey: string,
  ) {
    super(
      `Recipe "${recipeId}" references starter asset "${assetKey}" outside STARTER_ASSET_KEYS`,
    );
    this.name = 'UnknownStarterAssetError';
  }
}

function isRecipeSubject(value: unknown): value is RecipeSubject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'assetKey' in value &&
    typeof value.assetKey === 'string'
  );
}

function isRecipeMetric(value: unknown): value is RecipeMetric {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'label' in value &&
    'value' in value &&
    'fraction' in value
  );
}

function isRecipeSteps(value: unknown): value is readonly RecipeStep[] {
  return Array.isArray(value) && value.every((step) => isRecipeStep(step));
}

function isRecipeStep(value: unknown): value is RecipeStep {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'label' in value &&
    typeof value.label === 'string'
  );
}

function slotValue(
  recipeId: string,
  layerId: string,
  slots: RecipeSlots,
  slot: string | undefined,
): unknown {
  if (slot === undefined || slot.length === 0) {
    throw new UnsupportedRecipeLayerError(recipeId, layerId, 'missing slot binding');
  }

  return slots[slot] ?? null;
}

function layerText(
  recipeId: string,
  layerId: string,
  slots: RecipeSlots,
  slot: string | null,
): string | null {
  if (slot === null) {
    return null;
  }

  const value = slotValue(recipeId, layerId, slots, slot);

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new UnsupportedRecipeLayerError(
      recipeId,
      layerId,
      `slot "${slot}" must be text`,
    );
  }

  return value;
}

function layerSubject(
  recipeId: string,
  layerId: string,
  slots: RecipeSlots,
  slot: string | null,
): RecipeSubject | null {
  if (slot === null) {
    return null;
  }

  const value = slotValue(recipeId, layerId, slots, slot);

  if (value === null) {
    return null;
  }

  if (!isRecipeSubject(value)) {
    throw new UnsupportedRecipeLayerError(
      recipeId,
      layerId,
      `slot "${slot}" must be a subject`,
    );
  }

  if (!isStarterAssetKey(value.assetKey)) {
    throw new UnknownStarterAssetError(recipeId, value.assetKey);
  }

  return value;
}

function chartItems(
  recipeId: string,
  layerId: string,
  chart: RecipeChartKind | null,
  chartSlots: Readonly<Record<string, string>>,
  slots: RecipeSlots,
): readonly ResolvedRecipeChartItem[] {
  switch (chart) {
    case 'comparison-bars': {
      const items = ['left', 'right'].map((key) => {
        const value = slotValue(recipeId, layerId, slots, chartSlots[key]);
        const slotName = chartSlots[key] ?? key;

        if (!isRecipeMetric(value)) {
          throw new UnsupportedRecipeLayerError(
            recipeId,
            layerId,
            `slot "${slotName}" must be a metric`,
          );
        }

        return {
          label: value.label,
          value: value.value,
          detail: null,
          fraction: value.fraction,
        };
      });

      return items;
    }
    case 'process-steps': {
      const value = slotValue(recipeId, layerId, slots, chartSlots.steps);

      if (!isRecipeSteps(value)) {
        throw new UnsupportedRecipeLayerError(
          recipeId,
          layerId,
          `slot "${chartSlots.steps ?? 'steps'}" must be steps`,
        );
      }

      return value.map((step) => ({
        label: step.label,
        value: null,
        detail: step.detail,
        fraction: null,
      }));
    }
    default:
      throw new UnsupportedRecipeLayerError(
        recipeId,
        layerId,
        `unknown chart "${String(chart)}"`,
      );
  }
}

function isValidWindow(from: number, to: number): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && from >= 0 && from < to && to <= 1;
}

/**
 * Bind slot data to the selected variant's layer plan. This is the single
 * resolution point (ADR-0016 D6): the renderer never chooses a recipe again.
 */
export function resolveRecipeScene(
  implementation: RecipeSceneImplementation,
): ResolvedRecipeScene {
  const parsed = parseRecipeSlots(
    implementation.recipeId,
    implementation.variant,
    implementation.slots,
  );
  const recipe = getStoryboardRecipe(implementation.recipeId);

  if (recipe === null) {
    throw new UnsupportedRecipeLayerError(
      implementation.recipeId,
      '$',
      'recipe is not in the catalog',
    );
  }

  const variant = getRecipeVariant(
    implementation.recipeId,
    implementation.variant,
  );

  if (variant === null) {
    throw new UnsupportedRecipeLayerError(
      implementation.recipeId,
      '$',
      `variant "${implementation.variant}" is not in the catalog`,
    );
  }

  const layers: ResolvedRecipeLayer[] = [];

  for (const template of variant.layers) {
    if (!isValidWindow(template.from, template.to)) {
      throw new UnsupportedRecipeLayerError(
        implementation.recipeId,
        template.id,
        `window ${template.from}..${template.to} must be inside 0..1`,
      );
    }

    switch (template.kind) {
      case 'text':
      case 'pill':
      case 'hud-chip': {
        const content = layerText(
          implementation.recipeId,
          template.id,
          parsed.slots,
          template.slot,
        );

        if (content === null) {
          continue;
        }

        layers.push({
          id: template.id,
          kind: template.kind,
          content,
          chart: null,
          items: [],
          layout: template.layout,
          from: template.from,
          to: template.to,
        });
        break;
      }
      case 'subject':
      case 'image': {
        const subject = layerSubject(
          implementation.recipeId,
          template.id,
          parsed.slots,
          template.slot,
        );

        if (subject === null) {
          continue;
        }

        layers.push({
          id: template.id,
          kind: template.kind,
          content: STARTER_ASSET_CATALOG[subject.assetKey].path,
          chart: null,
          items: [],
          layout: template.layout,
          from: template.from,
          to: template.to,
        });
        break;
      }
      case 'chart': {
        layers.push({
          id: template.id,
          kind: template.kind,
          content: null,
          chart: template.chart,
          items: chartItems(
            implementation.recipeId,
            template.id,
            template.chart,
            template.chartSlots,
            parsed.slots,
          ),
          layout: template.layout,
          from: template.from,
          to: template.to,
        });
        break;
      }
      case 'particles':
      case 'light':
      case 'overlay':
      case 'character': {
        if (template.content === null) {
          throw new UnsupportedRecipeLayerError(
            implementation.recipeId,
            template.id,
            `kind "${template.kind}" requires static content`,
          );
        }

        layers.push({
          id: template.id,
          kind: template.kind,
          content: template.content,
          chart: null,
          items: [],
          layout: template.layout,
          from: template.from,
          to: template.to,
        });
        break;
      }
      default:
        throw new UnsupportedRecipeLayerError(
          implementation.recipeId,
          template.id,
          `unknown layer kind "${String(template.kind)}"`,
        );
    }
  }

  return {
    componentId: variant.background.componentId,
    params: variant.background.params,
    recipe: {
      id: recipe.id,
      variant: variant.id,
      layers,
    },
    slotDiagnostics: parsed.diagnostics,
  };
}
