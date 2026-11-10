import {
  getRecipeVariant,
  storyboardSchema,
  type DerivedWord,
  type Storyboard,
  type StoryboardDraft,
  type StoryboardStyle,
} from '@peertoreel/contracts';

export class StoryboardTimingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardTimingError';
  }
}

export interface BuildStoryboardInput {
  draft: StoryboardDraft;
  words: readonly DerivedWord[];
  audioDurationSec: number;
  runId: string;
  style: StoryboardStyle;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function roundSec(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fallbackText(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

/**
 * Build the final `storyboard.v1` from the director's draft and the real TTS
 * word timings. The LLM never supplies timings (ADR-0012 D6).
 *
 * Scene windows are contiguous: the first scene starts at 0, each next scene
 * starts where the previous one ends, and the last scene ends with the audio.
 * Pauses between spoken phrases stay covered by the previous scene.
 */
export function buildStoryboardFromDraft({
  draft,
  words,
  audioDurationSec,
  runId,
  style,
}: BuildStoryboardInput): Storyboard {
  if (!Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
    throw new StoryboardTimingError(
      `Voiceover duration must be positive, received ${audioDurationSec}`,
    );
  }

  const sceneWordCounts = draft.scenes.map((scene) => countWords(scene.text));
  const expectedWords = sceneWordCounts.reduce((sum, count) => sum + count, 0);

  if (words.length !== expectedWords) {
    throw new StoryboardTimingError(
      `TTS produced ${words.length} words but the draft has ${expectedWords} (${sceneWordCounts.join(
        ', ',
      )}); align the narration before building the storyboard`,
    );
  }

  const roundedAudioSec = roundSec(audioDurationSec);
  const starts: number[] = [0];
  let wordCursor = 0;

  for (let index = 1; index < draft.scenes.length; index += 1) {
    wordCursor += sceneWordCounts[index - 1] ?? 0;
    const firstWord = words[wordCursor];

    if (!firstWord) {
      throw new StoryboardTimingError(
        `No word timing for the first word of scene ${index}`,
      );
    }

    starts.push(roundSec(firstWord.startSec));
  }

  const ends = starts.map((_, index) =>
    index < starts.length - 1
      ? (starts[index + 1] as number)
      : roundedAudioSec,
  );

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] as number;
    const end = ends[index] as number;

    if (end - start < 0.2) {
      throw new StoryboardTimingError(
        `Scene ${index} window is ${(end - start).toFixed(3)}s; expected at least 0.2s`,
      );
    }
  }

  let beatIndex = 0;

  const scenes = draft.scenes.map((scene, index) => {
    const variant = getRecipeVariant(scene.recipeId, scene.variant);

    if (variant === null) {
      throw new StoryboardTimingError(
        `Unknown recipe variant "${scene.recipeId}/${scene.variant}" in scene ${index}`,
      );
    }

    const startSec = starts[index] as number;
    const endSec = ends[index] as number;
    const durationSec = roundSec(endSec - startSec);
    const isLast = index === draft.scenes.length - 1;
    const transition =
      isLast || durationSec < 0.6
        ? { type: 'cut' as const, durationSec: 0 }
        : { type: 'crossfade' as const, durationSec: 0.25 };

    return {
      id: scene.id,
      part: scene.part,
      beatIndex: scene.part === 'beat' ? beatIndex++ : null,
      voiceover: {
        text: scene.text,
        startSec,
        endSec,
      },
      durationSec,
      description: scene.description,
      environment: {
        setting: `recipe:${scene.recipeId}`,
        layers: [],
      },
      camera: {
        shot: variant.cameraHint.shot,
        movement: variant.cameraHint.movement,
        speed: variant.cameraHint.speed,
      },
      objects: [],
      effects: [],
      transition,
      imagePrompt: null,
      videoPrompt: null,
      refs: null,
      implementation: {
        type: 'recipe' as const,
        recipeId: scene.recipeId,
        variant: scene.variant,
        slots: scene.slots,
      },
      fallback: {
        type: 'programmatic' as const,
        componentId: 'kinetic-typography' as const,
        params: {
          text: fallbackText(scene.text),
          preset: 'statement',
          align: 'center',
        },
      },
      version: 1,
    };
  });

  return storyboardSchema.parse({
    schemaVersion: 'peertoreel.storyboard.v1',
    runId,
    style,
    characters: [],
    audio: {
      wordTimingsKey: `runs/${runId}/voiceover/word_timings.json`,
      durationSec: roundedAudioSec,
    },
    scenes,
  });
}
