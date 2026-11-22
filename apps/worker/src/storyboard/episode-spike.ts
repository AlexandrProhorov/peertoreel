import {
  storyboardDraftSchema,
  type DerivedWord,
  type Storyboard,
  type StoryboardDraft,
} from '@peertoreel/contracts';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  loadWorkerEnv,
  requireProviderKey,
  type WorkerEnv,
} from '../config/env.js';
import { generateJson } from '../llm/deepseek.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { probeMedia } from '../media/ffprobe.js';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { buildVisualConcatArgs } from '../media/visual-track.js';
import { synthesizeWithTimestamps } from '../tts/elevenlabs.js';
import { deriveWordTimings } from '../tts/word-timings.js';
import { buildStoryboardFromDraft } from './build.js';
import {
  storyboardSystemPrompt,
  storyboardUserPrompt,
} from './prompt.js';
import { M3_5_STYLE } from './style.js';
import {
  GOOGLE_TTS_PROVIDER,
  synthesizeWithGoogleTts,
} from './tts-fallback.js';

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url));
const RENDER_WORKER_DIR = fileURLToPath(
  new URL('../../../render-worker/', import.meta.url),
);

loadEnv({ path: path.resolve(APP_DIR, '../../.env'), quiet: true });

function printUsage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/worker storyboard:episode -- --topic "…" --slug dog-nose [--tts elevenlabs|google] [--out <dir>] [--skip-render]

--tts elevenlabs (default) uses ELEVENLABS_API_KEY; --tts google is the
spike-only free fallback when the ElevenLabs quota is exhausted.
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

