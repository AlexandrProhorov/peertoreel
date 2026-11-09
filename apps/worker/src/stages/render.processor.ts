import {
  derivedWordsSchema,
  stageJobDataSchema,
  visualsArtifactSchema,
  type StageJobResult,
  type VisualsArtifact,
} from '@peertoreel/contracts';
import { buildArtifactKey } from '@peertoreel/storage';
import type { Job } from 'bullmq';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerEnv } from '../config/env.js';
import { renderDraft } from '../media/ffmpeg.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import {
  buildVisualTrack,
  type VisualTrackScene,
} from '../media/visual-track.js';
import type { StageDeps } from './context.js';
import { deleteArtifactByObjectKey } from './delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from './load-artifact.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';

const MIN_SCENE_SEC = 0.05;

function extensionForContentType(contentType: string): string | null {
  switch (contentType.split(';')[0]?.trim().toLowerCase()) {
    case 'video/mp4':
      return 'mp4';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return null;
  }
}

async function loadVisualsManifest(
  deps: StageDeps<WorkerEnv>,
  runId: string,
): Promise<VisualsArtifact | null> {
  const objectKey = await findArtifactObjectKey(
    deps.db,
    runId,
    'visuals_json',
  );

  if (!objectKey) {
    return null;
  }

  const body = Buffer.from(await deps.storage.getObject(objectKey)).toString(
    'utf8',
  );

  return visualsArtifactSchema.parse(JSON.parse(body));
}

async function prepareVisualScenes(
  deps: StageDeps<WorkerEnv>,
  workDir: string,
  manifest: VisualsArtifact | null,
  targetDurationSec: number,
): Promise<VisualTrackScene[]> {
  if (!manifest) {
    return [
      {
        idx: 0,
        kind: 'fallback',
        fileName: null,
        durationSec: targetDurationSec,
      },
    ];
  }

  const scenes: VisualTrackScene[] = [];

  for (const scene of manifest.scenes) {
    const durationSec = Math.max(
      MIN_SCENE_SEC,
      scene.endSec - scene.startSec,
    );

    if (scene.asset.kind === 'fallback') {
      scenes.push({
        idx: scene.idx,
        kind: 'fallback',
        fileName: null,
        durationSec,
      });
      continue;
    }

    const extension = extensionForContentType(scene.asset.contentType);

    if (!extension) {
      deps.logger.warn(
        { sceneIdx: scene.idx, contentType: scene.asset.contentType },
        'unsupported visual content type; using fallback',
      );
      scenes.push({
        idx: scene.idx,
        kind: 'fallback',
        fileName: null,
        durationSec,
      });
      continue;
    }

    const fileName = `scene-${scene.idx}.${extension}`;

    try {
      const body = Buffer.from(
        await deps.storage.getObject(scene.asset.objectKey),
      );
      await writeFile(path.join(workDir, fileName), body);
      scenes.push({
        idx: scene.idx,
        kind: scene.asset.kind,
        fileName,
        durationSec,
      });
    } catch (error: unknown) {
      deps.logger.warn(
        {
          sceneIdx: scene.idx,
          reason: error instanceof Error ? error.message : 'unknown error',
        },
        'visual scene object is unavailable; using fallback',
      );
      scenes.push({
        idx: scene.idx,
        kind: 'fallback',
        fileName: null,
        durationSec,
      });
    }
  }

  if (scenes.length === 0) {
    return [
      {
        idx: 0,
        kind: 'fallback',
        fileName: null,
        durationSec: targetDurationSec,
      },
    ];
  }

  return scenes;
}

/**
 * VISUALS_READY → RENDERING → REVIEW: assembles the draft MP4 from the
 * voiceover, karaoke subtitles and the visual track produced by `visuals`.
 * Runs without a visuals manifest keep the old synthetic testsrc2 background.
 */
export async function processRenderStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  // Idempotency: a finished render is not redone (and not re-uploaded).
  if (run.state === 'REVIEW') {
    return { runId, stage: 'render', state: run.state, artifacts: [] };
  }

  if (run.state !== 'VISUALS_READY' && run.state !== 'RENDERING') {
    throw new Error(
      `Стадия render ждёт VISUALS_READY, а run ${runId} в состоянии ${run.state}`,
    );
  }

  await job.updateProgress(5);

  const [audio, timings] = await Promise.all([
    loadArtifactBuffer(deps.db, deps.storage, runId, 'voiceover_mp3'),
    loadArtifactBuffer(deps.db, deps.storage, runId, 'word_timings'),
  ]);
  const words = derivedWordsSchema.parse(
    JSON.parse(timings.toString('utf8')),
  );
  const lastWordEnd = words.at(-1)?.endSec ?? 10;
  const targetDurationSec = lastWordEnd + 1;
  const manifest = await loadVisualsManifest(deps, runId);

  await job.updateProgress(25);

  const workDir = path.join(tmpdir(), 'peertoreel-render', runId);
  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(path.join(workDir, 'voiceover.mp3'), audio);
    await writeFile(
      path.join(workDir, 'subtitles.ass'),
      buildKaraokeAss(words),
      'utf8',
    );

    await transitionRun(deps.db, runId, 'RENDERING');

    const visualScenes = await prepareVisualScenes(
      deps,
      workDir,
      manifest,
      targetDurationSec,
    );

    await job.updateProgress(35);

    await buildVisualTrack(
      {
        scenes: visualScenes,
        targetDurationSec,
        workDir,
      },
      { ffmpegBin: deps.env.FFMPEG_BIN },
    );

    await job.updateProgress(60);

    await renderDraft(
      {
        clipPath: 'visuals.mp4',
        audioPath: 'voiceover.mp3',
        outputName: 'draft.mp4',
        workDir,
      },
      { ffmpegBin: deps.env.FFMPEG_BIN },
    );

    await job.updateProgress(90);

    const draft = await readFile(path.join(workDir, 'draft.mp4'));
    const key = buildArtifactKey(runId, 'render', 'draft.mp4');

    await deps.storage.putObject(key, draft, 'video/mp4');

    const hasRealAsset = visualScenes.some(
      (scene) => scene.kind !== 'fallback',
    );
    const artifact = await saveArtifact(deps.db, {
      runId,
      stage: 'render',
      type: 'draft_mp4',
      objectKey: key,
      contentType: 'video/mp4',
      sizeBytes: draft.byteLength,
      meta: {
        durationSec: lastWordEnd,
        background: hasRealAsset ? 'visuals' : 'fallback_testsrc2',
        visualSources:
          manifest?.scenes.map((scene) => ({
            idx: scene.idx,
            kind: scene.asset.kind,
            provider: scene.asset.provider,
            pageUrl: scene.asset.pageUrl,
          })) ?? [],
      },
    });

    // A new draft invalidates the previous QC report: the review gate must
    // check this exact file, not the previous render.
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

    await job.updateProgress(95);

    const state = await transitionRun(deps.db, runId, 'REVIEW');

    await job.updateProgress(100);

    return {
      runId,
      stage: 'render',
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
