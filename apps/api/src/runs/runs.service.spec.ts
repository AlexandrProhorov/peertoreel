import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ArtifactsRepository } from './artifacts.repository.js';
import type { StorageService } from '../storage/storage.service.js';
import type { RunsRepository, RunRecord } from './runs.repository.js';
import { RunsService } from './runs.service.js';

const runId = '11111111-1111-4111-8111-111111111111';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: runId,
    createdBy: '22222222-2222-4222-8222-222222222222',
    topic: 'Почему небо синее',
    state: 'DRAFT',
    currentStage: 'topic_discovery',
    failedStage: null,
    failureReason: null,
    resumeState: null,
    createdAt: new Date('2026-11-03T12:00:00.000Z'),
    updatedAt: new Date('2026-11-03T12:00:00.000Z'),
    ...overrides,
  };
}

function setup(run: RunRecord | null, applied?: RunRecord) {
  const repository = {
    createWithEvent: vi.fn().mockResolvedValue(run),
    findById: vi.fn().mockResolvedValue(run),
    list: vi.fn().mockResolvedValue(run ? [run] : []),
    listEvents: vi.fn().mockResolvedValue([]),
    applyTransition: vi.fn().mockResolvedValue(applied ?? run),
  } as unknown as RunsRepository;

  const artifacts = {
    listByRun: vi.fn().mockResolvedValue([]),
    findByType: vi.fn().mockResolvedValue(null),
  } as unknown as ArtifactsRepository;

  const storage = {
    presignGet: vi.fn().mockResolvedValue('http://storage.test/file'),
    getObject: vi.fn().mockResolvedValue(new Uint8Array()),
  } as unknown as StorageService;

  return {
    service: new RunsService(repository, artifacts, storage),
    repository,
    artifacts,
    storage,
  };
}

