import {
  derivedWordSchema,
  storyboardSceneSchema,
  storyboardStyleSchema,
  type StoryboardScene,
} from '@peertoreel/contracts';
import { z } from 'zod';

export const SCENE_COMPOSITION_ID = 'Scene';
export const SCENE_WIDTH = 1080;
export const SCENE_HEIGHT = 1920;
export const SCENE_FPS = 30;

export const sceneInputPropsSchema = z.object({
  scene: storyboardSceneSchema,
  style: storyboardStyleSchema,
  wordTimings: z.array(derivedWordSchema).optional(),
});
export type SceneInputProps = z.infer<typeof sceneInputPropsSchema>;

/** `durationInFrames` for Remotion: a scene is always at least one frame. */
export function sceneDurationInFrames(scene: StoryboardScene): number {
  return Math.max(1, Math.round(scene.durationSec * SCENE_FPS));
}
