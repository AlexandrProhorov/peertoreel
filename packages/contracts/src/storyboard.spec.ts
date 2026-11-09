import { describe, expect, it } from 'vitest';
import { ARTIFACT_TYPES } from './artifact.js';
import type {
  SceneImplementation,
  Storyboard,
  StoryboardScene,
} from './storyboard.js';
import {
  STORYBOARD_SCHEMA_VERSION,
  normalizeStoryboardToken,
  storyboardSchema,
  storyboardTextContainsWord,
} from './storyboard.js';
import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from './storyboard.fixture.js';
import { derivedWordsSchema } from './timings.js';

function fixture(): typeof storyboardFixture15Deg {
  return structuredClone(storyboardFixture15Deg);
}

function minimalStoryboard(): Storyboard {
  const base = fixture();
  const template = base.scenes[0]!;

  const makeScene = (
    id: string,
    part: 'hook' | 'beat' | 'cta',
    beatIndex: number | null,
    startSec: number,
    endSec: number,
    transition: StoryboardScene['transition'],
  ): StoryboardScene => ({
    ...structuredClone(template),
    id,
    part,
    beatIndex,
    voiceover: {
      text: 'Раз два три',
      startSec,
      endSec,
    },
    durationSec: endSec - startSec,
    objects: [],
    transition,
    version: 1,
  });

  return {
    ...base,
    characters: [],
    audio: {
      wordTimingsKey: base.audio.wordTimingsKey,
      durationSec: 3,
    },
    scenes: [
      makeScene('sc-a', 'hook', null, 0, 1, {
        type: 'crossfade',
        durationSec: 1.2,
      }),
      makeScene('sc-b', 'beat', 0, 1, 2, { type: 'cut', durationSec: 0 }),
      makeScene('sc-c', 'cta', null, 2, 3, { type: 'cut', durationSec: 0 }),
    ],
  };
}

