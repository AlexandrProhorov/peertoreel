import { z } from 'zod';

/** Shared by the stock visuals manifest and the storyboard scene model. */
export const SCENE_PARTS = ['hook', 'beat', 'cta'] as const;
export const scenePartSchema = z.enum(SCENE_PARTS);
export type ScenePart = z.infer<typeof scenePartSchema>;
