import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ReadinessResponse } from '@kadence/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { HealthApiService } from './health-api.service';

const healthyResponse: ReadinessResponse = {
  status: 'ok',
  service: 'api',
  version: '0.1.0',
  uptimeSeconds: 12,
  timestamp: '2026-10-30T12:00:00.000Z',
  checks: { database: 'up', redis: 'up', worker: 'up' },
};

describe('HealthApiService', () => {
  let api: HealthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(HealthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('GETs readiness and returns the parsed response', () => {
    let received: ReadinessResponse | undefined;

    api.getReadiness().subscribe((response) => {
      received = response;
    });

    const request = http.expectOne('http://api.test/api/v1/health/ready');
    expect(request.request.method).toBe('GET');

    request.flush(healthyResponse);
    expect(received).toEqual(healthyResponse);
  });

  it('fails when the payload does not match the contract', () => {
    let error: unknown;

    api.getReadiness().subscribe({
      error: (caught: unknown) => {
        error = caught;
      },
    });

    const request = http.expectOne('http://api.test/api/v1/health/ready');
    request.flush({ status: 'not-a-real-status' });

    expect(error).toBeInstanceOf(Error);
  });
});
