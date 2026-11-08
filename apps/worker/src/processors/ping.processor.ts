import {
  pingJobDataSchema,
  type PingJobData,
  type PingJobResult,
} from '@peertoreel/contracts';
import type { Job } from 'bullmq';
import { setTimeout as sleep } from 'node:timers/promises';

export async function processPing(
  job: Job<PingJobData, PingJobResult>,
): Promise<PingJobResult> {
  const data = pingJobDataSchema.parse(job.data);
  const startedAt = Date.now();

  await job.updateProgress(10);
  await sleep(150);

  await job.updateProgress(50);
  await sleep(150);

  await job.updateProgress(90);
  await sleep(150);

  await job.updateProgress(100);

  return {
    requestId: data.requestId,
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
