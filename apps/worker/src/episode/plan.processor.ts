import {
  STAGE_PRODUCED_STATE,
  STAGE_REQUIRED_STATE,
  episodeManifestSchema,
  stageJobDataSchema,
  storyboardDraftSchema,
  type EpisodeManifest,
  type StageJobResult,
  type StockProvider,
} from '@peertoreel/contracts';
import { buildArtifactKey } from '@peertoreel/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireProviderKey, type WorkerEnv } from '../config/env.js';
import { generateJson } from '../llm/deepseek.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { buildStoryboardFromDraft } from '../storyboard/build.js';
import {
  storyboardSystemPrompt,
  storyboardUserPrompt,
} from '../storyboard/prompt.js';
import { M3_5_STYLE } from '../storyboard/style.js';
import { synthesizeWithGoogleTts } from '../storyboard/tts-fallback.js';
import type { StageDeps } from '../stages/context.js';
import { findArtifactObjectKey } from '../stages/load-artifact.js';
import { saveArtifact } from '../stages/save-artifact.js';
import { loadRun, transitionRun } from '../stages/transition.js';
import { collectEpisodeSubjects } from './subjects.js';
import { fetchEpisodeVisuals } from './visuals.js';

/**
 * DRAFT → SCRIPT_READY: DeepSeek director, Google TTS, real storyboard from
 * word timings, Pixabay images for subject slots. No render here: the human
 * reviews the script/scene text first.
 *
 * Idempotent: if the manifest and every artifact already exist for the same
 * topic, a retry only moves the run to SCRIPT_READY (no LLM/TTS/Pixabay call).
 */

const PLAN_ARTIFACT_TYPES = [
  'storyboard_json',
  'episode_visuals_json',
  'voiceover_mp3',
  'word_timings',
  'subtitles_ass',
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'неизвестная ошибка';
}

function requireKey(value: string | undefined, name: string): string {
  try {
    return requireProviderKey(value, name);
  } catch (error: unknown) {
    throw new UnrecoverableError(errorMessage(error));
  }
}

function requirePixabay(
  env: WorkerEnv,
  provider: StockProvider | undefined,
): StockProvider {
  requireKey(env.PIXABAY_API_KEY, 'PIXABAY_API_KEY');

  if (!provider) {
    throw new UnrecoverableError(
      'Провайдер картинок не настроен — episode_plan не может обратиться к Pixabay',
    );
  }

  return provider;
}

async function readManifest(
  deps: StageDeps<WorkerEnv>,
  runId: string,
): Promise<EpisodeManifest | null> {
  const objectKey = await findArtifactObjectKey(
    deps.db,
    runId,
    'episode_manifest',
  );

  if (!objectKey) {
    return null;
  }

  try {
    const body = Buffer.from(await deps.storage.getObject(objectKey)).toString(
      'utf8',
    );

    return episodeManifestSchema.parse(JSON.parse(body));
  } catch (error: unknown) {
    deps.logger.warn(
      { runId, reason: errorMessage(error) },
      'episode manifest is unreadable; planning again',
    );

    return null;
  }
}

async function hasCompletePlan(
  deps: StageDeps<WorkerEnv>,
  runId: string,
  topic: string,
): Promise<boolean> {
  const manifest = await readManifest(deps, runId);

  if (!manifest || manifest.topic !== topic) {
    return false;
  }

  const keys = await Promise.all(
    PLAN_ARTIFACT_TYPES.map((type) =>
      findArtifactObjectKey(deps.db, runId, type),
    ),
  );

  return keys.every((key) => key !== null);
}

