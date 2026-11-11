import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RunsRepository, RunRecord } from './runs.repository.js';
import type { StagesQueue } from './stages.queue.js';
import { StagesService } from './stages.service.js';

const runId = '11111111-1111-4111-8111-111111111111';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: runId,
    createdBy: '22222222-2222-4222-8222-222222222222',
    topic: 'Почему небо синее',
    mode: 'pipeline',
    state: 'VOICE_READY',
    currentStage: 'voiceover',
    failedStage: null,
    failureReason: null,
    resumeState: null,
    createdAt: new Date('2026-11-03T12:00:00.000Z'),
    updatedAt: new Date('2026-11-03T12:00:00.000Z'),
    ...overrides,
  };
}

function setup(run: RunRecord | null) {
  const repository = {
    findById: vi.fn().mockResolvedValue(run),
  } as unknown as RunsRepository;
  const queue = {
    enqueue: vi.fn().mockResolvedValue({
      jobId: `visuals-${runId}`,
      stage: 'visuals',
      status: 'queued',
    }),
  } as unknown as StagesQueue;

  return { service: new StagesService(repository, queue), queue };
}

describe('StagesService', () => {
  it('enqueues visuals from VOICE_READY', async () => {
    const { service, queue } = setup(makeRun());

    const response = await service.start(runId, 'visuals');

    expect(queue.enqueue).toHaveBeenCalledWith('visuals', runId);
    expect(response).toEqual({
      jobId: `visuals-${runId}`,
      stage: 'visuals',
      status: 'queued',
    });
  });

  it('rejects visuals from an earlier state', async () => {
    const { service, queue } = setup(makeRun({ state: 'SCRIPT_READY' }));

    await expect(service.start(runId, 'visuals')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the episode plan from DRAFT', async () => {
    const { service, queue } = setup(
      makeRun({
        mode: 'episode',
        state: 'DRAFT',
        currentStage: 'topic_discovery',
      }),
    );

    await service.start(runId, 'episode_plan');

    expect(queue.enqueue).toHaveBeenCalledWith('episode_plan', runId);
  });

  it('rejects a stage that belongs to the other run mode', async () => {
    const pipelineRun = setup(makeRun({ state: 'DRAFT' }));
    const episodeRun = setup(makeRun({ mode: 'episode', state: 'RESEARCHING' }));

    await expect(
      pipelineRun.service.start(runId, 'episode_plan'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      episodeRun.service.start(runId, 'script'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(pipelineRun.queue.enqueue).not.toHaveBeenCalled();
    expect(episodeRun.queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects the episode render before the plan gate', async () => {
    const { service, queue } = setup(
      makeRun({ mode: 'episode', state: 'DRAFT' }),
    );

    await expect(service.start(runId, 'episode_render')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
