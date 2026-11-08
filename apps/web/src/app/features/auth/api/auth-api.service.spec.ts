import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { AuthSession, LoginRequest } from '@peertoreel/contracts';
import { API_BASE_URL } from '../../../core/config/api.config';
import { AuthApiService } from './auth-api.service';

const session: AuthSession = {
  user: {
    id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
    email: 'owner@peertoreel.local',
    displayName: 'Owner',
    role: 'admin',
  },
  expiresAt: '2026-11-10T12:00:00.000Z',
};

const credentials: LoginRequest = {
  email: 'owner@peertoreel.local',
  password: 'correct-horse-battery',
};

describe('AuthApiService', () => {
  let api: AuthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
      ],
    });

    api = TestBed.inject(AuthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('logs in with credentials included', () => {
    let response: AuthSession | undefined;

    api.login(credentials).subscribe((value) => {
      response = value;
    });

    const request = http.expectOne('http://api.test/api/v1/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);
    expect(request.request.withCredentials).toBe(true);

    request.flush(session);
    expect(response).toEqual(session);
  });

  it('rejects a malformed session payload', () => {
    let failed = false;

    api.me().subscribe({ error: () => (failed = true) });

    http
      .expectOne('http://api.test/api/v1/auth/me')
      .flush({ user: { id: 'not-a-uuid' } });

    expect(failed).toBe(true);
  });

  it('reads the current session', () => {
    let response: AuthSession | undefined;

    api.me().subscribe((value) => {
      response = value;
    });

    const request = http.expectOne('http://api.test/api/v1/auth/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush(session);
    expect(response).toEqual(session);
  });

  it('logs out', () => {
    api.logout().subscribe();

    const request = http.expectOne('http://api.test/api/v1/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);

    request.flush(null);
  });
});
