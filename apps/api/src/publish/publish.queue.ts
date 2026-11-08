import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PUBLISH_JOB,
  PUBLISH_QUEUE,
  publishJobId,
  type EnqueueStageResponse,
  type PublishJobData,
  type StageJobResult,
  type StageJobSnapshot,
} from '@peertoreel/contracts';
import { Queue } from 'bullmq';
import type { AppEnv } from '../config/env.js';
import { redisConnectionOptions } from '../system/redis-connection.js';

function mapJobState(state: string): StageJobSnapshot['status'] {
  switch (state) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}

@Injectable()
export class PublishQueue implements OnModuleDestroy {
  private readonly queue: Queue<PublishJobData, StageJobResult>;

  constructor(config: ConfigService<AppEnv, true>) {
    this.queue = new Queue<PublishJobData, StageJobResult>(PUBLISH_QUEUE, {
      connection: redisConnectionOptions(
        config.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async enqueue(runId: string): Promise<EnqueueStageResponse> {
    const jobId = publishJobId(runId);
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();

      if (
        state === 'waiting' ||
        state === 'active' ||
        state === 'delayed' ||
        state === 'prioritized'
      ) {
        return { jobId, stage: 'publish', status: 'queued' };
      }

      await existing.remove();
    }

    await this.queue.add(
      PUBLISH_JOB,
      { runId },
      {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return { jobId, stage: 'publish', status: 'queued' };
  }

  async snapshot(runId: string): Promise<StageJobSnapshot | null> {
    const jobId = publishJobId(runId);
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return null;
    }

    return {
      jobId,
      stage: 'publish',
      status: mapJobState(await job.getState()),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason || undefined,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
