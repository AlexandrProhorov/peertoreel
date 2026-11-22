import {
  derivedWordSchema,
  storyboardSceneSchema,
  storyboardStyleSchema,
  type StoryboardStyle,
  type StoryboardScene,
} from '@peertoreel/contracts';
import { z } from 'zod';
import { resolvedScenePropsSchema } from './mapping.js';
import { SCENE_FPS } from './video-target.js';

export { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH } from './video-target.js';

export const SCENE_COMPOSITION_ID = 'Scene';

/**
 * Assets already resolved by the Asset Resolver (ADR-0017 D6). Keys are the
 * asset references the scene uses (`assets/starter/dog-snout.svg`, a logical
 * key, …); the renderer never resolves libraries or URLs itself.
 */
export const resolvedAssetMapSchema = z.record(
  z.string().min(1).max(500),
  z.object({ url: z.string().min(1).max(2_000_000) }),
);
export type ResolvedAssetMap = z.infer<typeof resolvedAssetMapSchema>;

export const sceneInputPropsSchema = z.object({
  scene: storyboardSceneSchema,
  style: storyboardStyleSchema,
  /** Already resolved by `mapping.ts`; the composition does not choose again. */
  resolved: resolvedScenePropsSchema,
  wordTimings: z.array(derivedWordSchema).optional(),
  assets: resolvedAssetMapSchema.optional(),
});
export type SceneInputProps = z.infer<typeof sceneInputPropsSchema>;

/** `durationInFrames` for Remotion: a scene is always at least one frame. */
export function sceneDurationInFrames(scene: StoryboardScene): number {
  return Math.max(1, Math.round(scene.durationSec * SCENE_FPS));
}

/**
 * Neutral preview props for Remotion Studio. Not a fixture and not a product
 * topic: the CLI always supplies real input props. Keeping this here (instead
 * of importing `storyboardFixture15Deg`) is what makes the core render path
 * fixture-free — see the boundary test.
 */
const DEFAULT_PREVIEW_SCENE: StoryboardScene = {
  id: 'preview',
  part: 'hook',
  beatIndex: null,
  voiceover: {
    text: 'Превью сцены',
    startSec: 0,
    endSec: 3,
  },
  durationSec: 3,
  description: 'Neutral preview scene for Remotion Studio',
  environment: {
    setting: 'preview',
    layers: [],
  },
  camera: { shot: 'wide', movement: 'static', speed: 0 },
  objects: [],
  effects: [],
  transition: { type: 'cut', durationSec: 0 },
  imagePrompt: null,
  videoPrompt: null,
  refs: null,
  implementation: {
    type: 'programmatic',
    componentId: 'kinetic-typography',
    params: {},
  },
  fallback: {
    type: 'programmatic',
    componentId: 'kinetic-typography',
    params: {},
  },
  version: 1,
};

const DEFAULT_PREVIEW_STYLE: StoryboardStyle = {
  styleId: 'flat_2d_motion',
  palette: {
    background: ['#0b1220', '#16233c'],
    accent: '#ffd166',
    text: '#ffffff',
    cold: '#8ecae6',
    danger: '#ef476f',
  },
  typography: {
    heading: 'Montserrat',
    body: 'Inter',
    headingWeight: 900,
  },
  effects: ['vignette'],
};

export const DEFAULT_SCENE_INPUT_PROPS: SceneInputProps =
  sceneInputPropsSchema.parse({
    scene: DEFAULT_PREVIEW_SCENE,
    style: DEFAULT_PREVIEW_STYLE,
    resolved: { componentId: 'kinetic-typography', params: {}, recipe: null },
  });
