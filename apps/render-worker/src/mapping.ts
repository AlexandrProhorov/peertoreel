import type {
  StoryboardComponentId,
  StoryboardScene,
} from '@peertoreel/contracts';

/** Components available in the M3.2 renderer. M3.3 grows this set. */
export const IMPLEMENTED_COMPONENTS = [
  'parallax-city',
  'kinetic-typography',
] as const;
export type ImplementedComponentId = (typeof IMPLEMENTED_COMPONENTS)[number];

export type SceneComponentSource = 'implementation' | 'fallback' | 'generic';

export interface SceneComponentChoice {
  componentId: ImplementedComponentId;
  source: SceneComponentSource;
}

export function isImplementedComponent(
  componentId: StoryboardComponentId,
): componentId is ImplementedComponentId {
  return (IMPLEMENTED_COMPONENTS as readonly string[]).includes(componentId);
}

/**
 * Pick the component that can actually render this scene in M3.2. Image and
 * AI-video scenes always use their mandatory storyboard fallback until M3.6/
 * M3.7; unimplemented programmatic components also fall back; if even the
 * fallback is not implemented yet, a generic typography scene keeps the
 * fixture renderable.
 */
export function resolveSceneComponent(
  scene: StoryboardScene,
): SceneComponentChoice {
  if (scene.implementation.type === 'programmatic') {
    if (isImplementedComponent(scene.implementation.componentId)) {
      return {
        componentId: scene.implementation.componentId,
        source: 'implementation',
      };
    }
  }

  if (isImplementedComponent(scene.fallback.componentId)) {
    return {
      componentId: scene.fallback.componentId,
      source: 'fallback',
    };
  }

  return { componentId: 'kinetic-typography', source: 'generic' };
}
