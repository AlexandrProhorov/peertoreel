import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TikTokApiError } from '@peertoreel/tiktok';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env.js';
import type { RedisService } from '../redis/redis.service.js';
import type {
  TikTokAccountRecord,
  TikTokAccountsRepository,
} from './tiktok-accounts.repository.js';
import { TikTokOAuthService } from './tiktok-oauth.service.js';
import type { TikTokTokenService } from './tiktok-token.service.js';

const now = new Date('2026-11-07T10:00:00.000Z');
const userId = '22222222-2222-4222-8222-222222222222';

const account: TikTokAccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  userId,
  openId: 'open-1',
  displayName: 'Peer to Reel',
  avatarUrl: 'https://cdn.test/avatar.jpg',
  accessTokenEncrypted: 'enc-access',
  refreshTokenEncrypted: 'enc-refresh',
  accessExpiresAt: now,
  refreshExpiresAt: now,
  scope: 'user.info.basic,video.publish',
  isActive: true,
  lastRefreshedAt: null,
  createdAt: now,
  updatedAt: now,
};

const tokenColumns = {
  accessTokenEncrypted: 'enc-access',
  refreshTokenEncrypted: 'enc-refresh',
  accessExpiresAt: now,
  refreshExpiresAt: now,
  scope: 'user.info.basic,video.publish',
};

