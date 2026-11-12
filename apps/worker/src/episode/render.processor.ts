import {
  STAGE_PRODUCED_STATE,
  STAGE_REQUIRED_STATE,
  derivedWordsSchema,
  episodeManifestSchema,
  episodeVisualsArtifactSchema,
  stageJobDataSchema,
  storyboardSchema,
  type StageJobResult,
} from '@peertoreel/contracts';
import { buildArtifactKey } from '@peertoreel/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerEnv } from '../config/env.js';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { buildVisualConcatArgs } from '../media/visual-track.js';
import type { StageDeps } from '../stages/context.js';
import { deleteArtifactByObjectKey } from '../stages/delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from '../stages/load-artifact.js';
import { saveArtifact } from '../stages/save-artifact.js';
import { loadRun, transitionRun } from '../stages/transition.js';
import { renderStoryboardCli } from './render-cli.js';

/**
 * SCRIPT_READY → RENDERING → REVIEW: Remotion scene clips from the storyboard,
 * concat, loudnorm + burned-in ASS through FFmpeg. Reuses `render-worker` as a
 * subprocess; native FFmpeg steps stay in this worker.
 */

const MIN_SCENE_FILES = 1;

function isBrowserError(error: unknown): boolean {
  return (
    error instanceof Error && /(chrome|chromium|browser)/i.test(error.message)
  );
}

