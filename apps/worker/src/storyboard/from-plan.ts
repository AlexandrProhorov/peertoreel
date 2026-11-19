import {
  storyboardDraftSchema,
  type DerivedWord,
  type Storyboard,
} from '@peertoreel/contracts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStoryboardFromDraft } from './build.js';
import { M3_5_STYLE } from './style.js';

/**
 * M3.6b.7.4 demo: a draft with `characterPlan` fields becomes a renderable
 * storyboard. Timings are synthetic and deterministic — the real episode path
 * derives them from TTS (`storyboard:episode`).
 */
const WORD_STEP_SEC = 0.4;
const AUDIO_PADDING_SEC = 0.6;
/** Fixed run id: the demo writes a local file, no run row is created. */
const DEMO_RUN_ID = '7f3c1a52-0000-4000-8000-000000000074';

function printUsage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/worker storyboard:from-plan -- \\
    --input examples/character-plan-draft.json --out out/m3-6b-7/semantic
`);
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

function roundSec(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function syntheticWords(scenes: readonly { text: string }[]): DerivedWord[] {
  const tokens = scenes.flatMap((scene) =>
    scene.text.trim().split(/\s+/).filter(Boolean),
  );

  return tokens.map((text, index) => ({
    text,
    startSec: roundSec(index * WORD_STEP_SEC),
    endSec: roundSec(index * WORD_STEP_SEC + WORD_STEP_SEC * 0.75),
  }));
}

async function main(): Promise<void> {
  const inputOption = optionValue('--input');

  if (inputOption === undefined) {
    printUsage();
    throw new Error('--input is required');
  }

  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, inputOption);
  const outDir = path.resolve(
    cwd,
    optionValue('--out') ?? path.join('out', 'm3-6b-7', 'semantic'),
  );

  const raw: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  const draft = storyboardDraftSchema.parse(raw);
  const words = syntheticWords(draft.scenes);
  const audioDurationSec = roundSec(
    words.length * WORD_STEP_SEC + AUDIO_PADDING_SEC,
  );

  const storyboard: Storyboard = buildStoryboardFromDraft({
    draft,
    words,
    audioDurationSec,
    runId: DEMO_RUN_ID,
    style: M3_5_STYLE,
  });

  await mkdir(outDir, { recursive: true });

  const storyboardPath = path.join(outDir, 'storyboard.json');

  await writeFile(
    storyboardPath,
    `${JSON.stringify(storyboard, null, 2)}\n`,
    'utf8',
  );

  const planned = storyboard.scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) =>
      scene.implementation.type === 'recipe'
        ? 'character' in scene.implementation.slots
        : false,
    );

  console.log(`input: ${inputPath}`);
  console.log(
    `storyboard: ${storyboard.scenes.length} scenes, ${storyboard.audio.durationSec}s -> ${storyboardPath}`,
  );
  console.log(
    `character slots: ${planned
      .map(({ scene, index }) => {
        if (scene.implementation.type !== 'recipe') {
          return `${index}:?`;
        }

        const character = scene.implementation.slots.character as
          | { emotion?: string; pose?: string }
          | undefined;

        return `${index}:${scene.part}/${character?.emotion ?? '?'}/${character?.pose ?? '?'}`;
      })
      .join(', ')}`,
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
