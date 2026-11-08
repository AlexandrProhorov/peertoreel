import { TestBed } from '@angular/core/testing';
import type { PingJobResult, SystemJobSnapshot } from '@peertoreel/contracts';
import { concat, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { SystemApiService } from '../api/system-api.service';
import { SystemStoreService } from './system-store.service';

const result: PingJobResult = {
  requestId: 'job-1',
  processedAt: '2026-11-02T12:00:00.000Z',
  durationMs: 450,
};

const activeSnapshot: SystemJobSnapshot = {
  jobId: 'job-1',
  status: 'active',
  progress: 50,
};

const completedSnapshot: SystemJobSnapshot = {
  jobId: 'job-1',
  status: 'completed',
  progress: 100,
  result,
};

function setup(api: Partial<SystemApiService>): SystemStoreService {
  TestBed.configureTestingModule({
    providers: [SystemStoreService, { provide: SystemApiService, useValue: api }],
  });

  return TestBed.inject(SystemStoreService);
}

describe('SystemStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('enqueues a ping and follows SSE until completion', async () => {
    const api = {
      enqueuePing: vi.fn().mockReturnValue(of({ jobId: 'job-1', status: 'queued' })),
      streamPing: vi.fn().mockReturnValue(of(activeSnapshot, completedSnapshot)),
    };
    const store = setup(api);

    store.start();

    await vi.waitFor(() => expect(store.status()).toBe('completed'));
    expect(store.jobId()).toBe('job-1');
    expect(store.progress()).toBe(100);
    expect(store.result()).toEqual(result);
    expect(store.running()).toBe(false);
    expect(store.history()).toHaveLength(2);
  });

  it('ignores a second ping while the first is running', () => {
    const stream = new Subject<SystemJobSnapshot>();
    const enqueuePing = vi.fn().mockReturnValue(of({ jobId: 'job-1', status: 'queued' as const }));
    const store = setup({
      enqueuePing,
      streamPing: vi.fn().mockReturnValue(stream.asObservable()),
    });

    store.start();
    store.start();

    expect(enqueuePing).toHaveBeenCalledOnce();
  });

  it('re-enables the button when the SSE stream fails', async () => {
    const api = {
      enqueuePing: vi.fn().mockReturnValue(of({ jobId: 'job-1', status: 'queued' as const })),
      streamPing: vi.fn().mockReturnValue(
        concat(
          of(activeSnapshot),
          throwError(() => new Error('sse down')),
        ),
      ),
    };
    const store = setup(api);

    store.start();

    await vi.waitFor(() => expect(store.status()).toBe('failed'));
    expect(store.error()).toBe('sse down');
    expect(store.running()).toBe(false);
  });

  it('stores a normalized error and stops running', async () => {
    const api = {
      enqueuePing: vi.fn().mockReturnValue(throwError(() => new Error('queue down'))),
    };
    const store = setup(api);

    store.start();

    await vi.waitFor(() => expect(store.error()).toBe('queue down'));
    expect(store.running()).toBe(false);
    expect(store.jobId()).toBeNull();
  });
});
