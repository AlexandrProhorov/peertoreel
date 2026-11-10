import type { RecipeLayerKind, SceneObjectKind } from '@peertoreel/contracts';

/** Reusable renderer target for a legacy `scene.objects[]` kind. */
export type SceneObjectRenderer =
  | 'text'
  | 'particles'
  | 'light'
  | 'overlay'
  | 'character'
  | 'chart'
  | 'asset'
  | 'none';

/**
 * `image` and `subject` share the asset renderer; `shape` is declared in v1 but
 * intentionally not rendered. Unknown kinds throw instead of silently returning
 * `null` (ADR-0016 D7).
 */
export function sceneObjectRenderer(kind: SceneObjectKind): SceneObjectRenderer {
  switch (kind) {
    case 'text':
      return 'text';
    case 'particles':
      return 'particles';
    case 'light':
      return 'light';
    case 'overlay':
      return 'overlay';
    case 'character':
      return 'character';
    case 'chart':
      return 'chart';
    case 'image':
    case 'subject':
      return 'asset';
    case 'shape':
      return 'none';
    default:
      throw new Error(`Unsupported scene object kind "${String(kind)}"`);
  }
}

/** Reusable renderer target for a recipe layer kind. */
export type RecipeRenderer =
  | 'text'
  | 'pill'
  | 'hud-chip'
  | 'subject'
  | 'chart'
  | 'particles'
  | 'light'
  | 'overlay'
  | 'character';

export function recipeRenderer(kind: RecipeLayerKind): RecipeRenderer {
  switch (kind) {
    case 'text':
      return 'text';
    case 'pill':
      return 'pill';
    case 'hud-chip':
      return 'hud-chip';
    case 'subject':
    case 'image':
      return 'subject';
    case 'chart':
      return 'chart';
    case 'particles':
      return 'particles';
    case 'light':
      return 'light';
    case 'overlay':
      return 'overlay';
    case 'character':
      return 'character';
    default:
      throw new Error(`Unsupported recipe layer kind "${String(kind)}"`);
  }
}
