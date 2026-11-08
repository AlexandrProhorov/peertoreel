import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Run } from '@peertoreel/contracts';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RunsApiService } from '../api/runs-api.service';
import { RunsListStoreService } from './runs-list-store.service';

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

const conflict = new HttpErrorResponse({
  status: 409,
  error: {
    error: {
      code: 'CONFLICT',
      message: 'Run уже существует',
      requestId: 'req-1',
    },
  },
});

function setup(api: Partial<RunsApiService>): RunsListStoreService {
  TestBed.configureTestingModule({
    providers: [
      RunsListStoreService,
      {
        provide: RunsApiService,
        useValue: { list: vi.fn().mockReturnValue(of([])), ...api },
      },
    ],
  });

  return TestBed.inject(RunsListStoreService);
}

describe('RunsListStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the run list', async () => {
    const store = setup({ list: vi.fn().mockReturnValue(of([run])) });

    store.load();

    await vi.waitFor(() => expect(store.runs()).toHaveLength(1));
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('normalizes a list failure', async () => {
    const store = setup({
      list: vi.fn().mockReturnValue(throwError(() => conflict)),
    });

    store.load();

    await vi.waitFor(() => expect(store.error()).toBe('Run уже существует'));
    expect(store.runs()).toHaveLength(0);
    expect(store.loading()).toBe(false);
  });

  it('creates a run with a trimmed topic', async () => {
    const create = vi.fn().mockReturnValue(of(run));
    const store = setup({ create });

    const created = await store.create('  Почему небо синее  ');

    expect(created).toEqual(run);
    expect(create).toHaveBeenCalledWith('Почему небо синее');
    expect(store.pending()).toBe(false);
  });

  it('ignores an empty topic', async () => {
    const create = vi.fn();
    const store = setup({ create });

    await expect(store.create('   ')).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not start a second create while the first is pending', async () => {
    const created$ = new Subject<Run>();
    const create = vi.fn().mockReturnValue(created$.asObservable());
    const store = setup({ create });

    const first = store.create('Тема');
    const second = store.create('Другая тема');

    await expect(second).resolves.toBeNull();
    expect(create).toHaveBeenCalledOnce();

    created$.next(run);
    created$.complete();

    await expect(first).resolves.toEqual(run);
  });
});
