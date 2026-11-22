import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';

/**
 * Variant lab: the same reference beat map, reproduced with different narrative
 * devices, themes and compositions. Texts are kept identical wherever the beat
 * allows it, so the difference in the output is visual, not textual.
 *
 * This is the manual precursor of Device Selection: the patches below are what
 * an LLM would be asked to produce for each rhetorical frame.
 */
interface Variant {
  readonly id: string;
  readonly frame: string;
  readonly patch: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

const OWL = {
  key: 'owl',
  contentHash:
    '7dfcdcdebd599787719d98f3057b0822522678e6752369ca3498a780ca7ba443',
};
const PANDA = {
  key: 'panda',
  contentHash:
    '31524ed035f8d769bc7d437268f30a65eb309ea216e84c09823d4f36c2f97070',
};
const CANDY = {
  key: 'candy',
  contentHash:
    '79607ed1b5a0b96117723261fb9c79db77e63b154cebbd9af42ee8ddb6776fb9',
};
const FRAMED_PICTURE = {
  key: 'framed-picture',
  contentHash:
    'e70eeb3cd3b5c8bd6633a9ddf0c5f0bb7e0c4be45c89b9b2aad689276aad35bc',
};
const CRYSTAL_BALL = {
  key: 'crystal-ball',
  contentHash:
    'f42c5484bea4f33f7ba8ee2b5c7e2a51d17a9fcec36f2ba92334f62b7f95eb43',
};
const LEDGER = {
  key: 'ledger',
  contentHash:
    'c72c7ec1511af9f556f5a44c257db68b9e13d68a8e6883ed4e4df3aec07f63c8',
};
const FULL_MOON = {
  key: 'full-moon',
  contentHash:
    '00dd24efe4fc9b13a020f59309d962ecd3bede581abeca5111056a8fc84c779e',
};
const RED_HEART = {
  key: 'red-heart',
  contentHash:
    '7218cb9f08ed1ef38fcd83fe699a1125d07f50725f4c87a68cb7c9f4efb3c32b',
};

const VARIANTS: readonly Variant[] = [
  {
    id: 'a-dialogue',
    frame: 'диалог: история рассказывается репликами и реакциями',
    patch: {
      hook: { themeId: 'studio-light' },
      'all-conversations': {
        device: 'chat-reconstruction',
        themeId: 'studio-light',
        title: 'все наши разговоры',
        avatar: OWL,
        messages: [
          { text: 'про работу', appearAtSec: 0.4 },
          { text: 'про переезд', appearAtSec: 1.1 },
          { text: 'про деньги', appearAtSec: 1.8 },
        ],
      },
      'do-not-soften': {
        device: 'object-reveal',
        themeId: 'studio-lime',
        object: CANDY,
        caption: 'не смягчай, чтобы было приятно',
        tone: 'lime',
        tiltDeg: -4,
      },
      'first-answer': {
        device: 'title-stack',
        themeId: 'studio-dark',
        title: 'первый ответ пугает',
        subtitle: null,
        eyebrow: null,
        align: 'center',
        highlightWords: [],
        icons: [FRAMED_PICTURE],
        vertical: 'middle',
        centerMark: false,
      },
    },
  },
  {
    id: 'b-text',
    frame: 'текст: история рассказывается цитатами и выделением',
    patch: {
      'all-conversations': {
        device: 'text-selection',
        themeId: 'studio-light',
        title: 'архив разговоров',
        lines: [
          'про работу',
          'про переезд',
          'все наши разговоры',
          'про деньги',
          'и ни слова вслух',
        ],
        selectionLineIndex: 2,
      },
      'prompt-1': { themeId: 'studio-light' },
      'first-answer': { tone: 'dark' },
    },
  },
  {
    id: 'c-objects',
    frame: 'объекты: история рассказывается предметами и цветом',
    patch: {
      hook: {
        themeId: 'studio-light',
        icons: [LEDGER, FULL_MOON, RED_HEART],
      },
      'all-conversations': { themeId: 'studio-dark' },
      'do-not-soften': { themeId: 'studio-lime' },
      'between-lines': { themeId: 'studio-light' },
      'same-chat': { themeId: 'studio-dark' },
      'almost-everyone': { themeId: 'studio-light' },
      'predict-five-years': { object: CRYSTAL_BALL },
    },
  },
];

function applyPatch(episode: UiEpisode, patch: Variant['patch']): UiEpisode {
  return {
    ...episode,
    scenes: episode.scenes.map((scene) => {
      const override = patch[scene.id];

      return override === undefined
        ? scene
        : ({ ...scene, ...override } as UiEpisode['scenes'][number]);
    }),
  };
}

function describe(episode: UiEpisode): string {
  return episode.scenes
    .map((scene) => `${scene.id}:${scene.device}|${scene.themeId ?? episode.themeId}`)
    .join(' ');
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const inputPath = path.resolve(
    cwd,
    'src/ui-demo/reference-episode.json',
  );
  const outDir = path.resolve(cwd, 'out/variants');

  await mkdir(outDir, { recursive: true });

  const reference = uiEpisodeSchema.parse(
    JSON.parse(await readFile(inputPath, 'utf8')),
  );

  console.log(`reference: ${describe(reference)}`);

  for (const variant of VARIANTS) {
    const episode = uiEpisodeSchema.parse(applyPatch(reference, variant.patch));
    const target = path.join(outDir, `${variant.id}.json`);

    await writeFile(
      target,
      `${JSON.stringify(
        { ...episode, speech: [] },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`\n${variant.id} — ${variant.frame}`);
    console.log(`  ${describe(episode)}`);
    console.log(`  -> ${target}`);
  }

  console.log(`\nUnused asset placeholder kept for the lab: ${PANDA.key}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
