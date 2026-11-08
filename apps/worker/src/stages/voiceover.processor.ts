import {
  artifacts,
  type Database,
} from '@peertoreel/db';
import {
  scriptSchema,
  stageJobDataSchema,
  type Script,
  type StageJobResult,
} from '@peertoreel/contracts';
import { buildArtifactKey, type ObjectStorage } from '@peertoreel/storage';
import type { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { requireProviderKey, type WorkerEnv } from '../config/env.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { synthesizeWithTimestamps } from '../tts/elevenlabs.js';
import { deriveWordTimings } from '../tts/word-timings.js';
import type { StageDeps } from './context.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';

async function loadScript(
  db: Database,
  storage: ObjectStorage,
  runId: string,
): Promise<Script> {
  const [row] = await db
    .select({ objectKey: artifacts.objectKey })
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, 'script_json')))
    .limit(1);

  if (!row) {
    throw new Error(`У run ${runId} нет артефакта script_json — сначала стадия script`);
  }

  const body = Buffer.from(await storage.getObject(row.objectKey)).toString('utf8');

  return scriptSchema.parse(JSON.parse(body));
}

/** SCRIPT_READY → VOICE_READY: TTS, word timings, karaoke subtitles. */
export async function processVoiceoverStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.state === 'VOICE_READY') {
    return { runId, stage: 'voiceover', state: run.state, artifacts: [] };
  }

  if (run.state !== 'SCRIPT_READY') {
    throw new Error(
      `Стадия voiceover ждёт SCRIPT_READY, а run ${runId} в состоянии ${run.state}`,
    );
  }

  const script = await loadScript(deps.db, deps.storage, runId);
  const speech = [
    script.hook,
    ...script.beats.map((beat) => beat.text),
    script.cta,
  ].join(' ');

  await job.updateProgress(10);

  const { audio, alignment } = await synthesizeWithTimestamps({
    text: speech,
    apiKey: requireProviderKey(deps.env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY'),
    voiceId: requireProviderKey(deps.env.ELEVENLABS_VOICE_ID, 'ELEVENLABS_VOICE_ID'),
    modelId: deps.env.ELEVENLABS_MODEL_ID,
  });

  await job.updateProgress(60);

  const words = deriveWordTimings(alignment);
  const timings = Buffer.from(JSON.stringify(words, null, 2), 'utf8');
  const ass = Buffer.from(buildKaraokeAss(words), 'utf8');

  const files = [
    {
      type: 'voiceover_mp3',
      name: 'voiceover.mp3',
      body: Buffer.from(audio),
      contentType: 'audio/mpeg',
    },
    {
      type: 'word_timings',
      name: 'word_timings.json',
      body: timings,
      contentType: 'application/json',
    },
    {
      type: 'subtitles_ass',
      name: 'subtitles.ass',
      body: ass,
      contentType: 'text/plain; charset=utf-8',
    },
  ];

  const saved = [];

  for (const file of files) {
    const key = buildArtifactKey(runId, 'voiceover', file.name);

    await deps.storage.putObject(key, file.body, file.contentType);

    saved.push(
      await saveArtifact(deps.db, {
        runId,
        stage: 'voiceover',
        type: file.type,
        objectKey: key,
        contentType: file.contentType,
        sizeBytes: file.body.byteLength,
      }),
    );
  }

  await job.updateProgress(85);

  const state = await transitionRun(deps.db, runId, 'VOICE_READY');

  await job.updateProgress(100);

  return {
    runId,
    stage: 'voiceover',
    state,
    artifacts: saved.map((artifact) => ({
      type: artifact.type,
      objectKey: artifact.objectKey,
      sizeBytes: artifact.sizeBytes,
    })),
  };
}
