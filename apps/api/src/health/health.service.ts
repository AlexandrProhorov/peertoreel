import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LivenessResponse, ReadinessResponse } from '@kadence/contracts';
import type { AppEnv } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

export interface ReadinessResult {
  readonly response: ReadinessResponse;
  readonly healthy: boolean;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
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
    const [databaseUp, redisUp] = await Promise.all([
      this.database.ping(),
      this.redis.ping(),
    ]);

    const healthy = databaseUp && redisUp;

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
        },
      },
    };
  }
}
