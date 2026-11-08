import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SystemJobSnapshot } from '@peertoreel/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { SystemApiService } from './system-api.service';

const completedSnapshot: SystemJobSnapshot = {
  jobId: 'job-1',
  status: 'completed',
  progress: 100,
  result: {
    requestId: 'job-1',
    processedAt: '2026-11-02T12:00:00.000Z',
    durationMs: 450,
  },
};

describe('SystemApiService', () => {
  let api: SystemApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(SystemApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('enqueues a ping job', () => {
    let response: unknown;

    api.enqueuePing({}).subscribe((value) => {
      response = value;
    });

    const request = http.expectOne('http://api.test/api/v1/system/ping');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({ jobId: 'job-1', status: 'queued' });
    expect(response).toEqual({ jobId: 'job-1', status: 'queued' });
  });

  it('reads a job snapshot', () => {
    let response: SystemJobSnapshot | undefined;

    api.getPing('job-1').subscribe((value) => {
      response = value;
    });

    const request = http.expectOne('http://api.test/api/v1/system/ping/job-1');
    expect(request.request.method).toBe('GET');

    request.flush(completedSnapshot);
    expect(response).toEqual(completedSnapshot);
  });
});
