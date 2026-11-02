import { describe, expect, it } from 'vitest';
import {
  enqueuePingRequestSchema,
  pingJobDataSchema,
  pingJobResultSchema,
  systemJobSnapshotSchema,
} from './system.js';

describe('system contracts', () => {
  it('accepts a ping request without optional fields', () => {
    expect(enqueuePingRequestSchema.safeParse({}).success).toBe(true);
  });

  it('requires a non-empty requestId when provided', () => {
    expect(enqueuePingRequestSchema.safeParse({ requestId: '' }).success).toBe(
      false,
    );
  });

  it('validates ping job data and result', () => {
    expect(pingJobDataSchema.safeParse({ requestId: 'req-1' }).success).toBe(
      true,
    );
    expect(
      pingJobResultSchema.safeParse({
        requestId: 'req-1',
        processedAt: '2026-11-02T12:00:00.000Z',
        durationMs: 12,
      }).success,
    ).toBe(true);
  });

  it('validates a job snapshot', () => {
    expect(
      systemJobSnapshotSchema.safeParse({
        jobId: 'req-1',
        status: 'completed',
        progress: 100,
      }).success,
    ).toBe(true);
  });
});
