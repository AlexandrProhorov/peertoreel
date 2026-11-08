import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { TikTokAccount, TikTokCreatorInfo } from '@peertoreel/contracts';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccountsApiService } from '../api/accounts-api.service';
import { AccountsStoreService } from './accounts-store.service';

const now = '2026-11-07T10:00:00.000Z';

const account: TikTokAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  openId: 'open-1',
  displayName: 'Peer to Reel',
  avatarUrl: null,
  scope: 'user.info.basic,video.publish',
  accessExpiresAt: now,
  refreshExpiresAt: now,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const creatorInfo: TikTokCreatorInfo = {
  username: 'peertoreel',
  nickname: 'Peer to Reel',
  avatarUrl: null,
  privacyLevelOptions: ['SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 300,
};

function httpError(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: {
      error: {
        code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'CONFLICT',
        message,
        requestId: 'req-1',
      },
    },
  });
}

function setup(api: Partial<AccountsApiService> = {}) {
  const mock = {
    list: vi.fn().mockReturnValue(of([account])),
    authorize: vi.fn().mockReturnValue(
      of({ url: 'https://www.tiktok.com/v2/auth/authorize/?state=s' }),
    ),
    disconnect: vi.fn().mockReturnValue(of(null as unknown as void)),
    creatorInfo: vi.fn().mockReturnValue(of(creatorInfo)),
    ...api,
  };

  TestBed.configureTestingModule({
    providers: [
      AccountsStoreService,
      { provide: AccountsApiService, useValue: mock },
    ],
  });

  return { store: TestBed.inject(AccountsStoreService), mock };
}

describe('AccountsStoreService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads accounts', () => {
    const { store } = setup();

    store.load();

    expect(store.accounts()).toEqual([account]);
    expect(store.loaded()).toBe(true);
    expect(store.isEmpty()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('exposes an empty state after a successful empty load', () => {
    const { store } = setup({ list: vi.fn().mockReturnValue(of([])) });

    store.load();

    expect(store.isEmpty()).toBe(true);
  });

  it('keeps a load error visible', () => {
    const { store } = setup({
      list: vi.fn().mockReturnValue(
        throwError(() => httpError(503, 'TikTok не настроен')),
      ),
    });

    store.load();

    expect(store.loaded()).toBe(false);
    expect(store.error()).toBe('TikTok не настроен');
  });

  it('returns the consent URL', async () => {
    const { store, mock } = setup();

    await expect(store.connect()).resolves.toContain('tiktok.com');
    expect(mock.authorize).toHaveBeenCalled();
  });

  it('reports an authorize failure', async () => {
    const { store } = setup({
      authorize: vi.fn().mockReturnValue(
        throwError(() => httpError(503, 'TikTok не настроен')),
      ),
    });

    await expect(store.connect()).resolves.toBeNull();
    expect(store.error()).toBe('TikTok не настроен');
  });

  it('disconnects and reloads the list', async () => {
    const { store, mock } = setup();

    store.load();
    await expect(store.disconnect(account.id)).resolves.toBe(true);

    expect(mock.disconnect).toHaveBeenCalledWith(account.id);
    expect(mock.list).toHaveBeenCalledTimes(2);
  });

  it('keeps the account when disconnect fails', async () => {
    const { store } = setup({
      disconnect: vi.fn().mockReturnValue(
        throwError(() => httpError(409, 'Не удалось отозвать токен')),
      ),
    });

    store.load();
    await expect(store.disconnect(account.id)).resolves.toBe(false);

    expect(store.error()).toBe('Не удалось отозвать токен');
    expect(store.accounts()).toEqual([account]);
  });

  it('shows creator info after a connection test', async () => {
    const { store, mock } = setup();

    await expect(store.testConnection(account.id)).resolves.toBe(true);

    expect(mock.creatorInfo).toHaveBeenCalledWith(account.id);
    expect(store.creatorInfo()).toEqual(creatorInfo);
  });

  it('clears creator info', () => {
    const { store } = setup();

    store.clearCreatorInfo();

    expect(store.creatorInfo()).toBeNull();
  });
});
