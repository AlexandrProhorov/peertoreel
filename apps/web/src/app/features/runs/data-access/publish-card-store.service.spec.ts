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
          ...api,
        },
      },
    ],
  });

  return TestBed.inject(PublishCardStoreService);
}

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

    await expect(store.save(request)).resolves.toBe(true);
    expect(api.save).toHaveBeenCalledWith(runId, request);
    expect(store.card()).toEqual(updated);
  });

  it('reports a save failure and keeps the previous card', async () => {
    const store = setup({
      save: vi
        .fn()
        .mockReturnValue(throwError(() => httpError(409, 'Карточка уже опубликована'))),
    });

    store.setRelativeId(runId);

    await expect(store.save(request)).resolves.toBe(false);
    expect(store.error()).toBe('Карточка уже опубликована');
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

    await expect(store.markExported()).resolves.toBe(true);
    expect(store.card()?.state).toBe('exported');

    await expect(store.markPublished()).resolves.toBe(true);
    expect(store.card()?.state).toBe('published');
  });

  it('does nothing without a relative id', async () => {
    const store = setup();

    await expect(store.save(request)).resolves.toBe(false);
    await expect(store.markExported()).resolves.toBe(false);
    await expect(store.markPublished()).resolves.toBe(false);
  });

  it('reloads when the relative id changes', () => {
    const other = '22222222-2222-4222-8222-222222222222';
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