function runProcess(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

function requireKeys(env: WorkerEnv): {
  deepseekKey: string;
  elevenKey: string | undefined;
  voiceId: string | undefined;
} {
  return {
    deepseekKey: requireProviderKey(env.DEEPSEEK_API_KEY, 'DEEPSEEK_API_KEY'),
    elevenKey: env.ELEVENLABS_API_KEY,
    voiceId: env.ELEVENLABS_VOICE_ID,
  };
}

interface EpisodeSpeech {
  provider: 'elevenlabs' | typeof GOOGLE_TTS_PROVIDER;
  model: string;
  words: DerivedWord[];
  audioDurationSec: number;
  bytes: number;
  characters: number;
}

async function synthesizeSpeech({
  provider,
  scenes,
  narration,
  outDir,
  env,
  keys,
}: {
  provider: 'elevenlabs' | 'google';
  scenes: readonly string[];
  narration: string;
  outDir: string;
  env: WorkerEnv;
  keys: ReturnType<typeof requireKeys>;
}): Promise<EpisodeSpeech> {
  if (provider === 'google') {
    return synthesizeWithGoogleTts({
      scenes,
      workDir: outDir,
      ffmpegBin: env.FFMPEG_BIN,
      ffprobeBin: env.FFPROBE_BIN,
    });
  }

  const { audio, alignment } = await synthesizeWithTimestamps({
    text: narration,
    apiKey: requireProviderKey(keys.elevenKey, 'ELEVENLABS_API_KEY'),
    voiceId: requireProviderKey(keys.voiceId, 'ELEVENLABS_VOICE_ID'),
    modelId: env.ELEVENLABS_MODEL_ID,
  });

  await writeFile(path.join(outDir, 'voiceover.mp3'), audio);

  const probe = await probeMedia('voiceover.mp3', {
    workDir: outDir,
    ffprobeBin: env.FFPROBE_BIN,
  });

  return {
    provider: 'elevenlabs',
    model: env.ELEVENLABS_MODEL_ID,
    words: deriveWordTimings(alignment),
    audioDurationSec: probe.durationSec,
    bytes: audio.length,
    characters: narration.length,
  };
}

async function main(): Promise<void> {
  const topic = optionValue('--topic');
  const slug = optionValue('--slug');
  const skipRender = process.argv.includes('--skip-render');
  const ttsOption = optionValue('--tts') ?? 'elevenlabs';

  if (ttsOption !== 'elevenlabs' && ttsOption !== 'google') {
    printUsage();
    throw new Error('--tts must be "elevenlabs" or "google"');
  }

  const ttsProvider: 'elevenlabs' | 'google' = ttsOption;

  if (!topic) {
    printUsage();
    throw new Error('--topic is required');
  }

  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    printUsage();
    throw new Error('--slug must be a lowercase latin slug (a-z, 0-9, -)');
  }

  const env = loadWorkerEnv(process.env);
  const keys = requireKeys(env);
  const outDir = path.resolve(
    process.cwd(),
    optionValue('--out') ?? path.join('out', 'episodes', slug),
  );
  const startedAt = Date.now();

  await mkdir(outDir, { recursive: true });

  console.log(`topic: ${topic}`);
  console.log(`out: ${outDir}`);

  // 1. Director draft. No timings in the draft: they come from the TTS.
  const llmStartedAt = Date.now();
  const {
    data: draft,
    usage,
    attempts,
  }: {
    data: StoryboardDraft;
    usage: { promptTokens: number; completionTokens: number };
    attempts: number;
  } = await generateJson(storyboardDraftSchema, {
    apiKey: keys.deepseekKey,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    system: storyboardSystemPrompt(),
    user: storyboardUserPrompt(topic),
    maxTokens: 4000,
    temperature: 0.6,
  });
  const llmMs = Date.now() - llmStartedAt;

  await writeFile(
    path.join(outDir, 'draft.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `draft: "${draft.title}", ${draft.scenes.length} scenes, attempts ${attempts}, ` +
      `tokens ${usage.promptTokens}/${usage.completionTokens}, ${llmMs} ms`,
  );

  // 2. Voiceover: one continuous narration, real duration and word timings.
  const narration = draft.scenes.map((scene) => scene.text).join(' ');
  const ttsStartedAt = Date.now();
  const speech = await synthesizeSpeech({
    provider: ttsProvider,
    scenes: draft.scenes.map((scene) => scene.text),
    narration,
    outDir,
    env,
    keys,
  });
  const words = speech.words;

  await writeFile(
    path.join(outDir, 'word_timings.json'),
    `${JSON.stringify(words, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(outDir, 'subtitles.ass'),
    buildKaraokeAss(words),
    'utf8',
  );

  const ttsMs = Date.now() - ttsStartedAt;

  console.log(
    `tts (${speech.provider}/${speech.model}): ${speech.bytes} bytes, ${
      words.length
    } words, ${speech.audioDurationSec.toFixed(2)}s, ${ttsMs} ms`,
  );

  // 3. Storyboard from real timings + recipe catalog.
  const runId = randomUUID();
  const storyboard: Storyboard = buildStoryboardFromDraft({
    draft,
    words,
    audioDurationSec: speech.audioDurationSec,
    runId,
    style: M3_5_STYLE,
  });
  const storyboardPath = path.join(outDir, 'storyboard.json');

  await writeFile(
    storyboardPath,
    `${JSON.stringify(storyboard, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `storyboard: ${storyboard.scenes.length} scenes, ${storyboard.audio.durationSec.toFixed(
      2,
    )}s, ${storyboard.scenes
      .map((scene) =>
        scene.implementation.type === 'recipe'
          ? `${scene.implementation.recipeId}/${scene.implementation.variant}`
          : 'programmatic',
      )
      .join(', ')}`,
  );

  let finalPath: string | null = null;
  let finalProbe: Awaited<ReturnType<typeof probeMedia>> | null = null;
  let sceneRenderMs = 0;
  let concatMs = 0;
  let finalRenderMs = 0;

  if (!skipRender) {
    // 4. Scene clips through the existing render-worker CLI.
    const scenesDir = path.join(outDir, 'scenes');
    const sceneStartedAt = Date.now();

    await rm(scenesDir, { recursive: true, force: true });
    await mkdir(scenesDir, { recursive: true });
    await runProcess(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(RENDER_WORKER_DIR, 'src', 'cli.ts'),
        'render-storyboard',
        '--input',
        storyboardPath,
        '--out',
        scenesDir,
      ],
      RENDER_WORKER_DIR,
    );
    sceneRenderMs = Date.now() - sceneStartedAt;

    // 5. Concat + loudnorm + karaoke ASS.
    const list = `${storyboard.scenes
      .map((_, index) => `file 'scenes/scene-${index}.mp4'`)
      .join('\n')}\n`;
    await writeFile(path.join(outDir, 'scenes.txt'), list, 'utf8');

    const concatStartedAt = Date.now();
    await runFfmpeg(buildVisualConcatArgs('scenes.txt', 'visuals.mp4'), {
      workDir: outDir,
      ffmpegBin: env.FFMPEG_BIN,
    });
    concatMs = Date.now() - concatStartedAt;

    const finalStartedAt = Date.now();
    finalPath = await renderDraft(
      {
        clipPath: 'visuals.mp4',
        audioPath: 'voiceover.mp3',
        outputName: 'episode.mp4',
        workDir: outDir,
        assName: 'subtitles.ass',
      },
      { ffmpegBin: env.FFMPEG_BIN },
    );
    finalRenderMs = Date.now() - finalStartedAt;
    finalProbe = await probeMedia('episode.mp4', {
      workDir: outDir,
      ffprobeBin: env.FFPROBE_BIN,
    });

    console.log(
      `render: scenes ${sceneRenderMs} ms, concat ${concatMs} ms, final ${finalRenderMs} ms`,
    );
    console.log(
      `output: ${finalPath} (${finalProbe.durationSec.toFixed(2)}s, audio ${
        finalProbe.audioDurationSec.toFixed(2)
      }s)`,
    );
  }

  const manifest = {
    kind: 'm3.5-episode',
    topic,
    slug,
    runId,
    title: draft.title,
    generatedAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt,
    llm: {
      model: env.LLM_MODEL,
      attempts,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      ms: llmMs,
    },
    tts: {
      provider: speech.provider,
      model: speech.model,
      bytes: speech.bytes,
      words: words.length,
      characters: speech.characters,
      audioDurationSec: speech.audioDurationSec,
      ms: ttsMs,
    },
    storyboard: {
      path: storyboardPath,
      scenes: draft.scenes.map((scene) => ({
        id: scene.id,
        part: scene.part,
        recipeId: scene.recipeId,
        variant: scene.variant,
        text: scene.text,
      })),
    },
    render: {
      skipped: skipRender,
      scenesMs: sceneRenderMs,
      concatMs,
      finalMs: finalRenderMs,
    },
    output: {
      path: finalPath,
      probe: finalProbe,
    },
  };

  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`manifest: ${path.join(outDir, 'manifest.json')}`);
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
