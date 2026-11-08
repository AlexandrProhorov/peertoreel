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
import type {
  TikTokAccountsRepository,
  TikTokAccountRecord,
} from '../accounts/tiktok-accounts.repository.js';
import type { PublishQueue } from './publish.queue.js';
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

function makeAccount(
  overrides: Partial<TikTokAccountRecord> = {},
): TikTokAccountRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: '22222222-2222-4222-8222-222222222222',
    openId: 'open-1',
    displayName: 'Куклуксмаксер',
    avatarUrl: null,
    accessTokenEncrypted: 'access',
    refreshTokenEncrypted: 'refresh',
    accessExpiresAt: new Date(createdAt.getTime() + 7_200_000),
    refreshExpiresAt: new Date(createdAt.getTime() + 15_552_000_000),
    scope: 'user.info.basic,video.publish',
    isActive: true,
    lastRefreshedAt: null,
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

  const accounts = {
    findLatestActiveByUser: vi.fn().mockResolvedValue(null),
  } as unknown as TikTokAccountsRepository;

  const queue = {
    enqueue: vi.fn().mockResolvedValue({
      jobId: `publish-${runId}`,
      stage: 'publish',
      status: 'queued',
    }),
    snapshot: vi.fn().mockResolvedValue(null),
  } as unknown as PublishQueue;

  return {
    service: new PublishService(cards, runs, accounts, queue),
    cards,
    runs,
    accounts,
    queue,
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

  it('enqueues a TikTok publish with the saved privacy', async () => {
    const { service, accounts, queue } = setup(
      makeRun(),
      makeCard({ privacyLevel: 'SELF_ONLY' }),
    );

    vi.mocked(accounts.findLatestActiveByUser).mockResolvedValue(
      makeAccount(),
    );

    const result = await service.startTikTokPublish(runId);

    expect(queue.enqueue).toHaveBeenCalledWith(runId);
    expect(result).toEqual({
      jobId: `publish-${runId}`,
      stage: 'publish',
      status: 'queued',
    });
  });

  it('requires privacy, an active account and a video.publish scope', async () => {
    const missingPrivacy = setup(makeRun(), makeCard());
    await expect(
      missingPrivacy.service.startTikTokPublish(runId),
    ).rejects.toBeInstanceOf(ConflictException);

    const noAccount = setup(
      makeRun(),
      makeCard({ privacyLevel: 'SELF_ONLY' }),
    );
    await expect(
      noAccount.service.startTikTokPublish(runId),
    ).rejects.toBeInstanceOf(ConflictException);

    const noScope = setup(
      makeRun(),
      makeCard({ privacyLevel: 'SELF_ONLY' }),
    );
    vi.mocked(noScope.accounts.findLatestActiveByUser).mockResolvedValue(
      makeAccount({ scope: 'user.info.basic' }),
    );
    await expect(
      noScope.service.startTikTokPublish(runId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports the account and the current publish job', async () => {
    const { service, accounts, queue } = setup(makeRun(), makeCard());
    const snapshot = {
      jobId: `publish-${runId}`,
      stage: 'publish' as const,
      status: 'active' as const,
      progress: 40,
    };

    vi.mocked(accounts.findLatestActiveByUser).mockResolvedValue(
      makeAccount(),
    );
    vi.mocked(queue.snapshot).mockResolvedValue(snapshot);

    await expect(service.tiktokAvailability(runId)).resolves.toEqual({
      account: {
        id: makeAccount().id,
        openId: 'open-1',
        displayName: 'Куклуксмаксер',
      },
      job: snapshot,
    });
    await expect(service.tiktokJob(runId)).resolves.toEqual(snapshot);
  });

  it('reports a missing publish job', async () => {
    const { service } = setup(makeRun(), makeCard());

    await expect(service.tiktokJob(runId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
