import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  PublishCard,
  UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PublishCardApiService } from '../api/publish-card-api.service';
import { PublishCardStoreService } from './publish-card-store.service';

const runId = '11111111-1111-4111-8111-111111111111';

const card: PublishCard = {
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
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

const request: UpdatePublishCardRequest = {
  title: 'Новый заголовок',
  hashtags: ['собаки'],
  privacyLevel: 'SELF_ONLY',
  scheduledAt: null,
};

function httpError(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: {
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'CONFLICT',
        message,
        requestId: 'req-1',
      },
    },
  });
}

function setup(api: Partial<PublishCardApiService> = {}): PublishCardStoreService {
  TestBed.configureTestingModule({
    providers: [
      PublishCardStoreService,
      {
        provide: PublishCardApiService,
        useValue: {
          card: vi.fn().mockReturnValue(of(card)),
          save: vi.fn().mockReturnValue(of(card)),
          markExported: vi.fn().mockReturnValue(of(card)),
          markPublished: vi
            .fn()
            .mockReturnValue(of({ ...card, state: 'published' })),
          tiktokAvailability: vi
            .fn()
            .mockReturnValue(of({ account: null, job: null })),
          startTikTokPublish: vi.fn().mockReturnValue(
            of({
              jobId: `publish-${runId}`,
              stage: 'publish',
              status: 'queued',
            }),
          ),
          tiktokPublishJob: vi
            .fn()
            .mockReturnValue(
              throwError(() => httpError(404, 'Job не найден')),
            ),
          ...api,
        },
      },
    ],
  });

  return TestBed.inject(PublishCardStoreService);
}

