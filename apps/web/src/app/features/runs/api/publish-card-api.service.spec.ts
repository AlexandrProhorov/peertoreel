import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublishCard } from '@kadence/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { PublishCardApiService } from './publish-card-api.service';

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

const request = {
  title: 'Топ 5 пород собак',
  hashtags: ['пород', 'собак'],
  privacyLevel: null,
  scheduledAt: null,
};

describe('PublishCardApiService', () => {
  let api: PublishCardApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(PublishCardApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('reads the card of a run', () => {
    let result: PublishCard | undefined;

    api.card(runId).subscribe((value) => {
      result = value;
    });

    const request = http.expectOne(
      `http://api.test/api/v1/runs/${runId}/publish-card`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush(card);
    expect(result).toEqual(card);
  });

  it('saves the card with PUT', () => {
    api.save(runId, request).subscribe();

    const httpRequest = http.expectOne(
      `http://api.test/api/v1/runs/${runId}/publish-card`,
    );
    expect(httpRequest.request.method).toBe('PUT');
    expect(httpRequest.request.body).toEqual(request);
    expect(httpRequest.request.withCredentials).toBe(true);

    httpRequest.flush(card);
  });

  it('marks the card exported and published', () => {
    api.markExported(runId).subscribe();
    api.markPublished(runId).subscribe();

    const exported = http.expectOne(
      `http://api.test/api/v1/runs/${runId}/publish-card/mark-exported`,
    );
    expect(exported.request.method).toBe('POST');
    exported.flush({ ...card, state: 'exported' });

    const published = http.expectOne(
      `http://api.test/api/v1/runs/${runId}/manual-publish`,
    );
    expect(published.request.method).toBe('POST');
    published.flush({ ...card, state: 'published' });
  });

  it('rejects a malformed card payload', () => {
    let failed = false;

    api.card(runId).subscribe({ error: () => (failed = true) });

    http
      .expectOne(`http://api.test/api/v1/runs/${runId}/publish-card`)
      .flush({ ...card, isAigc: 'yes' });

    expect(failed).toBe(true);
  });
});
