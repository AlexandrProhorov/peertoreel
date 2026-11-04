import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { BaseApiService, type ResponseSchema } from './base-api.service';

interface Payload {
  id: string;
}

const payloadSchema: ResponseSchema<Payload> = {
  parse(input: unknown): Payload {
    if (
      typeof input !== 'object' ||
      input === null ||
      typeof (input as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Unexpected payload');
    }

    return { id: (input as { id: string }).id };
  },
};

@Injectable()
class TestApiService extends BaseApiService {
  read(): Observable<Payload> {
    return this.get('/things/one', payloadSchema);
  }

  create(body: unknown): Observable<Payload> {
    return this.post('/things', body, payloadSchema);
  }

  remove(): Observable<void> {
    return this.postVoid('/things/one');
  }
}

describe('BaseApiService', () => {
  let api: TestApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TestApiService,
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(TestApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('builds a GET with credentials and validates the response', () => {
    let result: Payload | undefined;

    api.read().subscribe((value) => {
      result = value;
    });

    const request = http.expectOne('http://api.test/api/v1/things/one');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush({ id: 'one' });
    expect(result).toEqual({ id: 'one' });
  });

  it('posts a body and validates the response', () => {
    api.create({ name: 'test' }).subscribe();

    const request = http.expectOne('http://api.test/api/v1/things');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'test' });
    expect(request.request.withCredentials).toBe(true);

    request.flush({ id: 'two' });
  });

  it('rejects a malformed payload instead of leaking it to the store', () => {
    let failed = false;

    api.read().subscribe({ error: () => (failed = true) });

    http.expectOne('http://api.test/api/v1/things/one').flush({ unexpected: true });

    expect(failed).toBe(true);
  });

  it('supports void POSTs such as logout', () => {
    api.remove().subscribe();

    const request = http.expectOne('http://api.test/api/v1/things/one');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();

    request.flush(null);
  });
});
