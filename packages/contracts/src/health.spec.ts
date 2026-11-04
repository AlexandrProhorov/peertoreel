import { describe, expect, it } from 'vitest';
import { livenessResponseSchema, readinessResponseSchema } from './health.js';

describe('health contracts', () => {
  it('accepts a valid liveness response', () => {
    const result = livenessResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: 12.5,
      timestamp: '2026-10-30T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a degraded readiness response', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'degraded',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: 12.5,
      timestamp: '2026-10-30T12:00:00.000Z',
      checks: { database: 'up', redis: 'down', worker: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a readiness response with a missing worker', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'degraded',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: 12.5,
      timestamp: '2026-10-30T12:00:00.000Z',
      checks: { database: 'up', redis: 'up', worker: 'down' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown health states', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: 1,
      timestamp: '2026-10-30T12:00:00.000Z',
      checks: { database: 'unknown', redis: 'up', worker: 'up' },
    });

    expect(result.success).toBe(false);
  });
});
