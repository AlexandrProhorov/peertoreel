import { artifacts, type Database } from '@kadence/db';
import { stageJobDataSchema, type StageJobResult } from '@kadence/contracts';
import { buildArtifactKey, type ObjectStorage } from '@kadence/storage';
import type { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerEnv } from '../config/env.js';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { buildKaraokeAss, type WordTiming } from '../media/karaoke.js';
import type { StageDeps } from './context.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';

async function loadArtifact(
  db: Database,
  storage: ObjectStorage,
  runId: string,
  type: string,
): Promise<Buffer> {
  const [row] = await db
    .select({ objectKey: artifacts.objectKey })
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)))
    .limit(1);

  if (!row) {
    throw new Error(
      `У run ${runId} нет артефакта ${type} — предыдущая стадия не завершена`,
    );
  }

  return Buffer.from(await storage.getObject(row.objectKey));
}

/**
 * VISUALS_READY → RENDERING → REVIEW: assembles the draft MP4 from the voiceover
 * and karaoke subtitles. The background is still synthetic until the visuals
 * stage produces real scenes.
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
    loadArtifact(deps.db, deps.storage, runId, 'voiceover_mp3'),
    loadArtifact(deps.db, deps.storage, runId, 'word_timings'),
  ]);
  const words = JSON.parse(timings.toString('utf8')) as WordTiming[];
  const lastWordEnd = words.at(-1)?.endSec ?? 10;

  await job.updateProgress(25);

  const workDir = path.join(tmpdir(), 'kadence-render', runId);
  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(path.join(workDir, 'voiceover.mp3'), audio);
    await writeFile(
      path.join(workDir, 'subtitles.ass'),
      buildKaraokeAss(words),
      'utf8',
    );

    await transitionRun(deps.db, runId, 'RENDERING');

    await runFfmpeg(
      [
        '-hide_banner',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=1080x1920:rate=30:duration=${(lastWordEnd + 1).toFixed(2)}`,
        '-pix_fmt',
        'yuv420p',
        'clip.mp4',
      ],
      { ffmpegBin: deps.env.FFMPEG_BIN, workDir },
    );

    await job.updateProgress(40);

    await renderDraft(
      {
        clipPath: 'clip.mp4',
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

    const artifact = await saveArtifact(deps.db, {
      runId,
      stage: 'render',
      type: 'draft_mp4',
      objectKey: key,
      contentType: 'video/mp4',
      sizeBytes: draft.byteLength,
      meta: { durationSec: lastWordEnd, background: 'testsrc2' },
    });

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
