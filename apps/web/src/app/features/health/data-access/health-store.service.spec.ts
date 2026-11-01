import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ReadinessResponse } from '@kadence/contracts';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { HealthApiService } from '../api/health-api.service';
import { HealthStoreService } from './health-store.service';

const healthyResponse: ReadinessResponse = {
  status: 'ok',
  service: 'api',
  version: '0.1.0',
  uptimeSeconds: 12,
  timestamp: '2026-10-30T12:00:00.000Z',
  checks: { database: 'up', redis: 'up' },
};

const degradedResponse: ReadinessResponse = {
  ...healthyResponse,
  status: 'degraded',
  checks: { database: 'up', redis: 'down' },
};

function setup(api: Partial<HealthApiService>): HealthStoreService {
  TestBed.configureTestingModule({
    providers: [HealthStoreService, { provide: HealthApiService, useValue: api }],
  });

  return TestBed.inject(HealthStoreService);
}

describe('HealthStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('stores a successful readiness response', async () => {
    const api = {
      getReadiness: vi.fn().mockReturnValue(of(healthyResponse)),
    };
    const store = setup(api);

    store.load();

    await vi.waitFor(() => expect(store.data()).toEqual(healthyResponse));
    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('treats a 503 readiness body as degraded domain data', async () => {
    const api = {
      getReadiness: vi
        .fn()
        .mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 503,
                error: degradedResponse,
              }),
          ),
        ),
    };
    const store = setup(api);

    store.load();

    await vi.waitFor(() => expect(store.data()).toEqual(degradedResponse));
    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('stores a normalized error and clears stale data', async () => {
    const api = {
      getReadiness: vi
        .fn()
        .mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 500,
                error: {
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Backend down',
                    requestId: 'req-1',
                  },
                },
              }),
          ),
        ),
    };
    const store = setup(api);

    store.load();

    await vi.waitFor(() => expect(store.error()).toBe('Backend down'));
    expect(store.data()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('cancels the previous read when a new load starts', async () => {
    const first = new Subject<ReadinessResponse>();
    const api = {
      getReadiness: vi
        .fn()
        .mockReturnValueOnce(first.asObservable())
        .mockReturnValueOnce(of(healthyResponse)),
    };
    const store = setup(api);

    store.load();
    expect(first.observed).toBe(true);

    store.load();

    await vi.waitFor(() => expect(store.data()).toEqual(healthyResponse));
    expect(first.observed).toBe(false);
  });
});
