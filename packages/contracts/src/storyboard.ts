import { z } from 'zod';
import { jsonObjectSchema } from './json.js';
import { type ScenePart, scenePartSchema } from './scene-part.js';

export const STORYBOARD_SCHEMA_VERSION = 'peertoreel.storyboard.v1';

export const STORYBOARD_STYLE_IDS = [
  'flat_2d_motion',
  'low_poly',
  'pixel_art',
  'cartoon_2d',
  'stylized_3d',
  'science_infographic',
  'cinematic_ai',
  'mixed',
] as const;
export const storyboardStyleIdSchema = z.enum(STORYBOARD_STYLE_IDS);
export type StoryboardStyleId = z.infer<typeof storyboardStyleIdSchema>;

export const STORYBOARD_EFFECT_IDS = [
  'grain',
  'vignette',
  'snow',
  'bokeh',
  'glow',
] as const;
export const storyboardEffectIdSchema = z.enum(STORYBOARD_EFFECT_IDS);
export type StoryboardEffectId = z.infer<typeof storyboardEffectIdSchema>;

/** Components that a storyboard may reference in M3.1. Adding one is additive. */
export const STORYBOARD_COMPONENT_IDS = [
  'parallax-city',
  'kinetic-typography',
  'infographic-gauge',
  'image-parallax',
  'particle-field',
  'cta-card',
] as const;
export const storyboardComponentIdSchema = z.enum(STORYBOARD_COMPONENT_IDS);
export type StoryboardComponentId = z.infer<
  typeof storyboardComponentIdSchema
>;

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB colour');
export type HexColor = z.infer<typeof hexColorSchema>;

export const sceneObjectKindSchema = z.enum([
  'shape',
  'image',
  'text',
  'particles',
  'chart',
  'light',
  'character',
  'overlay',
]);
export type SceneObjectKind = z.infer<typeof sceneObjectKindSchema>;

export const sceneCameraShotSchema = z.enum([
  'extreme_wide',
  'wide',
  'medium',
  'close_up',
  'extreme_close',
]);
export type SceneCameraShot = z.infer<typeof sceneCameraShotSchema>;

export const sceneCameraMovementSchema = z.enum([
  'static',
  'pan',
  'tilt',
  'zoom_in',
  'zoom_out',
  'dolly',
  'orbit',
]);
export type SceneCameraMovement = z.infer<typeof sceneCameraMovementSchema>;

export const sceneTransitionTypeSchema = z.enum([
  'cut',
  'crossfade',
  'slide',
  'wipe',
  'zoom',
  'morph',
]);
export type SceneTransitionType = z.infer<typeof sceneTransitionTypeSchema>;

const CONTENT_REQUIRED_OBJECT_KINDS = new Set([
  'text',
  'character',
  'image',
  'chart',
]);

export const sceneObjectSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: sceneObjectKindSchema,
    /** Text, preset name, asset key or character id, depending on `kind`. */
    content: z.string().min(1).max(500).nullable(),
    animation: z.string().min(1).max(80),
    /**
     * Word from `voiceover.text` that anchors the animation accent. `startSec`
     * is still the visible start, so a title may appear before its accent word.
     */
    syncToWord: z.string().min(1).max(120).nullable(),
    startSec: z.number().finite().nonnegative().nullable(),
    endSec: z.number().finite().nonnegative().nullable(),
  })
  .refine(
    (object) =>
      !CONTENT_REQUIRED_OBJECT_KINDS.has(object.kind) ||
      object.content !== null,
    {
      message: 'This object kind requires content',
      path: ['content'],
    },
  );
export type SceneObject = z.infer<typeof sceneObjectSchema>;

export const sceneCameraSchema = z.object({
  shot: sceneCameraShotSchema,
  movement: sceneCameraMovementSchema,
  speed: z.number().finite().min(0).max(1),
  /** Per-layer parallax coefficients, far to near. */
  parallax: z.array(z.number().finite()).max(12).optional(),
});
export type SceneCamera = z.infer<typeof sceneCameraSchema>;