describe('storyboard contract', () => {
  it('accepts the fixed -15° fixture', () => {
    expect(storyboardSchema.safeParse(storyboardFixture15Deg).success).toBe(
      true,
    );
  });

  it('accepts the fixture word timings', () => {
    expect(derivedWordsSchema.safeParse(wordTimingsFixture15Deg).success).toBe(
      true,
    );
  });

  it('has a timing for every sync trigger inside its scene', () => {
    for (const scene of storyboardFixture15Deg.scenes) {
      const sceneWords = wordTimingsFixture15Deg.filter(
        (word) =>
          word.startSec >= scene.voiceover.startSec &&
          word.endSec <= scene.voiceover.endSec,
      );

      expect(sceneWords.length).toBeGreaterThan(0);

      for (const object of scene.objects) {
        if (!object.syncToWord) {
          continue;
        }

        const token = normalizeStoryboardToken(object.syncToWord);

        expect(
          sceneWords.some(
            (word) => normalizeStoryboardToken(word.text) === token,
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps every fixture word inside a scene window', () => {
    for (const word of wordTimingsFixture15Deg) {
      expect(
        storyboardFixture15Deg.scenes.some(
          (scene) =>
            word.startSec >= scene.voiceover.startSec &&
            word.endSec <= scene.voiceover.endSec,
        ),
      ).toBe(true);
    }
  });

  it('round-trips through JSON', () => {
    const parsed = storyboardSchema.parse(storyboardFixture15Deg);
    const roundTripped = storyboardSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTripped).toEqual(parsed);
  });

  it('rejects the old schema version', () => {
    const broken = fixture() as unknown as { schemaVersion: string };
    broken.schemaVersion = 'kadence.storyboard.v1';

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an invalid palette colour', () => {
    const broken = fixture();
    broken.style.palette.accent = 'red';

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('requires at least three scenes', () => {
    const broken = fixture();
    broken.scenes = broken.scenes.slice(0, 2);

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('requires at most twelve scenes', () => {
    const broken = fixture();
    broken.scenes = [...broken.scenes, ...broken.scenes, broken.scenes[0]!];

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('requires a programmatic fallback for every scene', () => {
    const broken = fixture();
    const scene = broken.scenes[0] as unknown as Record<string, unknown>;
    delete scene.fallback;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a scene whose voiceover ends before it starts', () => {
    const broken = fixture();
    broken.scenes[0]!.voiceover.startSec = broken.scenes[0]!.voiceover.endSec;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a duration that differs from the voiceover window', () => {
    const broken = fixture();
    broken.scenes[0]!.durationSec += 1;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a syncToWord that is not spoken in the scene', () => {
    const broken = fixture();
    broken.scenes[0]!.objects[0]!.syncToWord = 'непроизносимое';

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an object window outside its scene', () => {
    const broken = fixture();
    broken.scenes[0]!.objects[0]!.endSec = 6;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an object window with only one bound', () => {
    const broken = fixture();
    broken.scenes[0]!.objects[0]!.startSec = null;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects overlapping scenes', () => {
    const broken = fixture();
    broken.scenes[1]!.voiceover.startSec = 5;
    broken.scenes[1]!.durationSec = 7.6;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a first scene that starts too late', () => {
    const broken = fixture();
    broken.scenes[0]!.voiceover.startSec = 1;
    broken.scenes[0]!.durationSec = 4.2;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a gap between scenes', () => {
    const broken = fixture();
    broken.scenes[1]!.voiceover.startSec = 6;
    broken.scenes[1]!.durationSec = 6.6;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a transition that does not fit the scene', () => {
    const broken = minimalStoryboard();

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts a minimal contiguous storyboard', () => {
    const valid = minimalStoryboard();
    valid.scenes[0]!.transition = { type: 'crossfade', durationSec: 0.5 };

    expect(storyboardSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-cut transition on the last scene', () => {
    const broken = fixture();
    broken.scenes[broken.scenes.length - 1]!.transition = {
      type: 'crossfade',
      durationSec: 0.3,
    };

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects duplicate scene ids', () => {
    const broken = fixture();
    broken.scenes[1]!.id = broken.scenes[0]!.id;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects duplicate object ids within a scene', () => {
    const broken = fixture();
    broken.scenes[0]!.objects[1]!.id = broken.scenes[0]!.objects[0]!.id;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a reference to an undeclared character', () => {
    const broken = fixture();
    broken.scenes[2]!.refs = ['unknown-character'];

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an implementation reference to an undeclared character', () => {
    const broken = fixture();
    const implementation = broken.scenes[1]!.implementation;

    if (implementation.type !== 'image_animation') {
      throw new Error('fixture engine scene must be image_animation');
    }

    implementation.refIds = ['unknown-character'];

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a text object without content', () => {
    const broken = fixture();
    broken.scenes[0]!.objects[0]!.content = null;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts a hybrid implementation', () => {
    const broken = fixture();
    broken.scenes[0]!.implementation = {
      type: 'hybrid',
      layers: [
        {
          role: 'background',
          source: 'programmatic',
          spec: { componentId: 'parallax-city', buildingsSeed: 42 },
        },
        {
          role: 'overlay',
          source: 'image',
          spec: { imageKey: 'runs/example/assets/car.png', opacity: 0.8 },
        },
      ],
    };

    expect(storyboardSchema.safeParse(broken).success).toBe(true);
  });

  it('rejects a first scene that is not the hook', () => {
    const broken = fixture();
    broken.scenes[0]!.part = 'beat';

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a last scene that is not the CTA', () => {
    const broken = fixture();
    broken.scenes[broken.scenes.length - 1]!.part = 'beat';

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an unknown component id', () => {
    const broken = fixture();
    broken.scenes[0]!.implementation = {
      type: 'programmatic',
      componentId: 'unknown-component',
      params: {},
    } as unknown as SceneImplementation;

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts nested JSON params', () => {
    const broken = fixture();
    const implementation = broken.scenes[0]!.implementation;

    if (implementation.type !== 'programmatic') {
      throw new Error('fixture hook must be programmatic');
    }

    implementation.params = {
      nested: { values: [1, 'two', true, null] },
    };

    expect(storyboardSchema.safeParse(broken).success).toBe(true);
  });

  it('rejects non-JSON params', () => {
    const broken = fixture();
    const implementation = broken.scenes[0]!.implementation;

    if (implementation.type !== 'programmatic') {
      throw new Error('fixture hook must be programmatic');
    }

    implementation.params = {
      invalid: (() => undefined) as unknown as never,
    };

    expect(storyboardSchema.safeParse(broken).success).toBe(false);
  });

  it('matches sync words as tokens, not substrings', () => {
    expect(storyboardTextContainsWord('на морозе?', 'морозе')).toBe(true);
    expect(storyboardTextContainsWord('который день', 'кот')).toBe(false);
    expect(storyboardTextContainsWord('Съешь ещё', 'ещё')).toBe(true);
    expect(storyboardTextContainsWord('на морозе', 'на морозе')).toBe(true);
    expect(storyboardTextContainsWord('на морозе', 'морозе на')).toBe(false);
  });
});

describe('storyboard artifacts', () => {
  it('registers storyboard and scene artifacts', () => {
    expect(ARTIFACT_TYPES).toEqual(
      expect.arrayContaining(['storyboard_json', 'scene_clip']),
    );
  });

  it('exposes the schema version', () => {
    expect(STORYBOARD_SCHEMA_VERSION).toBe('peertoreel.storyboard.v1');
  });
});
