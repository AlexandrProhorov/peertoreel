import { describe, expect, it } from 'vitest';
import {
  countStoryboardDraftWords,
  storyboardDraftSchema,
  type StoryboardDraft,
} from './storyboard.director.js';

function draft(): StoryboardDraft {
  return {
    title: 'Почему у собак мокрый нос',
    scenes: [
      {
        id: 'wet-nose-hook',
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
        id: 'wet-nose-fact',
        part: 'beat',
        text: 'Влажная плёнка на носу собаки растворяет молекулы запаха и удерживает их гораздо лучше.',
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
        id: 'wet-nose-compare',
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
        id: 'wet-nose-process',
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
        id: 'wet-nose-cta',
        part: 'cta',
        text: 'Подписывайся на канал, чтобы узнавать больше интересных фактов о мире каждый день.',
        description: 'Финальный призыв',
        recipeId: 'cta',
        variant: 'pill-button',
        slots: {
          action: 'ПОДПИШИСЬ',
          subtitle: 'БОЛЬШЕ НАУКИ',
        },
      },
    ],
  };
}

function clone(): StoryboardDraft {
  return structuredClone(draft());
}

function issuePaths(value: unknown): string[] {
  const result = storyboardDraftSchema.safeParse(value);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => issue.path.map(String).join('.'));
}

describe('storyboard director draft', () => {
  it('accepts a valid five-scene draft and counts its words', () => {
    const value = draft();

    expect(storyboardDraftSchema.safeParse(value).success).toBe(true);
    expect(countStoryboardDraftWords(value)).toBeGreaterThanOrEqual(60);
    expect(countStoryboardDraftWords(value)).toBeLessThanOrEqual(170);
  });

  it('requires the first scene to be the hook', () => {
    const value = clone();
    value.scenes[0]!.part = 'beat';

    expect(issuePaths(value)).toContain('scenes.0.part');
  });

  it('requires the last scene to be the CTA', () => {
    const value = clone();
    value.scenes[4]!.part = 'beat';

    expect(issuePaths(value)).toContain('scenes.4.part');
  });

  it('requires middle scenes to be beats', () => {
    const value = clone();
    value.scenes[2]!.part = 'cta';

    expect(issuePaths(value)).toContain('scenes.2.part');
  });

  it('requires unique scene ids', () => {
    const value = clone();
    value.scenes[1]!.id = value.scenes[0]!.id;

    expect(issuePaths(value)).toContain('scenes.1.id');
  });

  it('rejects unknown recipes and variants', () => {
    const unknownRecipe = clone();
    unknownRecipe.scenes[0]!.recipeId = 'nope' as StoryboardDraft['scenes'][number]['recipeId'];

    const unknownVariant = clone();
    unknownVariant.scenes[0]!.variant = 'nope';

    expect(issuePaths(unknownRecipe)).toContain('scenes.0.recipeId');
    expect(issuePaths(unknownVariant)).toContain('scenes.0.variant');
  });

  it('rejects an unknown starter asset with a nested slot path', () => {
    const value = clone();
    value.scenes[1]!.slots.subject = { assetKey: 'unicorn' };

    expect(issuePaths(value)).toContain(
      'scenes.1.slots.subject.assetKey',
    );
  });

  it('rejects a missing required slot', () => {
    const value = clone();
    value.scenes[1]!.slots = { subject: { assetKey: 'scent-wave' } };

    expect(issuePaths(value)).toContain('scenes.1.slots.fact');
  });

  it('requires five to eight scenes', () => {
    const value = clone();
    value.scenes = value.scenes.slice(0, 4);

    expect(issuePaths(value)).toContain('scenes');
  });

  it('rejects narration outside the 60..170 word budget', () => {
    const short = clone();
    short.scenes = short.scenes.map((scene) => ({
      ...scene,
      text: 'Короткая фраза.',
    }));

    expect(issuePaths(short)).toContain('scenes');
  });

  it('rejects a scene with too few words', () => {
    const value = clone();
    value.scenes[2]!.text = 'Два слова';

    expect(issuePaths(value)).toContain('scenes.2.text');
  });
});