export const sceneTransitionSchema = z.object({
  type: sceneTransitionTypeSchema,
  /**
   * Outgoing transition at the end of this scene, rendered inside its window.
   * The last scene has no successor and must use `cut` with duration 0.
   * v1 does not overlap scenes; cross-scene `xfade` with handles comes later.
   * See ADR-0012.
   */
  durationSec: z.number().finite().min(0).max(1.5),
});
export type SceneTransition = z.infer<typeof sceneTransitionSchema>;

const programmaticImplementationSchema = z.object({
  type: z.literal('programmatic'),
  componentId: storyboardComponentIdSchema,
  params: jsonObjectSchema,
});

const imageAnimationImplementationSchema = z.object({
  type: z.literal('image_animation'),
  componentId: storyboardComponentIdSchema,
  params: jsonObjectSchema,
  imagePrompt: z.string().min(1).max(2000),
  /** Character ids from `characters[]`; their refImageKey resolves the image. */
  refIds: z.array(z.string().min(1).max(80)).max(12),
});

const aiVideoImplementationSchema = z.object({
  type: z.literal('ai_video'),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  videoPrompt: z.string().min(1).max(2000),
  /** Character ids from `characters[]`; their refImageKey resolves the image. */
  refIds: z.array(z.string().min(1).max(80)).max(12),
  mode: z.enum(['t2v', 'i2v', 'fl2v']),
});

export const sceneHybridLayerSchema = z.object({
  role: z.enum(['background', 'subject', 'overlay']),
  source: z.enum(['programmatic', 'image', 'ai_video']),
  spec: jsonObjectSchema,
});
export type SceneHybridLayer = z.infer<typeof sceneHybridLayerSchema>;

const hybridImplementationSchema = z.object({
  type: z.literal('hybrid'),
  layers: z.array(sceneHybridLayerSchema).min(1).max(8),
});

export const sceneImplementationSchema = z.discriminatedUnion('type', [
  programmaticImplementationSchema,
  imageAnimationImplementationSchema,
  aiVideoImplementationSchema,
  hybridImplementationSchema,
]);
export type SceneImplementation = z.infer<typeof sceneImplementationSchema>;

/**
 * Every scene has a programmatic fallback. If an AI producer fails, the scene
 * degrades to this component instead of failing the whole run.
 */
export const sceneFallbackSchema = z.object({
  type: z.literal('programmatic'),
  componentId: storyboardComponentIdSchema,
  params: jsonObjectSchema,
});
export type SceneFallback = z.infer<typeof sceneFallbackSchema>;

export const storyboardStyleSchema = z.object({
  styleId: storyboardStyleIdSchema,
  palette: z.object({
    background: z.array(hexColorSchema).min(1).max(8),
    accent: hexColorSchema,
    text: hexColorSchema,
    cold: hexColorSchema,
    danger: hexColorSchema,
  }),
  typography: z.object({
    heading: z.string().min(1).max(120),
    body: z.string().min(1).max(120),
    headingWeight: z.number().int().min(100).max(900),
  }),
  effects: z.array(storyboardEffectIdSchema).max(8),
});
export type StoryboardStyle = z.infer<typeof storyboardStyleSchema>;

export const storyboardCharacterSchema = z.object({
  id: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  /** `runs/<runId>/assets/<name>.png`, or null when the character is procedural. */
  refImageKey: z.string().min(1).max(500).nullable(),
});
export type StoryboardCharacter = z.infer<typeof storyboardCharacterSchema>;

export const storyboardAudioSchema = z.object({
  /** `runs/<runId>/voiceover/word_timings.json` — the timing source of truth. */
  wordTimingsKey: z.string().min(1).max(500),
  durationSec: z.number().finite().positive(),
});
export type StoryboardAudio = z.infer<typeof storyboardAudioSchema>;

export type StoryboardScenePart = ScenePart;

const DURATION_TOLERANCE_SEC = 0.15;
const SCENE_JOIN_TOLERANCE_SEC = 0.05;
const AUDIO_SUM_TOLERANCE_SEC = 1;
const FIRST_SCENE_START_TOLERANCE_SEC = 0.5;
const LAST_SCENE_END_TOLERANCE_SEC = 0.5;

