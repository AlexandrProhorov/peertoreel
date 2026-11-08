import { tiktokAccounts, type Database } from '@peertoreel/db';
import { TikTokApi, TokenCipher } from '@peertoreel/tiktok';
import { and, desc, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const REFRESH_WINDOW_MS = 120_000;
const REFRESH_LOCK_SECONDS = 120;
const REFRESH_WAIT_ATTEMPTS = 60;
const REFRESH_WAIT_MS = 500;

export type TikTokAccountRow = typeof tiktokAccounts.$inferSelect;

export interface TikTokRuntime {
  api: TikTokApi;
  cipher: TokenCipher;
  redis: Redis;
}

/**
 * The MVP uses the most recently connected active account of the run owner.
 * Account selection per card is a later slice.
 */
export async function loadActiveAccount(
  db: Database,
  userId: string,
  accountId?: string,
): Promise<TikTokAccountRow> {
  const [account] = accountId
    ? await db
        .select()
        .from(tiktokAccounts)
        .where(eq(tiktokAccounts.id, accountId))
        .limit(1)
    : await db
        .select()
        .from(tiktokAccounts)
        .where(
          and(
            eq(tiktokAccounts.userId, userId),
            eq(tiktokAccounts.isActive, true),
          ),
        )
        .orderBy(desc(tiktokAccounts.updatedAt))
        .limit(1);

  if (!account) {
    throw new Error(
      'No connected TikTok account. Open /accounts and connect a private test account.',
    );
  }

  if (account.userId !== userId) {
    throw new Error('The selected TikTok account belongs to another user');
  }

  if (!account.isActive) {
    throw new Error('The selected TikTok account is inactive: reconnect it');
  }

  return account;
}

/**
 * Refreshes the access token under the same Redis lock as the API. Refresh
 * tokens rotate; two concurrent refreshes would invalidate each other.
 */
export async function accessTokenForAccount(
  db: Database,
  runtime: TikTokRuntime,
  account: TikTokAccountRow,
  force = false,
): Promise<string> {
  if (
    !force &&
    account.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
  ) {
    return runtime.cipher.decrypt(account.accessTokenEncrypted);
  }

  const lockKey = `tiktok:refresh:${account.id}`;
  const lockValue = randomUUID();
  const acquired = await runtime.redis.set(
    lockKey,
    lockValue,
    'EX',
    REFRESH_LOCK_SECONDS,
    'NX',
  );

  if (acquired !== 'OK') {
    for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
      await sleep(REFRESH_WAIT_MS);
      const [current] = await db
        .select()
        .from(tiktokAccounts)
        .where(eq(tiktokAccounts.id, account.id))
        .limit(1);

      if (
        current &&
        current.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
      ) {
        return runtime.cipher.decrypt(current.accessTokenEncrypted);
      }
    }

    throw new Error('Could not acquire the TikTok token refresh lock');
  }

  try {
    const [current] = await db
      .select()
      .from(tiktokAccounts)
      .where(eq(tiktokAccounts.id, account.id))
      .limit(1);

    if (!current) {
      throw new Error('TikTok account disappeared');
    }

    if (
      !force &&
      current.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
    ) {
      return runtime.cipher.decrypt(current.accessTokenEncrypted);
    }

    const refreshed = await runtime.api.refresh(
      runtime.cipher.decrypt(current.refreshTokenEncrypted),
    );
    const now = new Date();

    await db
      .update(tiktokAccounts)
      .set({
        accessTokenEncrypted: runtime.cipher.encrypt(refreshed.accessToken),
        refreshTokenEncrypted: runtime.cipher.encrypt(refreshed.refreshToken),
        accessExpiresAt: new Date(now.getTime() + refreshed.expiresIn * 1000),
        refreshExpiresAt: new Date(
          now.getTime() + refreshed.refreshExpiresIn * 1000,
        ),
        scope: refreshed.scope,
        lastRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(tiktokAccounts.id, account.id));

    return refreshed.accessToken;
  } finally {
    await runtime.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      lockValue,
    );
  }
}
