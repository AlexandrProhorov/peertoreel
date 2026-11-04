import {
  PING_JOB,
  STAGE_QUEUES,
  STAGE_REQUIRED_STATE,
  SYSTEM_QUEUE,
  stageJobDataSchema,
} from '@kadence/contracts';
import { createDatabase } from '@kadence/db';
import { ObjectStorage } from '@kadence/storage';
import { Worker } from 'bullmq';
import { config as loadEnv } from 'dotenv';
import pino from 'pino';
import { loadWorkerEnv, type WorkerEnv } from './config/env.js';
import { processPing } from './processors/ping.processor.js';
import { redisConnectionOptions } from './redis-connection.js';
import type { StageDeps } from './stages/context.js';
import { processRenderStage } from './stages/render.processor.js';
import { processScriptStage } from './stages/script.processor.js';
import { failRun } from './stages/transition.js';
import { processVoiceoverStage } from './stages/voiceover.processor.js';

loadEnv({ path: '../../.env', quiet: true });

const env = loadWorkerEnv();
const logger = pino({ level: env.LOG_LEVEL });

const { db, pool } = createDatabase(env.DATABASE_URL);
const storage = new ObjectStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

const deps: StageDeps<WorkerEnv> = { db, storage, env, logger };
const connection = redisConnectionOptions(env.REDIS_URL);

const workers: Worker[] = [
  new Worker(SYSTEM_QUEUE, processPing, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
  }),
  new Worker(STAGE_QUEUES.script, (job) => processScriptStage(job, deps), {
    connection,
    concurrency: 2,
  }),
  new Worker(STAGE_QUEUES.voiceover, (job) => processVoiceoverStage(job, deps), {
    connection,
    concurrency: 1,
  }),
  new Worker(STAGE_QUEUES.render, (job) => processRenderStage(job, deps), {
    connection,
    concurrency: 1,
  }),
];

const [, scriptWorker, voiceoverWorker, renderWorker] = workers;

for (const worker of workers) {
  worker.on('completed', (job) => {
    logger.info({ queue: worker.name, jobId: job.id }, 'job completed');
  });

  worker.on('error', (error) => {
    logger.error({ queue: worker.name, err: error }, 'worker error');
  });
}

scriptWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'script');
});

voiceoverWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'voiceover');
});

renderWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'render');
});

/**
 * Only the last attempt marks the run as FAILED: a transient 429 must not end
 * the pipeline, while an exhausted or terminal error must be visible in the UI.
 */
async function handleFinalFailure(
  job: { data: unknown; attemptsMade?: number; opts: { attempts?: number }; id?: string } | undefined,
  error: Error,
  stage: 'script' | 'voiceover' | 'render',
): Promise<void> {
  logger.error({ queue: stage, jobId: job?.id, err: error }, 'stage failed');

  const attempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;

  if (!job || attemptsMade < attempts) {
    return;
  }

  try {
    const { runId } = stageJobDataSchema.parse(job.data);

    // Resume to the state the stage started from, not the mid-stage state
    // (RENDERING etc.), otherwise "retry" cannot start the stage again.
    await failRun(db, runId, stage, error.message, STAGE_REQUIRED_STATE[stage]);
    logger.warn({ runId, stage }, 'run marked FAILED');
  } catch (failError: unknown) {
    logger.error({ err: failError, stage }, 'could not mark run as failed');
  }
}

logger.info(
  {
    queues: [SYSTEM_QUEUE, STAGE_QUEUES.script, STAGE_QUEUES.voiceover, STAGE_QUEUES.render],
    pingJob: PING_JOB,
    concurrency: env.WORKER_CONCURRENCY,
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');

  await Promise.all(workers.map((worker) => worker.close()));
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});