export const storyboardSceneSchema = z
  .object({
    id: z.string().min(1).max(80),
    part: scenePartSchema,
    beatIndex: z.number().int().nonnegative().nullable(),
    voiceover: z.object({
      text: z.string().min(1).max(2000),
      startSec: z.number().finite().nonnegative(),
      endSec: z.number().finite().positive(),
    }),
    /** Derived from the voiceover window; see ADR-0012. */
    durationSec: z.number().finite().positive(),
    description: z.string().min(1).max(2000),
    environment: z.object({
      setting: z.string().min(1).max(120),
      layers: z.array(z.string().min(1).max(120)).max(20),
    }),
    camera: sceneCameraSchema,
    objects: z.array(sceneObjectSchema).max(50),
    effects: z.array(z.string().min(1).max(80)).max(20),
    transition: sceneTransitionSchema,
    imagePrompt: z.string().min(1).max(2000).nullable(),
    videoPrompt: z.string().min(1).max(2000).nullable(),
    /** Character ids used by this scene; resolved through characters[].refImageKey. */
    refs: z.array(z.string().min(1).max(80)).max(12).nullable(),
    implementation: sceneImplementationSchema,
    fallback: sceneFallbackSchema,
    /** Incremented when one scene is regenerated. */
    version: z.number().int().positive().default(1),
  })
  .superRefine((scene, ctx) => {
    const { startSec, endSec } = scene.voiceover;

    if (endSec <= startSec) {
      addIssue(
        ctx,
        ['voiceover', 'endSec'],
        'Scene voiceover must end after it starts',
      );
    }

    const windowSec = endSec - startSec;

    if (Math.abs(scene.durationSec - windowSec) > DURATION_TOLERANCE_SEC) {
      addIssue(
        ctx,
        ['durationSec'],
        'Scene duration must match its voiceover window',
      );
    }

    if (scene.transition.durationSec > scene.durationSec) {
      addIssue(
        ctx,
        ['transition', 'durationSec'],
        'Transition must fit inside the scene',
      );
    }

    const objectIds = new Set<string>();

    scene.objects.forEach((object, objectIndex) => {
      const objectPath = ['objects', objectIndex] as const;
      const hasStart = object.startSec !== null;
      const hasEnd = object.endSec !== null;

      if (objectIds.has(object.id)) {
        addIssue(
          ctx,
          [...objectPath, 'id'],
          'Object ids must be unique within a scene',
        );
      }

      objectIds.add(object.id);

      if (
        object.syncToWord !== null &&
        !storyboardTextContainsWord(scene.voiceover.text, object.syncToWord)
      ) {
        addIssue(
          ctx,
          [...objectPath, 'syncToWord'],
          'syncToWord must appear in the scene voiceover',
        );
      }

      if (hasStart !== hasEnd) {
        addIssue(
          ctx,
          [...objectPath, 'startSec'],
          'Object window must define both startSec and endSec',
        );
        return;
      }

      if (object.startSec === null || object.endSec === null) {
        return;
      }

      if (object.endSec <= object.startSec) {
        addIssue(
          ctx,
          [...objectPath, 'endSec'],
          'Object window must end after it starts',
        );
      }

      if (
        object.startSec < startSec - DURATION_TOLERANCE_SEC ||
        object.endSec > endSec + DURATION_TOLERANCE_SEC
      ) {
        addIssue(
          ctx,
          [...objectPath, 'startSec'],
          'Object window must stay inside its scene',
        );
      }
    });
  });
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

export function normalizeStoryboardToken(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokenizeStoryboardText(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeStoryboardToken)
    .filter((token) => token.length > 0);
}

/**
 * `syncToWord` must actually be spoken in the scene. Token equality (not a
 * substring) prevents "кот" from matching "который".
 */
export function storyboardTextContainsWord(
  text: string,
  word: string,
): boolean {
  const textTokens = tokenizeStoryboardText(text);
  const wordTokens = tokenizeStoryboardText(word);

  if (wordTokens.length === 0) {
    return false;
  }

  if (wordTokens.length === 1) {
    return textTokens.includes(wordTokens[0] as string);
  }

  for (let index = 0; index <= textTokens.length - wordTokens.length; index += 1) {
    if (
      wordTokens.every(
        (token, offset) => textTokens[index + offset] === token,
      )
    ) {
      return true;
    }
  }

  return false;
}

