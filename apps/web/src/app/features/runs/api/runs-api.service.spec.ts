import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { QcReport, Run, RunDetail } from '@peertoreel/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { RunsApiService } from './runs-api.service';

const run: Run = {
  id: '11111111-1111-4111-8111-111111111111',
  topic: 'Почему небо синее',
  mode: 'pipeline',
  state: 'DRAFT',
  currentStage: 'topic_discovery',
  failedStage: null,
  failureReason: null,
  resumeState: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

const detail: RunDetail = { ...run, events: [] };

const qcReport: QcReport = {
  verdict: 'pass',
  checks: [{ id: 'duration', status: 'pass', message: '47.9 с' }],
  metrics: {
    durationSec: 47.9,
    audioDurationSec: 47.9,
    videoDurationSec: 47.9,
    integratedLufs: -14.2,
    truePeakDb: -1.3,
    loudnessRange: 7.2,
    words: 150,
    wordsPerMinute: 188,
    maxSentenceWords: 12,
    audioGaps: [0.08],
    stopWords: [],
    isAigc: true,
  },
  createdAt: '2026-11-05T16:00:00.000Z',
};

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

  it('starts a stage and reads its job status', () => {
    api.startStage(run.id, 'script').subscribe();

    const start = http.expectOne(
      `http://api.test/api/v1/runs/${run.id}/stages/script`,
    );
    expect(start.request.method).toBe('POST');
    expect(start.request.withCredentials).toBe(true);
    start.flush({ jobId: `script-${run.id}`, stage: 'script', status: 'queued' });

    let snapshot: unknown;

    api.stageJob(run.id, 'script').subscribe((value) => {
      snapshot = value;
    });

    const status = http.expectOne(
      `http://api.test/api/v1/runs/${run.id}/stages/script/job`,
    );
    expect(status.request.method).toBe('GET');
    status.flush({
      jobId: `script-${run.id}`,
      stage: 'script',
      status: 'completed',
      progress: 100,
    });

    expect(snapshot).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('lists run artifacts with signed urls', () => {
    let result: unknown[] | undefined;

    api.artifacts(run.id).subscribe((artifacts) => {
      result = artifacts;
    });

    const request = http.expectOne(
      `http://api.test/api/v1/runs/${run.id}/artifacts`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush({
      artifacts: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          stage: 'voiceover',
          type: 'voiceover_mp3',
          contentType: 'audio/mpeg',
          sizeBytes: 952_990,
          createdAt: '2026-11-04T12:00:00.000Z',
          url: 'http://storage.test/voiceover.mp3',
        },
      ],
    });

    expect(result).toHaveLength(1);
  });

  it('rejects a malformed artifact payload', () => {
    let failed = false;

    api.artifacts(run.id).subscribe({ error: () => (failed = true) });

    http
      .expectOne(`http://api.test/api/v1/runs/${run.id}/artifacts`)
      .flush({ artifacts: [{ type: 'voiceover_mp3' }] });

    expect(failed).toBe(true);
  });

  it('reads the QC report', () => {
    let result: QcReport | undefined;

    api.qc(run.id).subscribe((value) => {
      result = value;
    });

    const request = http.expectOne(`http://api.test/api/v1/runs/${run.id}/qc`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush(qcReport);

    expect(result?.verdict).toBe('pass');
  });
});
