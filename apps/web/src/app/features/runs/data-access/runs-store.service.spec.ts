import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Run, RunDetail } from '@kadence/contracts';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RunsApiService } from '../api/runs-api.service';
import { RunsStoreService } from './runs-store.service';

const run: Run = {
  id: '11111111-1111-4111-8111-111111111111',
  topic: 'Почему небо синее',
  state: 'DRAFT',
  currentStage: 'topic_discovery',
  failedStage: null,
  failureReason: null,
  resumeState: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

const detail: RunDetail = { ...run, events: [] };

const conflict = new HttpErrorResponse({
  status: 409,
  error: {
    error: {
      code: 'CONFLICT',
      message: 'Переход DRAFT → REVIEW невозможен для этого run',
      requestId: 'req-1',
    },
  },
});

function setup(api: Partial<RunsApiService>): RunsStoreService {
  TestBed.configureTestingModule({
    providers: [
      RunsStoreService,
      {
        provide: RunsApiService,
        useValue: { artifacts: vi.fn().mockReturnValue(of([])), ...api },
      },
    ],
  });

  return TestBed.inject(RunsStoreService);
}

describe('RunsStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the run list', async () => {
    const store = setup({ list: vi.fn().mockReturnValue(of([run])) });

    store.loadRuns();

    await vi.waitFor(() => expect(store.runs()).toHaveLength(1));
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('normalizes a list failure', async () => {
    const store = setup({
      list: vi.fn().mockReturnValue(throwError(() => conflict)),
    });

    store.loadRuns();

    await vi.waitFor(() =>
      expect(store.error()).toBe(
        'Переход DRAFT → REVIEW невозможен для этого run',
      ),
    );
    expect(store.runs()).toHaveLength(0);
    expect(store.loading()).toBe(false);
  });

  it('exposes only transitions allowed for the selected run', async () => {
    const store = setup({ detail: vi.fn().mockReturnValue(of(detail)) });

    store.loadRun(run.id);

    await vi.waitFor(() => expect(store.selected()?.id).toBe(run.id));
    expect(store.allowed()).toEqual(['RESEARCHING', 'FAILED']);
  });

  it('loads artifacts next to the run', async () => {
    const artifact = {
      id: '22222222-2222-4222-8222-222222222222',
      stage: 'voiceover' as const,
      type: 'voiceover_mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 1024,
      createdAt: '2026-11-04T12:00:00.000Z',
      url: 'http://storage.test/voiceover.mp3',
    };
    const store = setup({
      detail: vi.fn().mockReturnValue(of(detail)),
      artifacts: vi.fn().mockReturnValue(of([artifact])),
    });

    store.loadRun(run.id);

    await vi.waitFor(() => expect(store.artifacts()).toHaveLength(1));
    expect(store.artifacts()[0]?.type).toBe('voiceover_mp3');
  });

  it('sends a transition and refreshes the run', async () => {
    const failed: Run = {
      ...run,
      state: 'FAILED',
      currentStage: 'research',
      failedStage: 'research',
      failureReason: 'Pixabay 429',
      resumeState: 'RESEARCHING',
    };
    const transition = vi.fn().mockReturnValue(of(failed));
    const detailSpy = vi.fn().mockReturnValue(of({ ...failed, events: [] }));
    const store = setup({
      detail: detailSpy,
      transition,
      list: vi.fn().mockReturnValue(of([failed])),
    });

    store.loadRun(run.id);
    await vi.waitFor(() => expect(store.selected()).not.toBeNull());

    store.transition(run.id, 'FAILED', 'Pixabay 429');

    await vi.waitFor(() => expect(store.selected()?.state).toBe('FAILED'));
    expect(transition).toHaveBeenCalledWith(run.id, {
      to: 'FAILED',
      reason: 'Pixabay 429',
    });
    expect(store.allowed()).toEqual(['RESEARCHING']);
    expect(store.pending()).toBe(false);
  });

  it('keeps the error from a rejected transition', async () => {
    const store = setup({
      detail: vi.fn().mockReturnValue(of(detail)),
      transition: vi.fn().mockReturnValue(throwError(() => conflict)),
    });

    store.loadRun(run.id);
    await vi.waitFor(() => expect(store.selected()).not.toBeNull());

    store.transition(run.id, 'REVIEW');

    await vi.waitFor(() =>
      expect(store.error()).toBe(
        'Переход DRAFT → REVIEW невозможен для этого run',
      ),
    );
    expect(store.selected()?.state).toBe('DRAFT');
  });

  it('publishes the created run', async () => {
    const create = vi.fn().mockReturnValue(of(run));
    const store = setup({
      create,
      list: vi.fn().mockReturnValue(of([run])),
    });

    store.create('  Почему небо синее  ');

    await vi.waitFor(() => expect(store.created()?.id).toBe(run.id));
    expect(create).toHaveBeenCalledWith('Почему небо синее');
    expect(store.runs()).toHaveLength(1);
  });

  it('ignores an empty topic', () => {
    const create = vi.fn();
    const store = setup({ create });

    store.create('   ');

    expect(create).not.toHaveBeenCalled();
  });
});