/** Lets fire-and-forget store commands settle in microtasks. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('PublishCardStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the card for the current run', () => {
    const api = {
      card: vi.fn().mockReturnValue(of(card)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);

    expect(api.card).toHaveBeenCalledWith(runId);
    expect(store.card()).toEqual(card);
    expect(store.loaded()).toBe(true);
    expect(store.missing()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('treats a 404 as an empty card, not an error', () => {
    const store = setup({
      card: vi.fn().mockReturnValue(
        throwError(() => httpError(404, 'Карточки нет')),
      ),
    });

    store.setRelativeId(runId);

    expect(store.card()).toBeNull();
    expect(store.loaded()).toBe(true);
    expect(store.missing()).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('keeps other load failures visible', () => {
    const store = setup({
      card: vi.fn().mockReturnValue(
        throwError(() => httpError(409, 'Сервер недоступен')),
      ),
    });

    store.setRelativeId(runId);

    expect(store.loaded()).toBe(false);
    expect(store.error()).toBe('Сервер недоступен');
  });

  it('saves the card and replaces the signal', async () => {
    const updated = { ...card, title: 'Новый заголовок' };
    const api = {
      save: vi.fn().mockReturnValue(of(updated)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);
    store.save(request);

    await vi.waitFor(() => expect(store.card()).toEqual(updated));

    expect(api.save).toHaveBeenCalledWith(runId, request);
  });

  it('reports a save failure and keeps the previous card', async () => {
    const store = setup({
      save: vi
        .fn()
        .mockReturnValue(throwError(() => httpError(409, 'Карточка уже опубликована'))),
    });

    store.setRelativeId(runId);
    store.save(request);

    await vi.waitFor(() =>
      expect(store.error()).toBe('Карточка уже опубликована'),
    );

    expect(store.card()).toEqual(card);
  });

  it('marks the card exported and published', async () => {
    const exported = { ...card, state: 'exported' as const };
    const published = { ...card, state: 'published' as const };
    const api = {
      markExported: vi.fn().mockReturnValue(of(exported)),
      markPublished: vi.fn().mockReturnValue(of(published)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);

    store.markExported();
    await vi.waitFor(() => expect(store.card()?.state).toBe('exported'));

    store.markPublished();
    await vi.waitFor(() => expect(store.card()?.state).toBe('published'));
  });

  it('calls onPublished only after a successful publish', async () => {
    const published = { ...card, state: 'published' as const };
    const store = setup({
      markPublished: vi.fn().mockReturnValue(of(published)),
    });
    const onPublished = vi.fn();

    store.setRelativeId(runId);
    store.markPublished(onPublished);

    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce());
  });

  it('does nothing without a relative id', async () => {
    const api = {
      save: vi.fn(),
      markExported: vi.fn(),
      markPublished: vi.fn(),
    } as Partial<PublishCardApiService>;
    const store = setup(api);
    const onPublished = vi.fn();

    store.save(request);
    store.markExported();
    store.markPublished(onPublished);
    await flush();

    expect(api.save).not.toHaveBeenCalled();
    expect(api.markExported).not.toHaveBeenCalled();
    expect(api.markPublished).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it('loads the TikTok account and rehydrates an in-flight job', () => {
    const account = {
      id: '44444444-4444-4444-8444-444444444444',
      openId: 'open-1',
      displayName: 'Куклуксмаксер',
    };
    const job = {
      jobId: `publish-${runId}`,
      stage: 'publish' as const,
      status: 'active' as const,
      progress: 40,
    };
    const api = {
      tiktokAvailability: vi
        .fn()
        .mockReturnValue(of({ account, job })),
      tiktokPublishJob: vi.fn().mockReturnValue(of(job)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);

    expect(store.tiktokAccount()).toEqual(account);
    expect(store.tiktokJob()).toEqual(job);
    expect(store.tiktokPublishing()).toBe(true);
    expect(store.tiktokLoaded()).toBe(true);
  });

  it('saves the card then enqueues a TikTok publish', async () => {
    const updated = { ...card, privacyLevel: 'SELF_ONLY' as const };
    const completed = {
      jobId: `publish-${runId}`,
      stage: 'publish' as const,
      status: 'completed' as const,
      progress: 100,
    };
    const api = {
      save: vi.fn().mockReturnValue(of(updated)),
      startTikTokPublish: vi.fn().mockReturnValue(
        of({
          jobId: `publish-${runId}`,
          stage: 'publish' as const,
          status: 'queued' as const,
        }),
      ),
      tiktokAvailability: vi
        .fn()
        .mockReturnValue(of({ account: null, job: completed })),
      tiktokPublishJob: vi.fn().mockReturnValue(of(completed)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);
    await flush();

    store.publishToTikTok(request);

    await vi.waitFor(() =>
      expect(api.startTikTokPublish).toHaveBeenCalledWith(runId),
    );
    await vi.waitFor(() => expect(store.tiktokJob()?.status).toBe('completed'));
    expect(api.save).toHaveBeenCalledWith(runId, request);
  });

  it('reports a TikTok publish failure and reloads the card', async () => {
    const failed = {
      jobId: `publish-${runId}`,
      stage: 'publish' as const,
      status: 'failed' as const,
      progress: 20,
      failedReason: 'spam_risk_text',
    };
    const api = {
      startTikTokPublish: vi.fn().mockReturnValue(
        of({
          jobId: `publish-${runId}`,
          stage: 'publish' as const,
          status: 'queued' as const,
        }),
      ),
      tiktokAvailability: vi
        .fn()
        .mockReturnValue(of({ account: null, job: failed })),
      tiktokPublishJob: vi.fn().mockReturnValue(of(failed)),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);
    await flush();

    store.publishToTikTok(request);

    await vi.waitFor(() => expect(store.error()).toBe('spam_risk_text'));
  });

  it('reloads when the relative id changes', () => {    const other = '22222222-2222-4222-8222-222222222222';
    const api = {
      card: vi
        .fn()
        .mockImplementation((id: string) => of({ ...card, runId: id })),
    } as Partial<PublishCardApiService>;
    const store = setup(api);

    store.setRelativeId(runId);
    store.setRelativeId(other);

    expect(api.card).toHaveBeenLastCalledWith(other);
    expect(store.card()?.runId).toBe(other);
  });
});
