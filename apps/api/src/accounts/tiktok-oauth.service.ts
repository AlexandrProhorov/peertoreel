import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TIKTOK_SCOPES,
  type TikTokAccount,
  type TikTokAuthorizeResponse,
  type TikTokCallbackQuery,
  type TikTokCreatorInfo,
} from '@kadence/contracts';
import { randomBytes } from 'node:crypto';
import { TikTokApiError } from '@kadence/tiktok';
import type { AppEnv } from '../config/env.js';
import { RedisService } from '../redis/redis.service.js';
import {
  TikTokAccountsRepository,
  type TikTokAccountRecord,
} from './tiktok-accounts.repository.js';
import { TikTokTokenService } from './tiktok-token.service.js';

const OAUTH_STATE_TTL_SECONDS = 600;

function toAccount(record: TikTokAccountRecord): TikTokAccount {
  return {
    id: record.id,
    openId: record.openId,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    scope: record.scope,
    accessExpiresAt: record.accessExpiresAt.toISOString(),
    refreshExpiresAt: record.refreshExpiresAt.toISOString(),
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly accounts: TikTokAccountsRepository,
    private readonly tokens: TikTokTokenService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Creates a one-time state bound to the current Kadence user and returns the
   * TikTok consent URL. The state lives in Redis, not in a cookie, because the
   * callback arrives as a top-level redirect from tiktok.com.
   */
  async authorize(userId: string): Promise<TikTokAuthorizeResponse> {
    const api = this.tokens.api();
    const state = randomBytes(24).toString('base64url');

    try {
      await this.redis.set(
        `tiktok:oauth:${state}`,
        userId,
        OAUTH_STATE_TTL_SECONDS,
      );
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'TikTok OAuth state store failed');
      throw new ServiceUnavailableException(
        'Redis недоступен: не удалось начать подключение TikTok',
      );
    }

    return { url: api.authorizeUrl(state, TIKTOK_SCOPES) };
  }

  /**
   * Exchanges the code, reads the display name and stores encrypted tokens.
   * Returns the web URL to redirect to; errors are reduced to a flag so the
   * browser never sees token or OAuth payload details.
   */
  async callback(query: TikTokCallbackQuery): Promise<string> {
    const webBase = this.config
      .get('WEB_APP_URL', { infer: true })
      .replace(/\/$/, '');

    if (query.error || !query.code || !query.state) {
      return `${webBase}/accounts?tiktok=error`;
    }

    let userId: string | null = null;

    try {
      userId = await this.redis.getdel(`tiktok:oauth:${query.state}`);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'TikTok OAuth state lookup failed');
      return `${webBase}/accounts?tiktok=error`;
    }

    if (!userId) {
      return `${webBase}/accounts?tiktok=error`;
    }

    try {
      const api = this.tokens.api();
      const tokens = await api.exchangeCode(query.code);
      const user = await api.getUserInfo(tokens.accessToken);

      await this.accounts.upsert(userId, {
        openId: tokens.openId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        ...this.tokens.encryptTokens(tokens),
      });

      return `${webBase}/accounts?tiktok=connected`;
    } catch (error: unknown) {
      // TikTok error messages are safe, but the OAuth payload and tokens are
      // never logged.
      this.logger.warn(
        {
          err:
            error instanceof TikTokApiError
              ? { code: error.code, status: error.httpStatus }
              : error,
        },
        'TikTok OAuth callback failed',
      );

      return `${webBase}/accounts?tiktok=error`;
    }
  }

  async list(userId: string): Promise<TikTokAccount[]> {
    const records = await this.accounts.listByUser(userId);

    return records.map(toAccount);
  }

  async disconnect(userId: string, accountId: string): Promise<void> {
    const account = await this.requireOwned(userId, accountId);

    try {
      const api = this.tokens.api();
      const accessToken = await this.tokens.accessTokenFor(account);
      await api.revoke(accessToken);
    } catch (error: unknown) {
      // Local disconnect must work even when TikTok or its config is
      // unreachable; the token still expires on TikTok's side.
      this.logger.warn(
        { accountId },
        `TikTok revoke failed during disconnect: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    await this.accounts.delete(account.id);
  }

  async creatorInfo(
    userId: string,
    accountId: string,
  ): Promise<TikTokCreatorInfo> {
    const account = await this.requireOwned(userId, accountId);
    const api = this.tokens.api();
    let accessToken = await this.tokens.accessTokenFor(account);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await api.queryCreatorInfo(accessToken);
      } catch (error: unknown) {
        if (
          attempt === 0 &&
          error instanceof TikTokApiError &&
          error.kind === 'token'
        ) {
          accessToken = await this.tokens.accessTokenFor(account, true);
          continue;
        }

        this.throwMapped(error);
      }
    }

    throw new ConflictException('TikTok отклонил запрос: повторите позже');
  }

  private throwMapped(error: unknown): never {
    if (error instanceof TikTokApiError) {
      if (error.kind === 'retryable') {
        throw new BadGatewayException(
          'TikTok временно недоступен: попробуйте ещё раз',
        );
      }

      throw new ConflictException(`TikTok отклонил запрос: ${error.code}`);
    }

    throw error;
  }

  private async requireOwned(
    userId: string,
    accountId: string,
  ): Promise<TikTokAccountRecord> {
    const account = await this.accounts.findById(accountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Аккаунт TikTok не найден');
    }

    return account;
  }
}
