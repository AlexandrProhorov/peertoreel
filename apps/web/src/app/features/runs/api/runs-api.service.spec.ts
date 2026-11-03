import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Run, RunDetail } from '@kadence/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { RunsApiService } from './runs-api.service';

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

describe('RunsApiService', () => {
  let api: RunsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(RunsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('lists runs', () => {
    let result: Run[] | undefined;

    api.list().subscribe((runs) => {
      result = runs;
    });

    const request = http.expectOne('http://api.test/api/v1/runs');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush({ runs: [run] });
    expect(result).toEqual([run]);
  });

  it('creates a run', () => {
    api.create('Почему небо синее').subscribe();

    const request = http.expectOne('http://api.test/api/v1/runs');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ topic: 'Почему небо синее' });

    request.flush(run);
  });

  it('posts a transition with the reason', () => {
    api
      .transition(run.id, { to: 'FAILED', reason: 'Pixabay 429' })
      .subscribe();

    const request = http.expectOne(
      `http://api.test/api/v1/runs/${run.id}/transitions`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      to: 'FAILED',
      reason: 'Pixabay 429',
    });

    request.flush({ ...run, state: 'FAILED' });
  });

  it('reads a run with its history', () => {
    let result: RunDetail | undefined;

    api.detail(run.id).subscribe((value) => {
      result = value;
    });

    http
      .expectOne(`http://api.test/api/v1/runs/${run.id}`)
      .flush(detail);

    expect(result).toEqual(detail);
  });
});