describe('RunsService', () => {
  it('creates a run in DRAFT on the topic stage', async () => {
    const { service, repository } = setup(makeRun());

    const run = await service.create('22222222-2222-4222-8222-222222222222', {
      topic: '  Почему небо синее  ',
    });

    expect(repository.createWithEvent).toHaveBeenCalledWith({
      createdBy: '22222222-2222-4222-8222-222222222222',
      topic: 'Почему небо синее',
      stage: 'topic_discovery',
    });
    expect(run.state).toBe('DRAFT');
    expect(run.createdAt).toBe('2026-11-03T12:00:00.000Z');
  });

  it('rejects a transition the state machine forbids', async () => {
    const { service, repository } = setup(makeRun());

    await expect(
      service.transition(runId, { to: 'REVIEW' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.applyTransition).not.toHaveBeenCalled();
  });

  it('requires a reason when failing', async () => {
    const { service, repository } = setup(makeRun({ state: 'RESEARCHING' }));

    await expect(
      service.transition(runId, { to: 'FAILED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.applyTransition).not.toHaveBeenCalled();
  });

  it('stores the failed stage and the state to resume from', async () => {
    const running = makeRun({
      state: 'RESEARCHING',
      currentStage: 'research',
    });
    const { service, repository } = setup(running);

    await service.transition(runId, {
      to: 'FAILED',
      reason: 'Pixabay 429',
    });

    expect(repository.applyTransition).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        state: 'FAILED',
        failedStage: 'research',
        failureReason: 'Pixabay 429',
        resumeState: 'RESEARCHING',
        currentStage: 'research',
      }),
      expect.objectContaining({
        fromState: 'RESEARCHING',
        toState: 'FAILED',
        stage: 'research',
        reason: 'Pixabay 429',
      }),
      {},
    );
  });

  it('resumes a failed run only into the state it stopped in', async () => {
    const failed = makeRun({
      state: 'FAILED',
      currentStage: 'render',
      failedStage: 'render',
      failureReason: 'ffmpeg exit 1',
      resumeState: 'RENDERING',
    });
    const { service, repository } = setup(failed);

    await expect(
      service.transition(runId, { to: 'DRAFT' }),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.transition(runId, { to: 'RENDERING' });

    expect(repository.applyTransition).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        state: 'RENDERING',
        currentStage: 'render',
        failedStage: null,
        failureReason: null,
        resumeState: null,
      }),
      expect.objectContaining({ fromState: 'FAILED', toState: 'RENDERING' }),
      {},
    );
  });

  it('returns a run with its audit trail', async () => {
    const { service, repository } = setup(makeRun({ state: 'REVIEW' }));

    vi.mocked(repository.listEvents).mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        fromState: 'RENDERING',
        toState: 'REVIEW',
        stage: 'qc',
        reason: null,
        createdAt: new Date('2026-11-03T13:00:00.000Z'),
      },
    ]);

    const detail = await service.detail(runId);

    expect(detail.state).toBe('REVIEW');
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]?.createdAt).toBe('2026-11-03T13:00:00.000Z');
  });

  it('reports a missing run', async () => {
    const { service } = setup(null);

    await expect(service.detail(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the QC report from the qc_report artifact', async () => {
    const { service, artifacts, storage } = setup(makeRun({ state: 'REVIEW' }));
    const report = {
      verdict: 'pass',
      checks: [{ id: 'duration', status: 'pass', message: '47.9 с' }],
      metrics: {
        durationSec: 47.9,
        audioDurationSec: 47.9,
        videoDurationSec: 47.9,
        integratedLufs: -14.2,
        truePeakDb: -1.3,
        loudnessRange: 7.2,
        words: 150,
        wordsPerMinute: 188,
        maxSentenceWords: 12,
        audioGaps: [0.08],
        stopWords: [],
        isAigc: true,
      },
      createdAt: '2026-11-05T16:00:00.000Z',
    };

    vi.mocked(artifacts.findByType).mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      stage: 'qc',
      type: 'qc_report',
      objectKey: `runs/${runId}/qc/qc_report.json`,
      contentType: 'application/json',
      sizeBytes: 200,
      createdAt: new Date('2026-11-05T16:00:00.000Z'),
    });
    vi.mocked(storage.getObject).mockResolvedValue(
      Buffer.from(JSON.stringify(report)),
    );

    const result = await service.qcReport(runId);

    expect(result.verdict).toBe('pass');
    expect(artifacts.findByType).toHaveBeenCalledWith(runId, 'qc_report');
  });

  it('returns 404 when the QC report is missing', async () => {
    const { service } = setup(makeRun({ state: 'REVIEW' }));

    await expect(service.qcReport(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates the default publish card when the run is scheduled', async () => {
    const review = makeRun({
      state: 'REVIEW',
      currentStage: 'qc',
      topic: 'топ 5 пород собак',
    });
    const scheduled = makeRun({ state: 'SCHEDULED', currentStage: 'publish' });
    const { service, artifacts, storage, repository } = setup(
      review,
      scheduled,
    );

    const scriptCreatedAt = new Date('2026-11-06T09:00:00.000Z');
    const draftCreatedAt = new Date('2026-11-06T11:00:00.000Z');

    vi.mocked(artifacts.findByType).mockImplementation((_id, type) => {
      if (type === 'script_json') {
        return Promise.resolve({
          id: '88888888-8888-4888-8888-888888888888',
          stage: 'script',
          type: 'script_json',
          objectKey: `runs/${runId}/script/script.json`,
          contentType: 'application/json',
          sizeBytes: 512,
          createdAt: scriptCreatedAt,
        });
      }

      if (type === 'draft_mp4') {
        return Promise.resolve({
          id: '99999999-9999-4999-8999-999999999999',
          stage: 'render',
          type: 'draft_mp4',
          objectKey: `runs/${runId}/render/draft.mp4`,
          contentType: 'video/mp4',
          sizeBytes: 1024,
          createdAt: draftCreatedAt,
        });
      }

      return Promise.resolve(null);
    });
    vi.mocked(storage.getObject).mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          title: 'Топ 5 пород собак для квартиры',
          hook: 'Собака в квартире — это реально',
          beats: [
            { text: 'Первая порода', visualDirection: 'small dog', durationSec: 5 },
            { text: 'Вторая порода', visualDirection: 'big dog', durationSec: 5 },
          ],
          cta: 'Выбирайте осознанно',
        }),
      ),
    );

    await service.transition(runId, { to: 'SCHEDULED' });

    expect(repository.applyTransition).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({ state: 'SCHEDULED' }),
      expect.objectContaining({ fromState: 'REVIEW', toState: 'SCHEDULED' }),
      {
        defaultCard: {
          title: 'Топ 5 пород собак для квартиры',
          hashtags: ['пород', 'собак'],
        },
        resetExportBefore: draftCreatedAt,
      },
    );
  });

  it('falls back to the run topic when the script title is unavailable', async () => {
    const review = makeRun({ state: 'REVIEW' });
    const scheduled = makeRun({ state: 'SCHEDULED' });
    const { service, artifacts, storage, repository } = setup(
      review,
      scheduled,
    );

    vi.mocked(artifacts.findByType).mockImplementation((_id, type) =>
      Promise.resolve(
        type === 'script_json'
          ? {
              id: '88888888-8888-4888-8888-888888888888',
              stage: 'script' as const,
              type: 'script_json',
              objectKey: `runs/${runId}/script/script.json`,
              contentType: 'application/json',
              sizeBytes: 512,
              createdAt: new Date('2026-11-06T09:00:00.000Z'),
            }
          : null,
      ),
    );
    vi.mocked(storage.getObject).mockRejectedValue(new Error('S3 is down'));

    await service.transition(runId, { to: 'SCHEDULED' });

    expect(repository.applyTransition).toHaveBeenCalledWith(
      runId,
      expect.anything(),
      expect.anything(),
      {
        defaultCard: {
          title: 'Почему небо синее',
          hashtags: ['почему', 'небо', 'синее'],
        },
      },
    );
  });

  it('rejects raw publish transitions', async () => {
    const { service, repository } = setup(
      makeRun({ state: 'SCHEDULED', currentStage: 'publish' }),
    );

    await expect(
      service.transition(runId, { to: 'PUBLISHING' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.transition(runId, { to: 'PUBLISHED' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.applyTransition).not.toHaveBeenCalled();
  });

  it('reports a transition that lost the state race', async () => {
    const { service, repository } = setup(makeRun());

    vi.mocked(repository.applyTransition).mockResolvedValue(null);

    await expect(
      service.transition(runId, { to: 'RESEARCHING' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('signs the draft twice: inline and as a download', async () => {
    const { service, artifacts, storage } = setup(makeRun());
    const objectKey = `runs/${runId}/render/draft.mp4`;

    vi.mocked(artifacts.listByRun).mockResolvedValue([
      {
        id: '99999999-9999-4999-8999-999999999999',
        stage: 'render',
        type: 'draft_mp4',
        objectKey,
        contentType: 'video/mp4',
        sizeBytes: 1024,
        createdAt: new Date('2026-11-06T11:00:00.000Z'),
      },
    ]);
    vi.mocked(storage.presignGet)
      .mockResolvedValueOnce('http://storage.test/draft')
      .mockResolvedValueOnce('http://storage.test/download');

    const result = await service.artifactsFor(runId);

    expect(storage.presignGet).toHaveBeenNthCalledWith(1, objectKey);
    expect(storage.presignGet).toHaveBeenNthCalledWith(
      2,
      objectKey,
      `kadence-draft-${runId.slice(0, 8)}.mp4`,
    );
    expect(result[0]?.url).toBe('http://storage.test/draft');
    expect(result[0]?.downloadUrl).toBe('http://storage.test/download');
  });

  it('does not touch the publish card on other transitions', async () => {
    const { service, repository } = setup(makeRun());

    await service.transition(runId, { to: 'RESEARCHING' });

    expect(repository.applyTransition).toHaveBeenCalledWith(
      runId,
      expect.anything(),
      expect.anything(),
      {},
    );
  });
});
