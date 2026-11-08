import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LivenessResponse, ReadinessResponse } from '@peertoreel/contracts';
import type { AppEnv } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SystemQueue } from '../system/system.queue.js';

export interface ReadinessResult {
  readonly response: ReadinessResponse;
  readonly healthy: boolean;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly systemQueue: SystemQueue,
  ) {}

  live(): LivenessResponse {
    return {
      status: 'ok',
      service: 'api',
      version: this.config.get('APP_VERSION', { infer: true }),
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<ReadinessResult> {
    const [databaseUp, redisUp, workerCount] = await Promise.all([
      this.database.ping(),
      this.redis.ping(),
      this.systemQueue.getWorkersCount().catch((error: unknown) => {
        this.logger.warn({ err: error }, 'Worker count check failed');
        return 0;
      }),
    ]);

    const workerUp = workerCount > 0;
    const healthy = databaseUp && redisUp && workerUp;

    return {
      healthy,
      response: {
        status: healthy ? 'ok' : 'degraded',
        service: 'api',
        version: this.config.get('APP_VERSION', { infer: true }),
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseUp ? 'up' : 'down',
          redis: redisUp ? 'up' : 'down',
          worker: workerUp ? 'up' : 'down',
        },
      },
    };
  }
}
