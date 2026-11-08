import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { PingJobData, PingJobResult } from '@peertoreel/contracts';
import { processPing } from './ping.processor.js';

function createJob(data: PingJobData): Job<PingJobData, PingJobResult> {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<PingJobData, PingJobResult>;
}

describe('processPing', () => {
  it('returns a typed result and reports progress', async () => {
    const job = createJob({ requestId: 'req-1' });

    const result = await processPing(job);

    expect(result.requestId).toBe('req-1');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.processedAt).toISOString()).toBe(result.processedAt);
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(50);
    expect(job.updateProgress).toHaveBeenCalledWith(90);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('rejects malformed job data', async () => {
    const job = createJob({ requestId: '' });

    await expect(processPing(job)).rejects.toThrow();
  });
});