export async function processEpisodeRenderStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.mode !== 'episode') {
    throw new Error(
      `Стадия episode_render доступна только в режиме episode, а run ${runId} в режиме ${run.mode}`,
    );
  }

  const required = STAGE_REQUIRED_STATE.episode_render;
  const produced = STAGE_PRODUCED_STATE.episode_render;

  // Idempotency: a finished render is not redone (and not re-uploaded).
  if (run.state === produced) {
    return { runId, stage: 'episode_render', state: run.state, artifacts: [] };
  }

  if (run.state !== required && run.state !== 'RENDERING') {
    throw new Error(
      `Стадия episode_render ждёт ${required}, а run ${runId} в состоянии ${run.state}`,
    );
  }

  const startedAt = Date.now();

  const [storyboardBody, visualsBody, audio, timingsBody, subtitles, manifestBody] =
    await Promise.all([
      loadArtifactBuffer(deps.db, deps.storage, runId, 'storyboard_json'),
      loadArtifactBuffer(deps.db, deps.storage, runId, 'episode_visuals_json'),
      loadArtifactBuffer(deps.db, deps.storage, runId, 'voiceover_mp3'),
      loadArtifactBuffer(deps.db, deps.storage, runId, 'word_timings'),
      loadArtifactBuffer(deps.db, deps.storage, runId, 'subtitles_ass'),
      loadArtifactBuffer(deps.db, deps.storage, runId, 'episode_manifest'),
    ]);

  const storyboard = storyboardSchema.parse(
    JSON.parse(storyboardBody.toString('utf8')),
  );
  const visuals = episodeVisualsArtifactSchema.parse(
    JSON.parse(visualsBody.toString('utf8')),
  );
  const words = derivedWordsSchema.parse(
    JSON.parse(timingsBody.toString('utf8')),
  );
  const manifest = episodeManifestSchema.parse(
    JSON.parse(manifestBody.toString('utf8')),
  );

  if (storyboard.scenes.length < MIN_SCENE_FILES) {
    throw new Error('В раскадровке эпизода нет сцен — нечего рендерить');
  }

  await job.updateProgress(5);

  const workDir = path.join(tmpdir(), 'peertoreel-episode-render', runId);
  const scenesDir = path.join(workDir, 'scenes');
  const storyboardPath = path.join(workDir, 'storyboard.json');
  const assetsPath = path.join(workDir, 'assets.json');

  await mkdir(workDir, { recursive: true });
  await rm(scenesDir, { recursive: true, force: true });
  await mkdir(scenesDir, { recursive: true });

  try {
    // Injected URLs win over Tier 0 in the renderer CLI.
    const assets: Record<string, { url: string }> = {};

    for (const image of visuals.images) {
      assets[image.reference] = { url: image.dataUri };
    }

    await writeFile(storyboardPath, storyboardBody);
    await writeFile(assetsPath, JSON.stringify(assets, null, 2), 'utf8');
    await writeFile(path.join(workDir, 'voiceover.mp3'), audio);
    await writeFile(path.join(workDir, 'subtitles.ass'), subtitles);

    await transitionRun(deps.db, runId, 'RENDERING');

    await job.updateProgress(15);

    const scenesStartedAt = Date.now();

    try {
      await renderStoryboardCli({
        storyboardPath,
        assetsPath,
        outDir: scenesDir,
      });
    } catch (error: unknown) {
      if (isBrowserError(error)) {
        throw new UnrecoverableError(
          error instanceof Error ? error.message : 'Chrome недоступен',
        );
      }

      throw error;
    }

    const scenesMs = Date.now() - scenesStartedAt;

    await job.updateProgress(70);

    const list = `${storyboard.scenes
      .map((_, index) => `file 'scenes/scene-${index}.mp4'`)
      .join('\n')}\n`;

    await writeFile(path.join(workDir, 'scenes.txt'), list, 'utf8');

    const concatStartedAt = Date.now();

    await runFfmpeg(buildVisualConcatArgs('scenes.txt', 'visuals.mp4'), {
      workDir,
      ffmpegBin: deps.env.FFMPEG_BIN,
    });

    const concatMs = Date.now() - concatStartedAt;

    await job.updateProgress(80);

    const finalStartedAt = Date.now();

    await renderDraft(
      {
        clipPath: 'visuals.mp4',
        audioPath: 'voiceover.mp3',
        outputName: 'draft.mp4',
        workDir,
        assName: 'subtitles.ass',
      },
      { ffmpegBin: deps.env.FFMPEG_BIN },
    );

    const finalMs = Date.now() - finalStartedAt;

    await job.updateProgress(90);

    const draft = await readFile(path.join(workDir, 'draft.mp4'));
    const key = buildArtifactKey(runId, 'episode_render', 'draft.mp4');

    await deps.storage.putObject(key, draft, 'video/mp4');

    const artifact = await saveArtifact(deps.db, {
      runId,
      stage: 'episode_render',
      type: 'draft_mp4',
      objectKey: key,
      contentType: 'video/mp4',
      sizeBytes: draft.byteLength,
      meta: {
        durationSec: storyboard.audio.durationSec,
        scenes: storyboard.scenes.length,
        words: words.length,
        injectedAssets: Object.keys(assets).length,
        images: visuals.images.length,
      },
    });

    // A new draft invalidates the previous QC report (same rule as `render`).
    const previousQcKey = await findArtifactObjectKey(
      deps.db,
      runId,
      'qc_report',
    );

    if (previousQcKey) {
      await deleteArtifactByObjectKey(deps.db, previousQcKey);

      try {
        await deps.storage.deleteObject(previousQcKey);
      } catch (error: unknown) {
        deps.logger.warn(
          {
            objectKey: previousQcKey,
            reason: error instanceof Error ? error.message : 'unknown error',
          },
          'could not delete the stale QC report object',
        );
      }
    }

    const updatedManifest = episodeManifestSchema.parse({
      ...manifest,
      render: {
        scenesMs,
        concatMs,
        finalMs,
        totalMs: Date.now() - startedAt,
        injectedAssets: Object.keys(assets).length,
        costUsd: 0,
        finishedAt: new Date().toISOString(),
      },
    });
    const manifestKey =
      (await findArtifactObjectKey(deps.db, runId, 'episode_manifest')) ??
      buildArtifactKey(runId, 'episode_plan', 'manifest.json');
    const manifestBuffer = Buffer.from(
      JSON.stringify(updatedManifest, null, 2),
      'utf8',
    );

    await deps.storage.putObject(
      manifestKey,
      manifestBuffer,
      'application/json',
    );
    await saveArtifact(deps.db, {
      runId,
      stage: 'episode_plan',
      type: 'episode_manifest',
      objectKey: manifestKey,
      contentType: 'application/json',
      sizeBytes: manifestBuffer.byteLength,
      meta: {
        scenes: storyboard.scenes.length,
        images: visuals.images.length,
        skipped: visuals.skipped,
        injectedAssets: Object.keys(assets).length,
      },
    });

    const state = await transitionRun(deps.db, runId, 'REVIEW');

    await job.updateProgress(100);

    return {
      runId,
      stage: 'episode_render',
      state,
      artifacts: [
        {
          type: artifact.type,
          objectKey: artifact.objectKey,
          sizeBytes: artifact.sizeBytes,
        },
      ],
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
