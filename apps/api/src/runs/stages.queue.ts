import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STAGE_JOB_NAMES,
  STAGE_QUEUES,
  STAGE_OF_QUEUE,
  stageJobId,
  type EnqueueStageResponse,
  type StageJobData,
  type StageJobResult,
  type StageJobSnapshot,
  type StageQueueName,
} from '@kadence/contracts';
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
export class StagesQueue implements OnModuleDestroy {
  private readonly queues = new Map<StageQueueName, Queue<StageJobData, StageJobResult>>();

  constructor(config: ConfigService<AppEnv, true>) {
    const connection = redisConnectionOptions(config.get('REDIS_URL', { infer: true }));

    for (const stage of Object.keys(STAGE_QUEUES) as StageQueueName[]) {
      this.queues.set(
        stage,
        new Queue<StageJobData, StageJobResult>(STAGE_QUEUES[stage], { connection }),
      );
    }
  }

  private queueFor(stage: StageQueueName): Queue<StageJobData, StageJobResult> {
    const queue = this.queues.get(stage);

    if (!queue) {
      throw new Error(`Нет очереди для стадии ${stage}`);
    }

    return queue;
  }

  async enqueue(stage: StageQueueName, runId: string): Promise<EnqueueStageResponse> {
    const jobId = stageJobId(stage, runId);

    await this.queueFor(stage).add(
      STAGE_JOB_NAMES[stage],
      { runId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return { jobId, stage: STAGE_OF_QUEUE[stage], status: 'queued' };
  }

  async snapshot(
    stage: StageQueueName,
    runId: string,
  ): Promise<StageJobSnapshot | null> {
    const jobId = stageJobId(stage, runId);
    const job = await this.queueFor(stage).getJob(jobId);

    if (!job) {
      return null;
    }

    return {
      jobId,
      stage: STAGE_OF_QUEUE[stage],
      status: mapJobState(await job.getState()),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason || undefined,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
