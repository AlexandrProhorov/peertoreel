import {
  PING_JOB,
  STAGE_QUEUES,
  STAGE_REQUIRED_STATE,
  SYSTEM_QUEUE,
  stageJobDataSchema,
  type StageQueueName,
  type StockProvider,
} from '@peertoreel/contracts';
import { createDatabase } from '@peertoreel/db';
import { ObjectStorage } from '@peertoreel/storage';
import { UnrecoverableError, Worker } from 'bullmq';
import { config as loadEnv } from 'dotenv';
import { Redis } from 'ioredis';
import pino from 'pino';
import { loadWorkerEnv, type WorkerEnv } from './config/env.js';
import { processPing } from './processors/ping.processor.js';
import { redisConnectionOptions } from './redis-connection.js';
import { RedisStockSearchCache } from './stock/cache.js';
import { STOCK_LIMITS } from './stock/limits.js';
import { createPixabayStockProvider } from './stock/pixabay.js';
import { SlidingWindowRateLimiter } from './stock/rate-limiter.js';
import type { StageDeps } from './stages/context.js';
import { processQcStage } from './stages/qc.processor.js';
import { processRenderStage } from './stages/render.processor.js';
import { processScriptStage } from './stages/script.processor.js';
import {
  isFinalStageFailure,
  isTerminalProviderError,
} from './stages/terminal-error.js';
import { failRun } from './stages/transition.js';
import { processVisualsStage } from './stages/visuals.processor.js';
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

let stockRedis: Redis | null = null;
let stockProvider: StockProvider | undefined;

if (env.PIXABAY_API_KEY) {
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  });

  stockRedis = redis;
  redis.on('error', (error: Error) => {
    logger.warn({ err: error }, 'pixabay cache redis error');
  });
  void redis.connect().catch((error: unknown) => {
    logger.warn({ err: error }, 'pixabay cache redis unavailable');
  });
  stockProvider = createPixabayStockProvider({
    apiKey: env.PIXABAY_API_KEY,
    cache: new RedisStockSearchCache(redis),
    limiter: new SlidingWindowRateLimiter(
      STOCK_LIMITS.requestsPerWindow,
      STOCK_LIMITS.windowMs,
    ),
  });
}

const deps: StageDeps<WorkerEnv> = {
  db,
  storage,
  env,
  logger,
  stockProvider,
};
const connection = redisConnectionOptions(env.REDIS_URL);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Provider error';
}

/**
 * Terminal provider errors (401, bad payload, missing key) must not consume all
 * BullMQ attempts. `handleFinalFailure` marks the run FAILED immediately for an
 * UnrecoverableError even when attemptsMade is lower than attempts.
 */
function withTerminalErrors<T>(handler: () => Promise<T>): Promise<T> {
  return handler().catch((error: unknown) => {
    if (isTerminalProviderError(error)) {
      throw new UnrecoverableError(errorMessage(error));
    }

    throw error;
  });
}

const workers: Worker[] = [
  new Worker(SYSTEM_QUEUE, processPing, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
  }),
  new Worker(
    STAGE_QUEUES.script,
    (job) => withTerminalErrors(() => processScriptStage(job, deps)),
    {
      connection,
      concurrency: 2,
    },
  ),
  new Worker(
    STAGE_QUEUES.voiceover,
    (job) => withTerminalErrors(() => processVoiceoverStage(job, deps)),
    {
      connection,
      concurrency: 1,
    },
  ),
  new Worker(
    STAGE_QUEUES.visuals,
    (job) => withTerminalErrors(() => processVisualsStage(job, deps)),
    {
      connection,
      concurrency: 1,
    },
  ),
  new Worker(
    STAGE_QUEUES.render,
    (job) => withTerminalErrors(() => processRenderStage(job, deps)),
    {
      connection,
      concurrency: 1,
    },
  ),
  new Worker(
    STAGE_QUEUES.qc,
    (job) => withTerminalErrors(() => processQcStage(job, deps)),
    {
      connection,
      concurrency: 1,
    },
  ),
];

const [, scriptWorker, voiceoverWorker, visualsWorker, renderWorker, qcWorker] =
  workers;

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

visualsWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'visuals');
});

renderWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'render');
});

qcWorker?.on('failed', (job, error) => {
  void handleFinalFailure(job, error, 'qc');
});

/**
 * Only the last attempt marks the run as FAILED: a transient 429 must not end
 * the pipeline, while an exhausted or terminal error must be visible in the UI.
 */
async function handleFinalFailure(
  job: { data: unknown; attemptsMade?: number; opts: { attempts?: number }; id?: string } | undefined,
  error: Error,
  stage: StageQueueName,
): Promise<void> {
  logger.error({ queue: stage, jobId: job?.id, err: error }, 'stage failed');

  const attempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;

  if (!job || !isFinalStageFailure(error, attemptsMade, attempts)) {
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
    queues: [SYSTEM_QUEUE, ...Object.values(STAGE_QUEUES)],
    pingJob: PING_JOB,
    concurrency: env.WORKER_CONCURRENCY,
    pixabay: stockProvider ? 'configured' : 'missing-key',
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');

  await Promise.all(workers.map((worker) => worker.close()));

  if (stockRedis) {
    try {
      if (stockRedis.status === 'ready') {
        await stockRedis.quit();
      } else {
        stockRedis.disconnect();
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, 'pixabay cache redis shutdown failed');
      stockRedis.disconnect();
    }
  }

  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