export async function processEpisodePlanStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.mode !== 'episode') {
    throw new Error(
      `Стадия episode_plan доступна только в режиме episode, а run ${runId} в режиме ${run.mode}`,
    );
  }

  // Idempotency: a finished plan is not regenerated (and not re-charged).
  if (run.state === STAGE_PRODUCED_STATE.episode_plan) {
    return { runId, stage: 'episode_plan', state: run.state, artifacts: [] };
  }

  if (run.state !== STAGE_REQUIRED_STATE.episode_plan) {
    throw new Error(
      `Стадия episode_plan ждёт ${STAGE_REQUIRED_STATE.episode_plan}, а run ${runId} в состоянии ${run.state}`,
    );
  }

  const startedAt = Date.now();
  const deepseekKey = requireKey(deps.env.DEEPSEEK_API_KEY, 'DEEPSEEK_API_KEY');
  const provider = requirePixabay(deps.env, deps.stockProvider);

  await job.updateProgress(5);

  if (await hasCompletePlan(deps, runId, run.topic)) {
    const state = await transitionRun(deps.db, runId, 'SCRIPT_READY');

    await job.updateProgress(100);

    return { runId, stage: 'episode_plan', state, artifacts: [] };
  }

  const workDir = path.join(tmpdir(), 'peertoreel-episode-plan', runId);

  await mkdir(workDir, { recursive: true });

  try {
    // 1. Director draft. No timings here: they come from real TTS audio.
    const llmStartedAt = Date.now();
    const { data: draft, usage, attempts } = await generateJson(
      storyboardDraftSchema,
      {
        apiKey: deepseekKey,
        baseUrl: deps.env.LLM_BASE_URL,
        model: deps.env.LLM_MODEL,
        system: storyboardSystemPrompt(),
        user: storyboardUserPrompt(run.topic),
        maxTokens: 4000,
        temperature: 0.6,
      },
    );
    const llmMs = Date.now() - llmStartedAt;

    await job.updateProgress(25);

    // 2. Google TTS writes voiceover.mp3 into the work directory.
    const ttsStartedAt = Date.now();
    const speech = await synthesizeWithGoogleTts({
      scenes: draft.scenes.map((scene) => scene.text),
      workDir,
      ffmpegBin: deps.env.FFMPEG_BIN,
      ffprobeBin: deps.env.FFPROBE_BIN,
    });
    const ttsMs = Date.now() - ttsStartedAt;

    await job.updateProgress(50);

    // 3. Storyboard from real word timings (the LLM never supplies timings).
    const storyboard = buildStoryboardFromDraft({
      draft,
      words: speech.words,
      audioDurationSec: speech.audioDurationSec,
      runId,
      style: M3_5_STYLE,
    });
    const subtitles = buildKaraokeAss(speech.words);

    await job.updateProgress(65);

    // 4. Pixabay only for subject slots; everything else stays Tier 0.
    const subjects = collectEpisodeSubjects(storyboard);
    const visualsStartedAt = Date.now();
    const visuals = await fetchEpisodeVisuals(subjects, provider, deps.logger);
    const visualsMs = Date.now() - visualsStartedAt;

    await job.updateProgress(80);

    const voiceover = await readFile(path.join(workDir, 'voiceover.mp3'));
    const voiceoverStat = await stat(path.join(workDir, 'voiceover.mp3'));

    const manifest = episodeManifestSchema.parse({
      kind: 'm3.5.1-episode',
      topic: run.topic,
      title: draft.title,
      generatedAt: new Date().toISOString(),
      totalMs: Date.now() - startedAt,
      llm: {
        provider: 'deepseek',
        model: deps.env.LLM_MODEL,
        attempts,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        ms: llmMs,
        costUsd: null,
      },
      tts: {
        provider: speech.provider,
        model: speech.model,
        characters: speech.characters,
        words: speech.words.length,
        audioDurationSec: speech.audioDurationSec,
        bytes: speech.bytes,
        ms: ttsMs,
        // Google Translate TTS is free: 0 is measured, not an estimate.
        costUsd: 0,
      },
      stock: {
        provider: 'pixabay',
        queries: visuals.queries,
        providerRequests: visuals.artifact.providerRequests,
        cacheHits: visuals.artifact.cacheHits,
        images: visuals.artifact.images.length,
        skipped: visuals.artifact.skipped,
        costUsd: 0,
      },
    });

    const files = [
      {
        type: 'storyboard_json',
        name: 'storyboard.json',
        body: Buffer.from(JSON.stringify(storyboard, null, 2), 'utf8'),
        contentType: 'application/json',
      },
      {
        type: 'episode_visuals_json',
        name: 'visuals.json',
        body: Buffer.from(
          JSON.stringify(visuals.artifact, null, 2),
          'utf8',
        ),
        contentType: 'application/json',
      },
      {
        type: 'voiceover_mp3',
        name: 'voiceover.mp3',
        body: voiceover,
        contentType: 'audio/mpeg',
      },
      {
        type: 'word_timings',
        name: 'word_timings.json',
        body: Buffer.from(JSON.stringify(speech.words, null, 2), 'utf8'),
        contentType: 'application/json',
      },
      {
        type: 'subtitles_ass',
        name: 'subtitles.ass',
        body: Buffer.from(subtitles, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      },
      {
        type: 'episode_manifest',
        name: 'manifest.json',
        body: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
        contentType: 'application/json',
      },
    ];

    const saved = [];

    for (const file of files) {
      const key = buildArtifactKey(runId, 'episode_plan', file.name);

      await deps.storage.putObject(key, file.body, file.contentType);

      saved.push(
        await saveArtifact(deps.db, {
          runId,
          stage: 'episode_plan',
          type: file.type,
          objectKey: key,
          contentType: file.contentType,
          sizeBytes: file.body.byteLength,
          meta:
            file.type === 'episode_manifest'
              ? {
                  scenes: storyboard.scenes.length,
                  images: visuals.artifact.images.length,
                  skipped: visuals.artifact.skipped,
                  imagesMs: visualsMs,
                  voiceoverBytes: voiceoverStat.size,
                }
              : {},
        }),
      );
    }

    await job.updateProgress(90);

    const state = await transitionRun(deps.db, runId, 'SCRIPT_READY');

    await job.updateProgress(100);

    return {
      runId,
      stage: 'episode_plan',
      state,
      artifacts: saved.map((artifact) => ({
        type: artifact.type,
        objectKey: artifact.objectKey,
        sizeBytes: artifact.sizeBytes,
      })),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
