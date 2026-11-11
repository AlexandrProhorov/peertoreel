import {
  STARTER_ASSET_CATALOG,
  type DerivedWord,
  type StoryboardDraft,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { buildStoryboardFromDraft } from '../storyboard/build.js';
import { M3_5_STYLE } from '../storyboard/style.js';
import { collectEpisodeSubjects, queryForReference } from './subjects.js';

const runId = '11111111-1111-4111-8111-111111111111';

const texts = [
  'Почему у собак мокрый нос',
  'Нос покрыт тонкой слизью',
  'Подпишись на канал',
];

const words: DerivedWord[] = texts
  .join(' ')
  .split(' ')
  .map((text, index) => ({
    text,
    startSec: index * 0.4,
    endSec: (index + 1) * 0.4,
  }));

const draft: StoryboardDraft = {
  title: 'Почему у собак мокрый нос',
  scenes: [
    {
      id: 'wet-nose-hook',
      part: 'hook',
      text: texts[0] as string,
      description: 'Собака крупным планом, нос блестит',
      recipeId: 'hook-hero',
      variant: 'subject-lead',
      slots: {
        title: 'Мокрый нос',
        subject: { assetKey: 'dog-snout', fallbackIcon: null },
      },
    },
    {
      id: 'wet-nose-fact',
      part: 'beat',
      text: texts[1] as string,
      description: 'Капля слизи на поверхности',
      recipeId: 'fact-object',
      variant: 'stage',
      slots: {
        subject: { assetKey: 'water-drop', fallbackIcon: null },
        fact: 'Слизь защищает нос',
      },
    },
    {
      id: 'wet-nose-cta',
      part: 'cta',
      text: texts[2] as string,
      description: 'Кнопка подписки',
      recipeId: 'cta',
      variant: 'pill-button',
      slots: { action: 'Подпишись' },
    },
  ],
};

const storyboard = buildStoryboardFromDraft({
  draft,
  words,
  audioDurationSec: words.at(-1)?.endSec ?? 4.8,
  runId,
  style: M3_5_STYLE,
});

describe('episode subjects', () => {
  it('collects only recipe subject slots with starter tag queries', () => {
    const subjects = collectEpisodeSubjects(storyboard);

    expect(subjects).toHaveLength(2);
    expect(subjects[0]).toMatchObject({
      sceneId: 'wet-nose-hook',
      sceneIdx: 0,
      reference: STARTER_ASSET_CATALOG['dog-snout'].path,
      lang: undefined,
    });
    expect(subjects[0]?.query).toBe(
      STARTER_ASSET_CATALOG['dog-snout'].tags.slice(0, 3).join(' '),
    );
    expect(subjects[1]).toMatchObject({
      sceneId: 'wet-nose-fact',
      reference: STARTER_ASSET_CATALOG['water-drop'].path,
    });
  });

  it('falls back to the scene description in Russian for unknown keys', () => {
    expect(queryForReference('assets/custom/planet.svg', ' Планета в разрезе ')).toEqual({
      query: 'Планета в разрезе',
      lang: 'ru',
    });
  });
});
