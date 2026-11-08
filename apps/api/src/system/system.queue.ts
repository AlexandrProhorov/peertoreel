import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PING_JOB,
  SYSTEM_QUEUE,
  type EnqueuePingRequest,
  type EnqueuePingResponse,
  type PingJobData,
  type PingJobResult,
  type SystemJobSnapshot,
  type SystemJobStatus,
} from '@peertoreel/contracts';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '../config/env.js';
import { redisConnectionOptions } from './redis-connection.js';

function mapJobState(state: string): SystemJobStatus {
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
export class SystemQueue implements OnModuleDestroy {
  private readonly queue: Queue<PingJobData, PingJobResult>;

  constructor(config: ConfigService<AppEnv, true>) {
    this.queue = new Queue<PingJobData, PingJobResult>(SYSTEM_QUEUE, {
      connection: redisConnectionOptions(
        config.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async enqueuePing(input: EnqueuePingRequest): Promise<EnqueuePingResponse> {
    const requestId = input.requestId ?? randomUUID();

    const job = await this.queue.add(
      PING_JOB,
      {
        requestId,
        message: input.message,
      },
      {
        jobId: requestId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1_000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return {
      jobId: job.id ?? requestId,
      status: 'queued',
    };
  }

  /** Number of BullMQ workers currently registered for the system queue. */
  getWorkersCount(): Promise<number> {
    return this.queue.getWorkersCount();
  }

  async getPing(jobId: string): Promise<SystemJobSnapshot | null> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      jobId,
      status: mapJobState(state),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason || undefined,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