function setup() {
  const api = {
    authorizeUrl: vi
      .fn()
      .mockReturnValue('https://www.tiktok.com/v2/auth/authorize/?state=s'),
    exchangeCode: vi.fn().mockResolvedValue({
      accessToken: 'act',
      refreshToken: 'rft',
      expiresIn: 7_200,
      refreshExpiresIn: 15_552_000,
      openId: 'open-1',
      scope: 'user.info.basic,video.publish',
      tokenType: 'Bearer',
    }),
    getUserInfo: vi.fn().mockResolvedValue({
      openId: 'open-1',
      unionId: null,
      displayName: 'Peer to Reel',
      avatarUrl: 'https://cdn.test/avatar.jpg',
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
    queryCreatorInfo: vi.fn().mockResolvedValue({
      username: 'peertoreel',
      nickname: 'Peer to Reel',
      avatarUrl: null,
      privacyLevelOptions: ['SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: false,
      maxVideoPostDurationSec: 300,
    }),
  };

  const tokens = {
    api: vi.fn().mockReturnValue(api),
    encryptTokens: vi.fn().mockReturnValue(tokenColumns),
    accessTokenFor: vi.fn().mockResolvedValue('act'),
  } as unknown as TikTokTokenService;

  const accounts = {
    listByUser: vi.fn().mockResolvedValue([account]),
    findById: vi.fn().mockResolvedValue(account),
    upsert: vi.fn().mockResolvedValue(account),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as TikTokAccountsRepository;

  const redis = {
    set: vi.fn().mockResolvedValue(undefined),
    getdel: vi.fn().mockResolvedValue(userId),
  } as unknown as RedisService;

  const config = {
    get: vi.fn((name: string) =>
      name === 'WEB_APP_URL' ? 'http://localhost:4200' : undefined,
    ),
  } as unknown as ConfigService<AppEnv, true>;

  return {
    service: new TikTokOAuthService(config, accounts, tokens, redis),
    api,
    tokens,
    accounts,
    redis,
  };
}

describe('TikTokOAuthService', () => {
  it('creates a state-bound authorization URL', async () => {
    const { service, api, redis } = setup();

    const result = await service.authorize(userId);

    expect(result.url).toContain('tiktok.com');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^tiktok:oauth:/),
      userId,
      600,
    );
    expect(api.authorizeUrl).toHaveBeenCalledWith(
      expect.any(String),
      ['user.info.basic', 'video.publish'],
    );
  });

  it('exchanges the code and stores the account', async () => {
    const { service, api, accounts, redis } = setup();

    const url = await service.callback({ code: 'code-1', state: 'state-1' });

    expect(redis.getdel).toHaveBeenCalledWith('tiktok:oauth:state-1');
    expect(api.exchangeCode).toHaveBeenCalledWith('code-1');
    expect(accounts.upsert).toHaveBeenCalledWith(userId, {
      openId: 'open-1',
      displayName: 'Peer to Reel',
      avatarUrl: 'https://cdn.test/avatar.jpg',
      ...tokenColumns,
    });
    expect(url).toBe('http://localhost:4200/accounts?tiktok=connected');
  });

  it('redirects with an error when the state is unknown or TikTok denies access', async () => {
    const { service, redis, api } = setup();

    vi.mocked(redis.getdel).mockResolvedValue(null);

    await expect(
      service.callback({ code: 'code-1', state: 'bad' }),
    ).resolves.toBe('http://localhost:4200/accounts?tiktok=error');
    expect(api.exchangeCode).not.toHaveBeenCalled();

    await expect(
      service.callback({ error: 'access_denied' }),
    ).resolves.toBe('http://localhost:4200/accounts?tiktok=error');
  });

  it('redirects with an error when the token exchange fails', async () => {
    const { service, api, accounts } = setup();

    api.exchangeCode.mockRejectedValue(new Error('invalid code'));

    await expect(
      service.callback({ code: 'code-1', state: 'state-1' }),
    ).resolves.toBe('http://localhost:4200/accounts?tiktok=error');
    expect(accounts.upsert).not.toHaveBeenCalled();
  });

  it('maps accounts without exposing encrypted tokens', async () => {
    const { service } = setup();

    const accounts = await service.list(userId);

    expect(accounts).toEqual([
      {
        id: account.id,
        openId: 'open-1',
        displayName: 'Peer to Reel',
        avatarUrl: 'https://cdn.test/avatar.jpg',
        scope: 'user.info.basic,video.publish',
        accessExpiresAt: now.toISOString(),
        refreshExpiresAt: now.toISOString(),
        isActive: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
    expect(JSON.stringify(accounts)).not.toContain('enc-access');
  });

  it('reads creator info with a refreshed token', async () => {
    const { service, api, tokens } = setup();

    const info = await service.creatorInfo(userId, account.id);

    expect(tokens.accessTokenFor).toHaveBeenCalledWith(account);
    expect(api.queryCreatorInfo).toHaveBeenCalledWith('act');
    expect(info.privacyLevelOptions).toEqual(['SELF_ONLY']);
  });

  it('revokes and deletes a connected account', async () => {
    const { service, api, accounts } = setup();

    await service.disconnect(userId, account.id);

    expect(api.revoke).toHaveBeenCalledWith('act');
    expect(accounts.delete).toHaveBeenCalledWith(account.id);
  });

  it('deletes the local account even when revoke fails', async () => {
    const { service, api, accounts } = setup();

    api.revoke.mockRejectedValue(new Error('network'));

    await service.disconnect(userId, account.id);

    expect(accounts.delete).toHaveBeenCalledWith(account.id);
  });

  it('refreshes once when TikTok invalidates the access token', async () => {
    const { service, api, tokens } = setup();

    api.queryCreatorInfo
      .mockRejectedValueOnce(
        new TikTokApiError('expired', {
          code: 'access_token_invalid',
          httpStatus: 401,
          kind: 'token',
        }),
      )
      .mockResolvedValueOnce({
        username: 'peertoreel',
        nickname: 'Peer to Reel',
        avatarUrl: null,
        privacyLevelOptions: ['SELF_ONLY'],
        commentDisabled: false,
        duetDisabled: false,
        stitchDisabled: false,
        maxVideoPostDurationSec: 300,
      });

    await expect(service.creatorInfo(userId, account.id)).resolves.toMatchObject(
      { username: 'peertoreel' },
    );
    expect(tokens.accessTokenFor).toHaveBeenNthCalledWith(2, account, true);
  });

  it('does not touch an account owned by another user', async () => {
    const { service } = setup();

    await expect(
      service.creatorInfo('33333333-3333-4333-8333-333333333333', account.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
