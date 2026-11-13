import {
  COMPONENT_PARAMS_SCHEMAS,
  RECIPE_CHART_KINDS,
  RECIPE_LAYER_ANCHORS,
  RECIPE_LAYER_KINDS,
  RECIPE_LAYER_SIZES,
  RECIPE_LAYER_TONES,
  STORYBOARD_RECIPE_IDS,
  parseComponentParams,
  type ComponentParamDiagnostic,
  type ComponentParamsById,
  type JsonValue,
  type StoryboardComponentId,
  type StoryboardScene,
} from '@peertoreel/contracts';
import { z } from 'zod';
import {
  resolveRecipeScene,
  type ResolvedSceneRecipe,
} from './recipes.js';

/** Components implemented by this renderer. M3.4 grows this set. */
export const IMPLEMENTED_COMPONENTS = [
  'parallax-city',
  'kinetic-typography',
] as const;
export type ImplementedComponentId = (typeof IMPLEMENTED_COMPONENTS)[number];

export type SceneComponentSource = 'implementation' | 'fallback';

/**
 * The resolved render props. `source`, `recipe` metadata and diagnostics are
 * log/test data; only `componentId`/`params`/`recipe` cross into Remotion.
 */
export type ResolvedScene = {
  [K in ImplementedComponentId]: {
    componentId: K;
    params: ComponentParamsById[K];
    source: SceneComponentSource;
    recipe: ResolvedSceneRecipe | null;
    slotDiagnostics: ComponentParamDiagnostic[];
    diagnostics: ComponentParamDiagnostic[];
  };
}[ImplementedComponentId];

const recipeChartItemSchema = z.object({
  label: z.string(),
  value: z.string().nullable(),
  detail: z.string().nullable(),
  fraction: z.number().nullable(),
});

const resolvedRecipeLayerSchema = z.object({
  id: z.string(),
  kind: z.enum(RECIPE_LAYER_KINDS),
  content: z.string().nullable(),
  chart: z.enum(RECIPE_CHART_KINDS).nullable(),
  items: z.array(recipeChartItemSchema),
  layout: z.object({
    anchor: z.enum(RECIPE_LAYER_ANCHORS),
    size: z.enum(RECIPE_LAYER_SIZES),
    tone: z.enum(RECIPE_LAYER_TONES),
  }),
  from: z.number(),
  to: z.number(),
});

export const resolvedSceneRecipeSchema = z.object({
  id: z.enum(STORYBOARD_RECIPE_IDS),
  variant: z.string(),
  layers: z.array(resolvedRecipeLayerSchema),
});
export type ResolvedSceneRecipeProps = z.infer<
  typeof resolvedSceneRecipeSchema
>;

/** Same shape without the log-only fields — exactly what crosses into Remotion. */
export const resolvedScenePropsSchema = z.discriminatedUnion('componentId', [
  z.object({
    componentId: z.literal('parallax-city'),
    params: COMPONENT_PARAMS_SCHEMAS['parallax-city'],
    recipe: resolvedSceneRecipeSchema.nullable(),
  }),
  z.object({
    componentId: z.literal('kinetic-typography'),
    params: COMPONENT_PARAMS_SCHEMAS['kinetic-typography'],
    recipe: resolvedSceneRecipeSchema.nullable(),
  }),
]);
export type ResolvedSceneProps = z.infer<typeof resolvedScenePropsSchema>;

export class UnsupportedSceneComponentError extends Error {
  constructor(
    readonly componentId: StoryboardComponentId,
    readonly sceneId: string,
  ) {
    super(
      `Scene "${sceneId}" cannot be rendered: component "${componentId}" is not implemented and the fallback is not implemented either`,
    );
    this.name = 'UnsupportedSceneComponentError';
  }
}

export function isImplementedComponent(
  componentId: StoryboardComponentId,
): componentId is ImplementedComponentId {
  return (IMPLEMENTED_COMPONENTS as readonly string[]).includes(componentId);
}

function resolve(
  componentId: ImplementedComponentId,
  params: JsonValue | undefined | null,
  source: SceneComponentSource,
  recipe: ResolvedSceneRecipe | null,
  slotDiagnostics: ComponentParamDiagnostic[],
): ResolvedScene {
  const parsed = parseComponentParams(componentId, params);

  return {
    componentId,
    params: parsed.params,
    source,
    recipe,
    slotDiagnostics,
    diagnostics: parsed.diagnostics,
  } as ResolvedScene;
}

/**
 * Pick the component that can actually render this scene.
 *
 * Only an explicitly declared fallback is allowed when the implementation is
 * not renderable. There is no generic `kinetic-typography` substitution: a
 * scene with neither side implemented throws a typed error (root hard rule 9).
 *
 * Recipe scenes resolve once through the catalog and never fall back: a recipe
 * failure is a contract error, not an AI-producer failure (ADR-0016 D9).
 */
export function resolveSceneComponent(
  scene: StoryboardScene,
): ResolvedScene {
  if (scene.implementation.type === 'recipe') {
    const resolved = resolveRecipeScene(scene.implementation);

    if (!isImplementedComponent(resolved.componentId)) {
      throw new UnsupportedSceneComponentError(
        resolved.componentId,
        scene.id,
      );
    }

    return resolve(
      resolved.componentId,
      resolved.params,
      'implementation',
      resolved.recipe,
      resolved.slotDiagnostics,
    );
  }

  if (
    scene.implementation.type === 'programmatic' &&
    isImplementedComponent(scene.implementation.componentId)
  ) {
    return resolve(
      scene.implementation.componentId,
      scene.implementation.params,
      'implementation',
      null,
      [],
    );
  }

  if (isImplementedComponent(scene.fallback.componentId)) {
    return resolve(
      scene.fallback.componentId,
      scene.fallback.params,
      'fallback',
      null,
      [],
    );
  }

  throw new UnsupportedSceneComponentError(scene.fallback.componentId, scene.id);
}
