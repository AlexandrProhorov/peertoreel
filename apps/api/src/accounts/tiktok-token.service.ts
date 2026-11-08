import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.js';
import { TikTokApi, TokenCipher, TikTokApiError, type TikTokTokenSet } from '@kadence/tiktok';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';
import {
  TikTokAccountsRepository,
  type TikTokAccountRecord,
  type TikTokTokenColumns,
} from './tiktok-accounts.repository.js';

/** Refresh slightly before TikTok does, so a request never races the expiry. */
const REFRESH_WINDOW_MS = 120_000;
/** Must exceed the HTTP refresh timeout (30 s) with a wide margin. */
const REFRESH_LOCK_SECONDS = 120;
const REFRESH_WAIT_ATTEMPTS = 60;
const REFRESH_WAIT_MS = 500;

export interface TikTokSettings {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class TikTokTokenService {
  private readonly logger = new Logger(TikTokTokenService.name);
  private cipher: TokenCipher | null = null;
  private apiClient: TikTokApi | null = null;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly accounts: TikTokAccountsRepository,
    private readonly redis: RedisService,
  ) {}

  /** Throws a clear 503 when the TikTok app is not configured yet. */
  settings(): TikTokSettings {
    const clientKey = this.config.get('TIKTOK_CLIENT_KEY', { infer: true });
    const clientSecret = this.config.get('TIKTOK_CLIENT_SECRET', {
      infer: true,
    });
    const redirectUri = this.config.get('TIKTOK_REDIRECT_URI', { infer: true });
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', {
      infer: true,
    });

    const missing = [
      !clientKey ? 'TIKTOK_CLIENT_KEY' : null,
      !clientSecret ? 'TIKTOK_CLIENT_SECRET' : null,
      !redirectUri ? 'TIKTOK_REDIRECT_URI' : null,
      !encryptionKey ? 'TOKEN_ENCRYPTION_KEY' : null,
    ].filter((name): name is string => name !== null);

    if (!clientKey || !clientSecret || !redirectUri || !encryptionKey) {
      throw new ServiceUnavailableException(
        `TikTok не настроен: добавьте в .env ${missing.join(', ')}`,
      );
    }

    return { clientKey, clientSecret, redirectUri };
  }

  /** Test seam: tests override this to return a fake HTTP client. */
  createApi(settings: TikTokSettings): TikTokApi {
    return new TikTokApi({
      clientKey: settings.clientKey,
      clientSecret: settings.clientSecret,
      redirectUri: settings.redirectUri,
    });
  }

  api(): TikTokApi {
    if (this.apiClient) {
      return this.apiClient;
    }

    const settings = this.settings();

    this.apiClient = this.createApi(settings);
    return this.apiClient;
  }

  encryptTokens(
    tokens: TikTokTokenSet,
    now = new Date(),
  ): TikTokTokenColumns {
    const cipher = this.cipherInstance();

    return {
      accessTokenEncrypted: cipher.encrypt(tokens.accessToken),
      refreshTokenEncrypted: cipher.encrypt(tokens.refreshToken),
      accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
      refreshExpiresAt: new Date(
        now.getTime() + tokens.refreshExpiresIn * 1000,
      ),
      scope: tokens.scope,
    };
  }

  decryptAccess(account: TikTokAccountRecord): string {
    return this.cipherInstance().decrypt(account.accessTokenEncrypted);
  }

  decryptRefresh(account: TikTokAccountRecord): string {
    return this.cipherInstance().decrypt(account.refreshTokenEncrypted);
  }

  /**
   * Returns a usable access token, refreshing under a Redis lock when the
   * current one is about to expire. Refresh tokens rotate: every successful
   * refresh replaces both stored tokens.
   */
  async accessTokenFor(
    account: TikTokAccountRecord,
    forceRefresh = false,
  ): Promise<string> {
    if (!forceRefresh && this.isFresh(account)) {
      return this.decryptAccess(account);
    }

    const lockKey = `tiktok:refresh:${account.id}`;
    const lockValue = randomUUID();

    let acquired = false;

    try {
      acquired = await this.redis.setNx(
        lockKey,
        lockValue,
        REFRESH_LOCK_SECONDS,
      );
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'TikTok refresh lock unavailable');
      throw new ServiceUnavailableException(
        'Redis недоступен: не удалось заблокировать обновление токена TikTok',
      );
    }

    if (!acquired) {
      // Another process is refreshing the same account. Wait for it and use
      // the rotated token instead of rotating the refresh token twice.
      for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
        await delay(REFRESH_WAIT_MS);
        const current = await this.accounts.findById(account.id);

        if (!current) {
          throw new ConflictException('Аккаунт TikTok больше не подключён');
        }

        if (this.isFresh(current)) {
          return this.decryptAccess(current);
        }
      }

      throw new ServiceUnavailableException(
        'Не удалось обновить токен TikTok: попробуйте ещё раз',
      );
    }

    try {
      const current = await this.accounts.findById(account.id);

      if (!current) {
        throw new ConflictException('Аккаунт TikTok больше не подключён');
      }

      if (!forceRefresh && this.isFresh(current)) {
        return this.decryptAccess(current);
      }

      return await this.refresh(current);
    } finally {
      try {
        await this.redis.compareAndDelete(lockKey, lockValue);
      } catch (error: unknown) {
        this.logger.warn({ err: error }, 'Could not release TikTok refresh lock');
      }
    }
  }

  private async refresh(account: TikTokAccountRecord): Promise<string> {
    const api = this.api();

    try {
      const tokens = await api.refresh(this.decryptRefresh(account));
      const stored = await this.accounts.updateTokens(
        account.id,
        this.encryptTokens(tokens),
      );

      if (!stored) {
        throw new ConflictException('Аккаунт TikTok больше не подключён');
      }

      return tokens.accessToken;
    } catch (error: unknown) {
      if (
        error instanceof TikTokApiError &&
        (error.kind === 'token' || error.kind === 'terminal')
      ) {
        await this.accounts.deactivate(account.id).catch((deactivateError: unknown) => {
          this.logger.warn(
            { err: deactivateError, accountId: account.id },
            'Could not deactivate TikTok account',
          );
        });
      }

      if (error instanceof TikTokApiError && error.kind === 'token') {
        throw new ConflictException(
          'TikTok отозвал доступ: подключите аккаунт заново',
        );
      }

      if (error instanceof TikTokApiError && error.kind === 'retryable') {
        throw new BadGatewayException(
          'TikTok временно недоступен: попробуйте ещё раз',
        );
      }

      if (error instanceof ConflictException) {
        throw error;
      }

      // Never include the token or the full OAuth payload in the message.
      this.logger.error({ err: error }, 'TikTok token refresh failed');
      throw new ConflictException(
        'Не удалось обновить доступ TikTok: подключите аккаунт заново',
      );
    }
  }

  private isFresh(account: TikTokAccountRecord): boolean {
    return account.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS;
  }

  private cipherInstance(): TokenCipher {
    if (this.cipher) {
      return this.cipher;
    }

    const key = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });

    if (!key) {
      throw new ServiceUnavailableException(
        'TikTok не настроен: добавьте TOKEN_ENCRYPTION_KEY в .env',
      );
    }

    this.cipher = new TokenCipher(key);
    return this.cipher;
  }
}
