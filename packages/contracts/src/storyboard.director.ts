import { z } from 'zod';
import { jsonObjectSchema } from './json.js';
import { SCENE_PARTS } from './scene-part.js';
import {
  InvalidRecipeSlotError,
  STORYBOARD_RECIPE_IDS,
  UnknownRecipeVariantError,
  UnknownSceneRecipeError,
  parseRecipeSlots,
} from './storyboard.recipes.js';

/**
 * The DeepSeek director returns a draft, not a final storyboard: scene text and
 * recipe slots only. Timings, camera and fallback are derived by code from the
 * real voiceover and the recipe catalog (ADR-0012 D6, M3.5).
 */
export const STORYBOARD_EPISODE_MIN_SCENES = 5;
export const STORYBOARD_EPISODE_MAX_SCENES = 8;

const MIN_SCENE_WORDS = 3;
const MAX_SCENE_WORDS = 60;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

export const storyboardDraftSceneSchema = z
  .object({
    /** Latin slug, unique within the episode. */
    id: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Expected a latin slug'),
    part: z.enum(SCENE_PARTS),
    /** Exactly what the voiceover says; no stage directions. */
    text: z.string().min(8).max(600),
    /** Production note for the director/reviewer, not spoken. */
    description: z.string().min(3).max(300),
    recipeId: z.enum(STORYBOARD_RECIPE_IDS),
    variant: z.string().min(1).max(80),
    slots: jsonObjectSchema,
  })
  .superRefine((scene, ctx) => {
    const words = countWords(scene.text);

    if (words < MIN_SCENE_WORDS || words > MAX_SCENE_WORDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: `Scene text must contain ${MIN_SCENE_WORDS}..${MAX_SCENE_WORDS} words, received ${words}`,
      });
    }
  });
export type StoryboardDraftScene = z.infer<
  typeof storyboardDraftSceneSchema
>;

export const storyboardDraftSchema = z
  .object({
    title: z.string().min(3).max(120),
    scenes: z
      .array(storyboardDraftSceneSchema)
      .min(STORYBOARD_EPISODE_MIN_SCENES)
      .max(STORYBOARD_EPISODE_MAX_SCENES),
  })
  .superRefine((draft, ctx) => {
    const ids = new Set<string>();

    draft.scenes.forEach((scene, index) => {
      const scenePath = ['scenes', index] as const;

      if (ids.has(scene.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...scenePath, 'id'],
          message: 'Scene ids must be unique',
        });
      }

      ids.add(scene.id);

      try {
        parseRecipeSlots(scene.recipeId, scene.variant, scene.slots);
      } catch (error) {
        if (error instanceof InvalidRecipeSlotError) {
          ctx.addIssue({
            code: 'custom',
            path: [...scenePath, 'slots', ...error.path.split('.')],
            message: error.message,
          });
          return;
        }

        if (error instanceof UnknownSceneRecipeError) {
          ctx.addIssue({
            code: 'custom',
            path: [...scenePath, 'recipeId'],
            message: error.message,
          });
          return;
        }

        if (error instanceof UnknownRecipeVariantError) {
          ctx.addIssue({
            code: 'custom',
            path: [...scenePath, 'variant'],
            message: error.message,
          });
          return;
        }

        throw error;
      }
    });

    const first = draft.scenes[0];
    const last = draft.scenes[draft.scenes.length - 1];
    const totalWords = draft.scenes.reduce(
      (sum, scene) => sum + countWords(scene.text),
      0,
    );

    if (totalWords < 60 || totalWords > 110) {
      ctx.addIssue({
        code: 'custom',
        path: ['scenes'],
        message: `Episode narration must contain 60..110 words, received ${totalWords}`,
      });
    }

    if (first && first.part !== 'hook') {
      ctx.addIssue({
        code: 'custom',
        path: ['scenes', 0, 'part'],
        message: 'First scene must be the hook',
      });
    }

    if (last && last.part !== 'cta') {
      ctx.addIssue({
        code: 'custom',
        path: ['scenes', draft.scenes.length - 1, 'part'],
        message: 'Last scene must be the CTA',
      });
    }

    draft.scenes.forEach((scene, index) => {
      const isEdge = index === 0 || index === draft.scenes.length - 1;

      if (!isEdge && scene.part !== 'beat') {
        ctx.addIssue({
          code: 'custom',
          path: ['scenes', index, 'part'],
          message: 'Middle scenes must be beats',
        });
      }

      if (isEdge && scene.part === 'beat') {
        ctx.addIssue({
          code: 'custom',
          path: ['scenes', index, 'part'],
          message: 'Hook and CTA must not be beats',
        });
      }
    });
  });
export type StoryboardDraft = z.infer<typeof storyboardDraftSchema>;

export function countStoryboardDraftWords(draft: StoryboardDraft): number {
  return draft.scenes.reduce(
    (sum, scene) => sum + countWords(scene.text),
    0,
  );
}
