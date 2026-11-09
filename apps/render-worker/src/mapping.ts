import {
  COMPONENT_PARAMS_SCHEMAS,
  parseComponentParams,
  type ComponentParamDiagnostic,
  type ComponentParamsById,
  type JsonValue,
  type StoryboardComponentId,
  type StoryboardScene,
} from '@peertoreel/contracts';
import { z } from 'zod';

/** Components implemented by this renderer. M3.4 grows this set. */
export const IMPLEMENTED_COMPONENTS = [
  'parallax-city',
  'kinetic-typography',
] as const;
export type ImplementedComponentId = (typeof IMPLEMENTED_COMPONENTS)[number];

export type SceneComponentSource = 'implementation' | 'fallback';

/**
 * The resolved render props. `source` and `diagnostics` are metadata for logs
 * and tests; they are not passed into the component and never change rendering.
 */
export type ResolvedScene = {
  [K in ImplementedComponentId]: {
    componentId: K;
    params: ComponentParamsById[K];
    source: SceneComponentSource;
    diagnostics: ComponentParamDiagnostic[];
  };
}[ImplementedComponentId];

/** Same shape without the log-only fields — exactly what crosses into Remotion. */
export const resolvedScenePropsSchema = z.discriminatedUnion('componentId', [
  z.object({
    componentId: z.literal('parallax-city'),
    params: COMPONENT_PARAMS_SCHEMAS['parallax-city'],
  }),
  z.object({
    componentId: z.literal('kinetic-typography'),
    params: COMPONENT_PARAMS_SCHEMAS['kinetic-typography'],
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
): ResolvedScene {
  const parsed = parseComponentParams(componentId, params);

  return {
    componentId,
    params: parsed.params,
    source,
    diagnostics: parsed.diagnostics,
  } as ResolvedScene;
}

/**
 * Pick the component that can actually render this scene.
 *
 * Only an explicitly declared fallback is allowed when the implementation is
 * not renderable. There is no generic `kinetic-typography` substitution: a
 * scene with neither side implemented throws a typed error (root hard rule 9).
 */
export function resolveSceneComponent(
  scene: StoryboardScene,
): ResolvedScene {
  if (
    scene.implementation.type === 'programmatic' &&
    isImplementedComponent(scene.implementation.componentId)
  ) {
    return resolve(
      scene.implementation.componentId,
      scene.implementation.params,
      'implementation',
    );
  }

  if (isImplementedComponent(scene.fallback.componentId)) {
    return resolve(
      scene.fallback.componentId,
      scene.fallback.params,
      'fallback',
    );
  }

  throw new UnsupportedSceneComponentError(scene.fallback.componentId, scene.id);
}
