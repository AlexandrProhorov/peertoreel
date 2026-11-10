import {
  getRecipeVariant,
  storyboardSchema,
  type DerivedWord,
  type StoryboardDraft,
  type StoryboardStyle,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  StoryboardTimingError,
  buildStoryboardFromDraft,
} from './build.js';

const STYLE: StoryboardStyle = {
  styleId: 'flat_2d_motion',
  palette: {
    background: ['#0b1220', '#16233c'],
    accent: '#ffd166',
    text: '#ffffff',
    cold: '#8ecae6',
    danger: '#ef476f',
  },
  typography: { heading: 'Montserrat', body: 'Inter', headingWeight: 900 },
  effects: ['vignette'],
};

function draft(): StoryboardDraft {
  return {
    title: 'Почему у собак мокрый нос',
    scenes: [
      {
        id: 'hook',
        part: 'hook',
        text: 'Почему у собак нос всегда влажный и зачем природе нужен этот механизм?',
        description: 'Крупная морда собаки и вопрос',
        recipeId: 'hook-hero',
        variant: 'subject-lead',
        slots: {
          title: 'ПОЧЕМУ У СОБАК МОКРЫЙ НОС?',
          subject: { assetKey: 'dog-snout' },
        },
      },
      {
        id: 'fact',
        part: 'beat',
        text: 'Влажная плёнка на носу растворяет молекулы запаха и удерживает их гораздо лучше.',
        description: 'Нос как датчик запаха',
        recipeId: 'fact-object',
        variant: 'stage',
        slots: {
          fact: 'ВЛАЖНАЯ ПЛЁНКА ЛОВИТ МОЛЕКУЛЫ',
          subject: { assetKey: 'scent-wave' },
          metric: '×1000',
        },
      },
      {
        id: 'compare',
        part: 'beat',
        text: 'Сухой нос теряет большую часть сигнала, а мокрый сохраняет его почти полностью.',
        description: 'Сравнение мокрого и сухого носа',
        recipeId: 'comparison',
        variant: 'bars',
        slots: {
          left: { label: 'МОКРЫЙ', value: '100%', fraction: 1 },
          right: { label: 'СУХОЙ', value: '35%', fraction: 0.35 },
          verdict: 'ВЛАГА УСИЛИВАЕТ ЗАПАХ',
        },
      },
      {
        id: 'process',
        part: 'beat',
        text: 'Сначала молекулы растворяются, потом рецепторы считывают сигнал, и мозг узнаёт запах.',
        description: 'Три шага распознавания запаха',
        recipeId: 'process',
        variant: 'timeline',
        slots: {
          title: 'КАК ЭТО РАБОТАЕТ',
          steps: [{ label: 'МОЛЕКУЛЫ' }, { label: 'РЕЦЕПТОРЫ' }],
        },
      },
      {
        id: 'cta',
        part: 'cta',
        text: 'Подписывайся на канал, чтобы узнавать больше интересных фактов о мире каждый день.',
        description: 'Финальный призыв',
        recipeId: 'cta',
        variant: 'pill-button',
        slots: { action: 'ПОДПИШИСЬ', subtitle: 'БОЛЬШЕ НАУКИ' },
      },
    ],
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function wordsFor(value: StoryboardDraft, stepSec = 0.4): DerivedWord[] {
  const tokens = value.scenes.flatMap((scene) =>
    scene.text.trim().split(/\s+/).filter(Boolean),
  );

  return tokens.map((text, index) => ({
    text,
    startSec: index * stepSec,
    endSec: index * stepSec + stepSec * 0.8,
  }));
}

function build(value = draft(), words = wordsFor(value), audioDurationSec = 30) {
  return buildStoryboardFromDraft({
    draft: value,
    words,
    audioDurationSec,
    runId: 'b1f0c2de-0000-4000-8000-000000000055',
    style: STYLE,
  });
}

describe('storyboard build from director draft', () => {
  it('produces a valid storyboard with contiguous voiceover windows', () => {
    const storyboard = build();
    const total = storyboard.scenes.reduce(
      (sum, scene) => sum + scene.durationSec,
      0,
    );

    expect(storyboardSchema.safeParse(storyboard).success).toBe(true);
    expect(storyboard.scenes).toHaveLength(5);
    expect(storyboard.scenes[0]?.voiceover.startSec).toBe(0);
    expect(storyboard.scenes[4]?.voiceover.endSec).toBe(30);
    expect(total).toBeCloseTo(30, 5);

    for (let index = 1; index < storyboard.scenes.length; index += 1) {
      expect(storyboard.scenes[index]?.voiceover.startSec).toBe(
        storyboard.scenes[index - 1]?.voiceover.endSec,
      );
    }
  });

  it('derives beat indices from scene order', () => {
    const storyboard = build();

    expect(storyboard.scenes.map((scene) => scene.beatIndex)).toEqual([
      null,
      0,
      1,
      2,
      null,
    ]);
  });

  it('uses the recipe camera hint and keeps scene objects empty', () => {
    const storyboard = build();
    const expected = getRecipeVariant('hook-hero', 'subject-lead')!;

    expect(storyboard.scenes[0]?.camera).toEqual(expected.cameraHint);
    expect(storyboard.scenes.every((scene) => scene.objects.length === 0)).toBe(
      true,
    );
  });

  it('keeps a programmatic kinetic-typography fallback on every recipe scene', () => {
    const storyboard = build();

    for (const scene of storyboard.scenes) {
      expect(scene.implementation.type).toBe('recipe');
      expect(scene.fallback).toMatchObject({
        type: 'programmatic',
        componentId: 'kinetic-typography',
      });
      expect(scene.fallback.params).toMatchObject({ preset: 'statement' });
    }
  });

  it('cuts the last scene and crossfades earlier scenes', () => {
    const storyboard = build();

    expect(storyboard.scenes.at(-1)?.transition).toEqual({
      type: 'cut',
      durationSec: 0,
    });
    expect(storyboard.scenes[0]?.transition).toEqual({
      type: 'crossfade',
      durationSec: 0.25,
    });
  });

  it('truncates an overlong fallback text', () => {
    const value = draft();
    value.scenes[1]!.text = `${'СЛОВО '.repeat(40)}конец`;

    const storyboard = build(
      value,
      wordsFor(value),
      wordsFor(value).at(-1)!.endSec + 1,
    );
    const fallback = storyboard.scenes[1]?.fallback.params as {
      text: string;
    };

    expect(fallback.text.length).toBeLessThanOrEqual(160);
  });

  it('throws when the TTS word count does not match the draft', () => {
    const value = draft();
    const words = wordsFor(value).slice(0, -1);

    expect(() => build(value, words)).toThrow(StoryboardTimingError);
    expect(() => build(value, words)).toThrow(/words/);
  });

  it('throws for non-positive audio and collapsed scene windows', () => {
    const value = draft();
    const words = wordsFor(value);

    expect(() => build(value, words, 0)).toThrow(StoryboardTimingError);
    expect(() =>
      build(
        value,
        words.map((word) => ({ ...word, startSec: 0, endSec: 0.05 })),
        30,
      ),
    ).toThrow(/window/);
  });

  it('matches the draft word counts to scene windows', () => {
    const value = draft();
    const storyboard = build(value, wordsFor(value), 30);
    const firstSceneWords = wordCount(value.scenes[0]!.text);
    const secondStart = firstSceneWords * 0.4;

    expect(storyboard.scenes[0]?.voiceover.endSec).toBeCloseTo(
      secondStart,
      3,
    );
  });
});
