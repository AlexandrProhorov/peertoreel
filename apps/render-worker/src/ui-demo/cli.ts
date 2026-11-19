import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SCENE_FPS } from '../video-target.js';
import { getUiDemoBundle, renderUiEpisode } from './render.js';
import { renderUiStill } from './stills.js';
import {
  uiEpisodeFrames,
  uiSceneFrames,
  uiEpisodeSchema,
  type UiEpisode,
  type UiScene,
} from './spec.js';
import { scheduleWords } from './timing.js';

/**
 * Interface-storytelling pilot: renders one vertical episode from a device
 * list. Speech tracks are generated deterministically for captions; they never
 * drive device reveals (see `timeline.ts`).
 */
const PROGRESS_PREFIX = '##progress ';
const DEFAULT_WORDS_PER_SEC = 3.2;

function emitProgress(payload: Record<string, unknown>): void {
  console.log(`${PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker ui:demo -- --input <episode.json> [--out <dir>] [--words-per-sec N] [--safe-zones] [--verify]

Renders a 1080x1920/30 h264 silent episode from interface devices.
--safe-zones draws the platform zones on top of the frames.
--verify renders the episode twice and fails if the output is not byte-identical.
`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );

  if (inline !== undefined) {
    const value = inline.slice(name.length + 1);

    if (value.length === 0) {
      throw new Error(`Option ${name} requires a value`);
    }

    return value;
  }

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

/**
 * Verification samples: scene starts and midpoints plus both ends of the clip,
 * so a frame regression cannot hide between scenes.
 */
function verifyFrames(episode: UiEpisode, totalFrames: number): number[] {
  const frames = new Set<number>([0, Math.max(0, totalFrames - 1)]);
  let cursor = 0;

  for (const scene of episode.scenes) {
    const duration = uiSceneFrames(scene, SCENE_FPS);

    frames.add(Math.min(totalFrames - 1, cursor + 1));
    frames.add(Math.min(totalFrames - 1, cursor + Math.round(duration * 0.6)));
    cursor += duration;
  }

  return [...frames].sort((left, right) => left - right);
}

function numberOption(name: string, fallback: number): number {
  const raw = optionValue(name);

  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received "${raw}"`);
  }

  return value;
}

/** Text that the narration would speak for a scene (speech stream only). */
function speechText(scene: UiScene): string {
  switch (scene.device) {
    case 'prompt-card':
      return scene.cardText;
    case 'text-selection':
      return [scene.title, ...scene.lines].join(' ');
    case 'chat-reconstruction':
      return [scene.title, ...scene.messages.map((message) => message.text)].join(
        ' ',
      );
    case 'title-stack':
      return [scene.eyebrow, scene.title, scene.subtitle]
        .filter((part): part is string => part !== null)
        .join(' ');
    case 'social-proof':
      return [scene.title, ...scene.cards.map((card) => card.text)].join(' ');
    case 'prediction-input':
      return `${scene.prompt} ${scene.answer}`;
    case 'object-reveal':
      return scene.caption;
    case 'input-transform':
      return `${scene.prompt} ${scene.waitingLabel}`;
    case 'impact-arrival':
      return [scene.index, scene.headline, scene.caption]
        .filter((part): part is string => part !== null)
        .join(' ');
    case 'scale-break':
      return `${scene.fromLabel} ${scene.toLabel} ${scene.title}`;
    case 'spec':
      return scene.spec.elements
        .map((element) => element.params.text)
        .filter((text): text is string => typeof text === 'string')
        .join(' ');
  }
}

function withSpeechTracks(episode: UiEpisode, wordsPerSec: number): UiEpisode {
  if (episode.speech.length > 0) {
    return episode;
  }

  return {
    ...episode,
    speech: episode.scenes.map((scene) => ({
      sceneId: scene.id,
      words: scheduleWords(speechText(scene), {
        durationSec: scene.durationSec,
        wordsPerSec,
      }),
    })),
  };
}

async function main(): Promise<void> {
  const input = optionValue('--input');

  if (input === undefined) {
    usage();
    throw new Error('--input is required');
  }

  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, input);
  const outDir = path.resolve(cwd, optionValue('--out') ?? 'out/ui-demo');
  const wordsPerSec = numberOption('--words-per-sec', DEFAULT_WORDS_PER_SEC);
  const seed = Math.trunc(numberOption('--seed', 7));
  const showSafeZones = process.argv.includes('--safe-zones');
  const verify = process.argv.includes('--verify');
  const stills = (optionValue('--stills') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => Number(entry))
    .filter((value) => Number.isInteger(value) && value >= 0);

  const raw: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  const episode = withSpeechTracks(uiEpisodeSchema.parse(raw), wordsPerSec);

  await mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, 'episode.mp4');
  const totalFrames = uiEpisodeFrames(episode, SCENE_FPS);

  console.log(`input: ${inputPath}`);
  console.log(
    `episode: ${episode.scenes.length} scene(s), ${totalFrames} frames (${(
      totalFrames / SCENE_FPS
    ).toFixed(2)}s) -> ${outPath}`,
  );

  await getUiDemoBundle();

  if (stills.length > 0) {
    for (const frame of stills) {
      const stillPath = path.join(outDir, `still-${frame}.png`);

      await renderUiStill({ episode, showSafeZones, frame, outPath: stillPath });
      console.log(`still ${frame} -> ${stillPath}`);
    }

    return;
  }

  emitProgress({ type: 'total', total: totalFrames });

  const lastLogged = { value: -1 };
  const result = await renderUiEpisode({
    episode,
    showSafeZones,
    outPath,
    onProgress: (progress) => {
      const percent = Math.floor(progress * 20) * 5;

      if (percent > lastLogged.value) {
        lastLogged.value = percent;
        console.log(`  render: ${percent}%`);
        emitProgress({ type: 'render', progress: percent });
      }
    },
  });

  if (verify) {
    const samples = verifyFrames(episode, totalFrames);
    const mismatches: number[] = [];

    for (const frame of samples) {
      const first = path.join(outDir, `verify-${frame}-a.png`);
      const second = path.join(outDir, `verify-${frame}-b.png`);

      await renderUiStill({ episode, showSafeZones, frame, outPath: first });
      await renderUiStill({ episode, showSafeZones, frame, outPath: second });

      const [firstBytes, secondBytes] = await Promise.all([
        readFile(first),
        readFile(second),
      ]);

      if (!firstBytes.equals(secondBytes)) {
        mismatches.push(frame);
      }

      await Promise.all([unlink(first), unlink(second)]);
    }

    if (mismatches.length === 0) {
      console.log(`verify: ${samples.length} sampled frame(s) identical`);
    } else {
      process.exitCode = 1;
      console.error(`verify failed: frame(s) differ — ${mismatches.join(', ')}`);
    }
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  let cursor = 0;
  const sceneRows = episode.scenes.map((scene) => {
    const durationInFrames = uiSceneFrames(scene, SCENE_FPS);
    const row = {
      id: scene.id,
      device: scene.device,
      themeId: scene.themeId ?? episode.themeId,
      fromFrame: cursor,
      durationInFrames,
      durationSec: durationInFrames / SCENE_FPS,
      revealSec: scene.revealSec,
    };

    cursor += durationInFrames;

    return row;
  });

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        input: path.relative(cwd, inputPath),
        seed,
        wordsPerSec,
        width: 1080,
        height: 1920,
        fps: SCENE_FPS,
        totalFrames,
        totalSec: totalFrames / SCENE_FPS,
        renderedFrames: result.durationInFrames,
        sizeBytes: result.sizeBytes,
        renderMs: result.renderMs,
        showSafeZones,
        captions: episode.captions,
        scenes: sceneRows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(
    `\nRendered ${result.durationInFrames} frames, ${result.sizeBytes} bytes in ${result.renderMs} ms`,
  );
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
