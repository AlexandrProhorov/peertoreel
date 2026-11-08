import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TokenCipher, TikTokApiError } from '@kadence/tiktok';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env.js';
import type { RedisService } from '../redis/redis.service.js';
import type {
  TikTokAccountRecord,
  TikTokAccountsRepository,
} from './tiktok-accounts.repository.js';
import { TikTokTokenService } from './tiktok-token.service.js';

const key = Buffer.alloc(32, 7).toString('base64');
const cipher = new TokenCipher(key);
const now = new Date('2026-11-07T10:00:00.000Z');

const account: TikTokAccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  openId: 'open-1',
  displayName: 'Kadence',
  avatarUrl: null,
  accessTokenEncrypted: cipher.encrypt('old-access'),
  refreshTokenEncrypted: cipher.encrypt('old-refresh'),
  accessExpiresAt: new Date(now.getTime() + 3_600_000),
  refreshExpiresAt: new Date(now.getTime() + 15_552_000_000),
  scope: 'user.info.basic,video.publish',
  isActive: true,
  lastRefreshedAt: null,
  createdAt: now,
  updatedAt: now,
};

function env(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    TIKTOK_CLIENT_KEY: 'client-key',
    TIKTOK_CLIENT_SECRET: 'client-secret',
    TIKTOK_REDIRECT_URI: 'http://localhost:3000/api/v1/accounts/tiktok/callback',
    TOKEN_ENCRYPTION_KEY: key,
    ...overrides,
  };

  return {
    get: vi.fn((name: string) => values[name]),
  } as unknown as ConfigService<AppEnv, true>;
}

function setup(overrides: { account?: TikTokAccountRecord | null } = {}) {
  const current = overrides.account === undefined ? account : overrides.account;
  const accounts = {
    findById: vi.fn().mockResolvedValue(current),
    updateTokens: vi.fn().mockResolvedValue(current),
    deactivate: vi.fn().mockResolvedValue(undefined),
  } as unknown as TikTokAccountsRepository;
  const redis = {
    setNx: vi.fn().mockResolvedValue(true),
    compareAndDelete: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
  const service = new TikTokTokenService(env(), accounts, redis);
  const api = {
    refresh: vi.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 7_200,
      refreshExpiresIn: 15_552_000,
      openId: 'open-1',
      scope: 'user.info.basic,video.publish',
      tokenType: 'Bearer',
    }),
  };

  vi.spyOn(service, 'createApi').mockReturnValue(api as never);

  return { service, accounts, redis, api };
}

describe('TikTokTokenService', () => {
  it('returns a fresh access token without refreshing', async () => {
    const { service, accounts, api } = setup();

    await expect(service.accessTokenFor(account)).resolves.toBe('old-access');
    expect(api.refresh).not.toHaveBeenCalled();
    expect(accounts.updateTokens).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token and stores rotated tokens encrypted', async () => {
    const expired = {
      ...account,
      accessExpiresAt: new Date(Date.now() + 30_000),
    };
    const { service, accounts, api } = setup({ account: expired });

    await expect(service.accessTokenFor(expired)).resolves.toBe('new-access');
    expect(api.refresh).toHaveBeenCalledWith('old-refresh');

    const stored = vi.mocked(accounts.updateTokens).mock.calls[0]?.[1];

    expect(stored).toBeDefined();
    expect(new TokenCipher(key).decrypt(stored!.accessTokenEncrypted)).toBe(
      'new-access',
    );
    expect(new TokenCipher(key).decrypt(stored!.refreshTokenEncrypted)).toBe(
      'new-refresh',
    );
  });

  it('forces a refresh even when the token is fresh', async () => {
    const { service, api } = setup();

    await expect(service.accessTokenFor(account, true)).resolves.toBe(
      'new-access',
    );
    expect(api.refresh).toHaveBeenCalled();
  });

  it('maps an invalid refresh token to reconnect', async () => {
    const expired = {
      ...account,
      accessExpiresAt: new Date(Date.now() + 30_000),
    };
    const { service, api } = setup({ account: expired });

    api.refresh.mockRejectedValue(
      new TikTokApiError('invalid_grant', {
        code: 'invalid_grant',
        kind: 'terminal',
      }),
    );

    await expect(service.accessTokenFor(expired)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('releases the refresh lock with compare-and-delete', async () => {
    const expired = {
      ...account,
      accessExpiresAt: new Date(Date.now() + 30_000),
    };
    const { service, redis } = setup({ account: expired });

    await service.accessTokenFor(expired);

    expect(redis.compareAndDelete).toHaveBeenCalledWith(
      `tiktok:refresh:${account.id}`,
      expect.any(String),
    );
  });

  it('reports a deleted account after acquiring the lock', async () => {
    const expired = {
      ...account,
      accessExpiresAt: new Date(Date.now() + 30_000),
    };
    const { service, accounts } = setup({ account: expired });

    vi.mocked(accounts.findById).mockResolvedValue(null);

    await expect(service.accessTokenFor(expired)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('waits for another process that is already refreshing', async () => {
    const expired = {
      ...account,
      accessExpiresAt: new Date(Date.now() + 30_000),
    };
    const { service, redis, accounts } = setup({ account: expired });

    vi.mocked(redis.setNx).mockResolvedValue(false);
    vi.mocked(accounts.findById).mockResolvedValue(account);

    await expect(service.accessTokenFor(expired)).resolves.toBe('old-access');
  });

  it('reports missing TikTok configuration', () => {
    const service = new TikTokTokenService(
      env({ TIKTOK_CLIENT_KEY: undefined }),
      {} as TikTokAccountsRepository,
      {} as RedisService,
    );

    expect(() => service.settings()).toThrow(ServiceUnavailableException);
    expect(() => service.settings()).toThrow(/TIKTOK_CLIENT_KEY/);
  });
});