function addIssue(
  ctx: z.RefinementCtx,
  path: readonly (string | number)[],
  message: string,
): void {
  ctx.addIssue({ code: 'custom', path: [...path], message });
}

export const storyboardSchema = z
  .object({
    schemaVersion: z.literal(STORYBOARD_SCHEMA_VERSION),
    runId: z.uuid(),
    style: storyboardStyleSchema,
    characters: z.array(storyboardCharacterSchema).max(20),
    audio: storyboardAudioSchema,
    scenes: z.array(storyboardSceneSchema).min(3).max(12),
  })
  .superRefine((storyboard, ctx) => {
    const characterIds = new Set(
      storyboard.characters.map((character) => character.id),
    );
    const sceneIds = new Set<string>();
    let previousEndSec: number | null = null;
    let durationSumSec = 0;

    storyboard.scenes.forEach((scene, sceneIndex) => {
      const scenePath = ['scenes', sceneIndex] as const;

      if (sceneIds.has(scene.id)) {
        addIssue(ctx, [...scenePath, 'id'], 'Scene ids must be unique');
      }

      sceneIds.add(scene.id);
      durationSumSec += scene.durationSec;

      if (previousEndSec !== null) {
        if (
          Math.abs(scene.voiceover.startSec - previousEndSec) >
          SCENE_JOIN_TOLERANCE_SEC
        ) {
          addIssue(
            ctx,
            [...scenePath, 'voiceover', 'startSec'],
            'Scenes must be contiguous and must not overlap',
          );
        }
      } else if (
        scene.voiceover.startSec > FIRST_SCENE_START_TOLERANCE_SEC
      ) {
        addIssue(
          ctx,
          [...scenePath, 'voiceover', 'startSec'],
          'First scene must start near the beginning of the audio',
        );
      }

      previousEndSec = scene.voiceover.endSec;

      scene.refs?.forEach((refId, refIndex) => {
        if (!characterIds.has(refId)) {
          addIssue(
            ctx,
            [...scenePath, 'refs', refIndex],
            'refs must reference a declared character',
          );
        }
      });

      if (
        scene.implementation.type === 'image_animation' ||
        scene.implementation.type === 'ai_video'
      ) {
        scene.implementation.refIds.forEach((refId, refIndex) => {
          if (!characterIds.has(refId)) {
            addIssue(
              ctx,
              [...scenePath, 'implementation', 'refIds', refIndex],
              'refIds must reference a declared character',
            );
          }
        });
      }
    });

    const firstScene = storyboard.scenes[0];
    const lastScene = storyboard.scenes[storyboard.scenes.length - 1];

    if (
      lastScene &&
      (lastScene.transition.type !== 'cut' ||
        lastScene.transition.durationSec !== 0)
    ) {
      addIssue(
        ctx,
        ['scenes', storyboard.scenes.length - 1, 'transition'],
        'Last scene must use a cut transition',
      );
    }

    if (
      lastScene &&
      lastScene.voiceover.endSec >
        storyboard.audio.durationSec + LAST_SCENE_END_TOLERANCE_SEC
    ) {
      addIssue(
        ctx,
        ['scenes', storyboard.scenes.length - 1, 'voiceover', 'endSec'],
        'Last scene must not end after the audio track',
      );
    }

    if (
      Math.abs(durationSumSec - storyboard.audio.durationSec) >
      AUDIO_SUM_TOLERANCE_SEC
    ) {
      addIssue(
        ctx,
        ['audio', 'durationSec'],
        'Scene durations must add up to the audio duration',
      );
    }

    if (firstScene && firstScene.part !== 'hook') {
      addIssue(ctx, ['scenes', 0, 'part'], 'First scene must be the hook');
    }

    if (lastScene && lastScene.part !== 'cta') {
      addIssue(
        ctx,
        ['scenes', storyboard.scenes.length - 1, 'part'],
        'Last scene must be the CTA',
      );
    }
  });
export type Storyboard = z.infer<typeof storyboardSchema>;
