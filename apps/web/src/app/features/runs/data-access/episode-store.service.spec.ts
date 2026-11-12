import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  storyboardFixture15Deg,
  type RunStoryboardResponse,
} from '@peertoreel/contracts';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RunsApiService } from '../api/runs-api.service';
import { EpisodeStore } from './episode-store.service';

const runId = '11111111-1111-4111-8111-111111111111';
const otherRunId = '22222222-2222-4222-8222-222222222222';

const response: RunStoryboardResponse = {
  storyboard: storyboardFixture15Deg,
  visuals: {
    images: [],
    providerRequests: 2,
    cacheHits: 1,
    skipped: 3,
  },
  manifest: {
    kind: 'm3.5.1-episode',
    topic: 'Почему у собак мокрый нос',
    title: 'Мокрый нос',
    generatedAt: '2026-11-11T12:00:00.000Z',
    totalMs: 1000,
    llm: {
      provider: 'deepseek',
      model: 'deepseek-flash',
      attempts: 1,
      promptTokens: 100,
      completionTokens: 200,
      ms: 500,
      costUsd: null,
    },
    tts: {
      provider: 'google-translate-spike',
      model: 'google-translate:ru',
      characters: 40,
      words: 8,
      audioDurationSec: 3,
      bytes: 1000,
      ms: 200,
      costUsd: 0,
    },
    stock: {
      provider: 'pixabay',
      queries: 2,
      providerRequests: 2,
      cacheHits: 1,
      images: 0,
      skipped: 3,
      costUsd: 0,
    },
  },
};

const notFound = new HttpErrorResponse({
  status: 404,
  error: {
    error: {
      code: 'NOT_FOUND',
      message: 'У run ещё нет плана эпизода',
      requestId: 'req-1',
    },
  },
});

function setup(api: Partial<RunsApiService> = {}): EpisodeStore {
  TestBed.configureTestingModule({
    providers: [
      EpisodeStore,
      {
        provide: RunsApiService,
        useValue: {
          storyboard: vi.fn().mockReturnValue(of(response)),
          ...api,
        },
      },
    ],
  });

  return TestBed.inject(EpisodeStore);
}

describe('EpisodeStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the storyboard for the scoped run', () => {
    const storyboard = vi.fn().mockReturnValue(of(response));
    const store = setup({ storyboard });

    store.load(runId);

    expect(storyboard).toHaveBeenCalledWith(runId);
    expect(store.storyboard()).toEqual(response);
    expect(store.relativeId()).toBe(runId);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('normalizes a missing plan without keeping old scenes', () => {
    const store = setup({
      storyboard: vi.fn().mockReturnValue(throwError(() => notFound)),
    });

    store.load(runId);

    expect(store.storyboard()).toBeNull();
    expect(store.error()).toBe('У run ещё нет плана эпизода');
    expect(store.loading()).toBe(false);
  });

  it('resets the preview when the run changes', () => {
    const other = { ...response, manifest: { ...response.manifest, title: 'Другой' } };
    const storyboard = vi.fn((id: string) =>
      of(id === runId ? response : other),
    );
    const store = setup({ storyboard });

    store.load(runId);
    store.load(otherRunId);

    expect(store.storyboard()).toEqual(other);
    expect(storyboard).toHaveBeenLastCalledWith(otherRunId);
  });

  it('re-reads the same run on reload', () => {
    const storyboard = vi.fn().mockReturnValue(of(response));
    const store = setup({ storyboard });

    store.load(runId);
    store.reload();

    expect(storyboard).toHaveBeenCalledTimes(2);
    expect(storyboard).toHaveBeenNthCalledWith(2, runId);
  });

  it('does not let a slow previous response overwrite the next run', () => {
    const first = new Subject<RunStoryboardResponse>();
    const other = { ...response, manifest: { ...response.manifest, title: 'Другой' } };
    const storyboard = vi.fn((id: string) =>
      id === runId ? first.asObservable() : of(other),
    );
    const store = setup({ storyboard });

    store.load(runId);
    store.load(otherRunId);

    first.next(response);
    first.complete();

    expect(store.storyboard()).toEqual(other);
  });

  it('clears the preview when the scope is reset', () => {
    const store = setup();

    store.load(runId);
    store.setRelativeId(null);

    expect(store.storyboard()).toBeNull();
    expect(store.relativeId()).toBeNull();
  });
});
