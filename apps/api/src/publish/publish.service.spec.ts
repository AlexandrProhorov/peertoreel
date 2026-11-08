import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  PublishCardInput,
  PublishCardRecord,
  PublishCardsRepository,
} from './publish-cards.repository.js';
import type { RunsRepository, RunRecord } from '../runs/runs.repository.js';
import { PublishService } from './publish.service.js';

const runId = '11111111-1111-4111-8111-111111111111';

const createdAt = new Date('2026-11-06T10:00:00.000Z');

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: runId,
    createdBy: '22222222-2222-4222-8222-222222222222',
    topic: 'топ 5 пород собак',
    state: 'SCHEDULED',
    currentStage: 'publish',
    failedStage: null,
    failureReason: null,
    resumeState: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function makeCard(overrides: Partial<PublishCardRecord> = {}): PublishCardRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    runId,
    title: 'Топ 5 пород собак',
    hashtags: ['пород', 'собак'],
    privacyLevel: null,
    isAigc: true,
    scheduledAt: null,
    exportedAt: null,
    publishedAt: null,
    state: 'draft',
    publishId: null,
    postId: null,
    failReason: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

const request: UpdatePublishCardRequest = {
  title: 'Топ 5 пород собак',
  hashtags: ['пород', 'собак'],
  privacyLevel: 'SELF_ONLY',
  scheduledAt: '2026-11-07T09:30:00.000Z',
};

function setup(run: RunRecord | null, card: PublishCardRecord | null) {
  const cards = {
    findByRun: vi.fn().mockResolvedValue(card),
    upsert: vi.fn().mockImplementation((_: string, input: PublishCardInput) =>
      Promise.resolve(makeCard({ ...input })),
    ),
    markExported: vi.fn().mockResolvedValue(card),
  } as unknown as PublishCardsRepository;

  const runs = {
    findById: vi.fn().mockResolvedValue(run),
    applyManualPublish: vi.fn().mockResolvedValue({
      run: makeRun({ state: 'PUBLISHED' }),
      card: makeCard({ state: 'published', publishedAt: createdAt }),
    }),
  } as unknown as RunsRepository;

  return {
    service: new PublishService(cards, runs),
    cards,
    runs,
  };
}

describe('PublishService', () => {
  it('returns the card for a run', async () => {
    const { service } = setup(makeRun(), makeCard());

    const card = await service.get(runId);

    expect(card).toMatchObject({
      runId,
      title: 'Топ 5 пород собак',
      hashtags: ['пород', 'собак'],
      privacyLevel: null,
      isAigc: true,
      state: 'draft',
      scheduledAt: null,
      createdAt: '2026-11-06T10:00:00.000Z',
    });
  });

  it('reports a missing card and a missing run', async () => {
    const { service } = setup(makeRun(), null);

    await expect(service.get(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const { service: missingRun } = setup(null, null);

    await expect(missingRun.get(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('upserts editable fields and parses the scheduled time', async () => {
    const { service, cards } = setup(makeRun(), makeCard());

    const card = await service.save(runId, request);

    expect(cards.upsert).toHaveBeenCalledWith(runId, {
      title: 'Топ 5 пород собак',
      hashtags: ['пород', 'собак'],
      privacyLevel: 'SELF_ONLY',
      scheduledAt: new Date('2026-11-07T09:30:00.000Z'),
    } satisfies PublishCardInput);
    expect(card.privacyLevel).toBe('SELF_ONLY');
    expect(card.scheduledAt).toBe('2026-11-07T09:30:00.000Z');
  });

  it('rejects edits outside SCHEDULED/PUBLISHING', async () => {
    const { service, cards } = setup(makeRun({ state: 'REVIEW' }), makeCard());

    await expect(service.save(runId, request)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cards.upsert).not.toHaveBeenCalled();
  });

  it('keeps the first export timestamp and never downgrades a published card', async () => {
    const exportedAt = new Date('2026-11-06T10:05:00.000Z');
    const { service, cards } = setup(
      makeRun(),
      makeCard({ state: 'exported', exportedAt }),
    );

    const card = await service.markExported(runId);

    expect(cards.markExported).toHaveBeenCalledWith(
      runId,
      exportedAt,
      expect.any(Date),
    );
    expect(card.exportedAt).toBe(exportedAt.toISOString());

    const published = setup(
      makeRun({ state: 'PUBLISHING' }),
      makeCard({ state: 'published' }),
    );

    const unchanged = await published.service.markExported(runId);

    expect(unchanged.state).toBe('published');
    expect(published.cards.markExported).not.toHaveBeenCalled();
  });

  it('records the export moment on the first download', async () => {
    const { service, cards } = setup(makeRun(), makeCard());

    await service.markExported(runId);

    expect(cards.markExported).toHaveBeenCalledWith(
      runId,
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('rejects an export when the run is not awaiting publishing', async () => {
    const { service } = setup(makeRun({ state: 'PUBLISHED' }), makeCard());

    await expect(service.markExported(runId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishes manually with two transitions and a published card', async () => {
    const { service, runs } = setup(makeRun(), makeCard());

    const card = await service.markPublishedManually(runId);

    expect(runs.applyManualPublish).toHaveBeenCalledWith(
      runId,
      expect.any(Date),
    );
    expect(card.state).toBe('published');
    expect(card.publishedAt).toBe(createdAt.toISOString());
  });

  it('requires SCHEDULED and an existing card for manual publish', async () => {
    const { service, runs } = setup(makeRun({ state: 'REVIEW' }), makeCard());

    await expect(service.markPublishedManually(runId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(runs.applyManualPublish).not.toHaveBeenCalled();

    const { service: noCard } = setup(makeRun(), null);

    await expect(noCard.markPublishedManually(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports a manual publish that lost the SCHEDULED race', async () => {
    const { service, runs } = setup(makeRun(), makeCard());

    vi.mocked(runs.applyManualPublish).mockResolvedValue(null);

    await expect(service.markPublishedManually(runId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
