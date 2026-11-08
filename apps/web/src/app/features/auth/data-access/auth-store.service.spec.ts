import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { AuthSession } from '@peertoreel/contracts';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthApiService } from '../api/auth-api.service';
import { AuthStoreService } from './auth-store.service';

const session: AuthSession = {
  user: {
    id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
    email: 'owner@peertoreel.local',
    displayName: 'Owner',
    role: 'admin',
  },
  expiresAt: '2026-11-10T12:00:00.000Z',
};

const unauthorized = new HttpErrorResponse({
  status: 401,
  error: {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Неверный email или пароль',
      requestId: 'req-1',
    },
  },
});

function setup(api: Partial<AuthApiService>): AuthStoreService {
  TestBed.configureTestingModule({
    providers: [AuthStoreService, { provide: AuthApiService, useValue: api }],
  });

  return TestBed.inject(AuthStoreService);
}

describe('AuthStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('sets the user after a successful login', async () => {
    const store = setup({ login: vi.fn().mockReturnValue(of(session)) });
    expect(store.isAuthenticated()).toBe(false);

    store.login({ email: 'owner@peertoreel.local', password: 'secret-password' });

    await vi.waitFor(() => expect(store.isAuthenticated()).toBe(true));
    expect(store.user()?.email).toBe('owner@peertoreel.local');
    expect(store.expiresAt()).toBe(session.expiresAt);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('normalizes a login failure and stays signed out', async () => {
    const store = setup({
      login: vi.fn().mockReturnValue(throwError(() => unauthorized)),
    });

    store.login({ email: 'owner@peertoreel.local', password: 'wrong-password' });

    await vi.waitFor(() => expect(store.error()).toBe('Неверный email или пароль'));
    expect(store.isAuthenticated()).toBe(false);
    expect(store.loading()).toBe(false);
  });

  it('restores an existing session', async () => {
    const me = vi.fn().mockReturnValue(of(session));
    const store = setup({ me });

    let restored: unknown;

    store.restore().subscribe((user) => {
      restored = user;
    });

    expect(restored).toEqual(session.user);
    expect(store.isAuthenticated()).toBe(true);
    expect(me).toHaveBeenCalledOnce();
  });

  it('shares one session restore between concurrent callers', () => {
    const me = vi.fn().mockReturnValue(of(session));
    const store = setup({ me });

    store.restore().subscribe();
    store.restore().subscribe();

    expect(me).toHaveBeenCalledOnce();
  });

  it('treats a rejected session restore as signed out', async () => {
    const store = setup({ me: () => throwError(() => unauthorized) });

    let restored: unknown;

    store.restore().subscribe((user) => {
      restored = user;
    });

    expect(restored).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('clears state on logout', async () => {
    const store = setup({
      me: vi.fn().mockReturnValue(of(session)),
      logout: vi.fn().mockReturnValue(of(undefined)),
    });

    store.restore().subscribe();
    expect(store.isAuthenticated()).toBe(true);

    store.logout();

    await vi.waitFor(() => expect(store.isAuthenticated()).toBe(false));
    expect(store.user()).toBeNull();
  });
});
