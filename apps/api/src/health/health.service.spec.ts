import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.js';
import { HealthService } from './health.service.js';
import type { DatabaseService } from '../database/database.service.js';
import type { RedisService } from '../redis/redis.service.js';

function createService(databaseUp: boolean, redisUp: boolean): HealthService {
  const config = {
    get: vi.fn().mockReturnValue('0.1.0'),
  } as unknown as ConfigService<AppEnv, true>;

  const database = {
    ping: vi.fn().mockResolvedValue(databaseUp),
  } as unknown as DatabaseService;

  const redis = {
    ping: vi.fn().mockResolvedValue(redisUp),
  } as unknown as RedisService;

  return new HealthService(config, database, redis);
}

describe('HealthService', () => {
  it('reports liveness without dependency checks', () => {
    const result = createService(false, false).live();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(result.version).toBe('0.1.0');
  });

  it('reports readiness ok when all dependencies are up', async () => {
    const result = await createService(true, true).ready();

    expect(result.healthy).toBe(true);
    expect(result.response.status).toBe('ok');
    expect(result.response.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('reports degraded readiness when a dependency is down', async () => {
    const result = await createService(true, false).ready();

    expect(result.healthy).toBe(false);
    expect(result.response.status).toBe('degraded');
    expect(result.response.checks).toEqual({ database: 'up', redis: 'down' });
  });
});
