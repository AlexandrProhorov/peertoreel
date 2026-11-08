import {
  Injectable,
  Logger,
  NotFoundException,
  type MessageEvent,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SYSTEM_QUEUE,
  type SystemJobSnapshot,
} from '@peertoreel/contracts';
import {
  defer,
  distinctUntilChanged,
  filter,
  from,
  map,
  merge,
  type Observable,
  of,
  Subject,
  switchMap,
  takeWhile,
  throwError,
} from 'rxjs';
import { QueueEvents } from 'bullmq';
import type { AppEnv } from '../config/env.js';
import { redisConnectionOptions } from './redis-connection.js';
import { SystemQueue } from './system.queue.js';

@Injectable()
export class SystemEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemEventsService.name);
  private readonly queueEvents: QueueEvents;
  private readonly snapshots = new Subject<SystemJobSnapshot>();

  constructor(
    private readonly queue: SystemQueue,
    config: ConfigService<AppEnv, true>,
  ) {
    this.queueEvents = new QueueEvents(SYSTEM_QUEUE, {
      connection: redisConnectionOptions(config.get('REDIS_URL', { infer: true })),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queueEvents.waitUntilReady();

    this.queueEvents.on('waiting', ({ jobId }) => {
      void this.emitSnapshot(jobId);
    });
    this.queueEvents.on('active', ({ jobId }) => {
      void this.emitSnapshot(jobId);
    });
    this.queueEvents.on('progress', ({ jobId }) => {
      void this.emitSnapshot(jobId);
    });
    this.queueEvents.on('completed', ({ jobId }) => {
      void this.emitSnapshot(jobId);
    });
    this.queueEvents.on('failed', ({ jobId }) => {
      void this.emitSnapshot(jobId);
    });
  }

  stream(jobId: string): Observable<MessageEvent> {
    const initial$ = defer(() => from(this.queue.getPing(jobId))).pipe(
      switchMap((snapshot) =>
        snapshot
          ? of(snapshot)
          : throwError(() => new NotFoundException(`Job ${jobId} not found`)),
      ),
    );

    const live$ = this.snapshots.pipe(filter((snapshot) => snapshot.jobId === jobId));

    return merge(initial$, live$).pipe(
      distinctUntilChanged(
        (previous, current) =>
          previous.status === current.status &&
          previous.progress === current.progress &&
          previous.message === current.message &&
          previous.failedReason === current.failedReason,
      ),
      takeWhile(
        (snapshot) =>
          snapshot.status !== 'completed' && snapshot.status !== 'failed',
        true,
      ),
      map(
        (snapshot): MessageEvent => ({
          type: 'job',
          data: snapshot,
        }),
      ),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents.close();
  }

  private async emitSnapshot(jobId: string): Promise<void> {
    try {
      const snapshot = await this.queue.getPing(jobId);

      if (snapshot) {
        this.snapshots.next(snapshot);
      }
    } catch (error: unknown) {
      this.logger.warn({ err: error, jobId }, 'Failed to emit job snapshot');
    }
  }
}
