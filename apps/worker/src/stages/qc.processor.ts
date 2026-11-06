import {
  qcReportSchema,
  scriptSchema,
  stageJobDataSchema,
  type StageJobResult,
} from '@kadence/contracts';
import { buildArtifactKey } from '@kadence/storage';
import type { Job } from 'bullmq';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerEnv } from '../config/env.js';
import { measureLoudness } from '../media/ffmpeg.js';
import { probeMedia } from '../media/ffprobe.js';
import { runQcChecks } from '../qc/checks.js';
import { derivedWordsSchema } from '../tts/word-timings.js';
import type { StageDeps } from './context.js';
import { loadArtifactBuffer } from './load-artifact.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun } from './transition.js';

/**
 * REVIEW → REVIEW: QC is advisory. It produces a qc_report artifact, and the
 * human gate decides whether to approve, re-check or regenerate. A QC check
 * failure does not mark the run FAILED; a missing draft/ffprobe error does.
 */
export async function processQcStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.state !== 'REVIEW') {
    throw new Error(
      `Стадия qc ждёт REVIEW, а run ${runId} в состоянии ${run.state}`,
    );
  }

  await job.updateProgress(10);

  const [draft, scriptBody, timingsBody] = await Promise.all([
    loadArtifactBuffer(deps.db, deps.storage, runId, 'draft_mp4'),
    loadArtifactBuffer(deps.db, deps.storage, runId, 'script_json'),
    loadArtifactBuffer(deps.db, deps.storage, runId, 'word_timings'),
  ]);
  const script = scriptSchema.parse(JSON.parse(scriptBody.toString('utf8')));
  const words = derivedWordsSchema.parse(
    JSON.parse(timingsBody.toString('utf8')),
  );
  const workDir = path.join(tmpdir(), 'kadence-qc', runId);

  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(path.join(workDir, 'draft.mp4'), draft);

    await job.updateProgress(30);

    const probe = await probeMedia('draft.mp4', {
      ffprobeBin: deps.env.FFPROBE_BIN,
      workDir,
    });
    const loudness = await measureLoudness('draft.mp4', {
      ffmpegBin: deps.env.FFMPEG_BIN,
      workDir,
    });
    const result = runQcChecks({ script, words, probe, loudness });
    const report = qcReportSchema.parse({
      ...result,
      createdAt: new Date().toISOString(),
    });

    await job.updateProgress(70);

    const key = buildArtifactKey(runId, 'qc', 'qc_report.json');
    const body = Buffer.from(JSON.stringify(report, null, 2), 'utf8');

    await deps.storage.putObject(key, body, 'application/json');

    const artifact = await saveArtifact(deps.db, {
      runId,
      stage: 'qc',
      type: 'qc_report',
      objectKey: key,
      contentType: 'application/json',
      sizeBytes: body.byteLength,
      meta: {
        verdict: report.verdict,
        checks: report.checks.length,
      },
    });

    await job.updateProgress(100);

    return {
      runId,
      stage: 'qc',
      state: 'REVIEW',
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
