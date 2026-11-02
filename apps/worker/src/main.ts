import { PING_JOB, SYSTEM_QUEUE } from '@kadence/contracts';
import { Worker } from 'bullmq';
import { config as loadEnv } from 'dotenv';
import pino from 'pino';
import { loadWorkerEnv } from './config/env.js';
import { processPing } from './processors/ping.processor.js';
import { redisConnectionOptions } from './redis-connection.js';

loadEnv({ path: '../../.env', quiet: true });

const env = loadWorkerEnv();
const logger = pino({ level: env.LOG_LEVEL });

const worker = new Worker(SYSTEM_QUEUE, processPing, {
  connection: redisConnectionOptions(env.REDIS_URL),
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: error }, 'job failed');
});

worker.on('error', (error) => {
  logger.error({ err: error }, 'worker error');
});

logger.info(
  {
    queue: SYSTEM_QUEUE,
    pingJob: PING_JOB,
    concurrency: env.WORKER_CONCURRENCY,
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
