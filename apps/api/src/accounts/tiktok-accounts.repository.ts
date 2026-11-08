import { Injectable } from '@nestjs/common';
import { tiktokAccounts } from '@kadence/db';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';

export interface TikTokAccountRecord {
  id: string;
  userId: string;
  openId: string;
  displayName: string;
  avatarUrl: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  scope: string;
  isActive: boolean;
  lastRefreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TikTokTokenColumns {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  scope: string;
}

export interface UpsertTikTokAccountInput extends TikTokTokenColumns {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
}

export const tiktokAccountColumns = {
  id: tiktokAccounts.id,
  userId: tiktokAccounts.userId,
  openId: tiktokAccounts.openId,
  displayName: tiktokAccounts.displayName,
  avatarUrl: tiktokAccounts.avatarUrl,
  accessTokenEncrypted: tiktokAccounts.accessTokenEncrypted,
  refreshTokenEncrypted: tiktokAccounts.refreshTokenEncrypted,
  accessExpiresAt: tiktokAccounts.accessExpiresAt,
  refreshExpiresAt: tiktokAccounts.refreshExpiresAt,
  scope: tiktokAccounts.scope,
  isActive: tiktokAccounts.isActive,
  lastRefreshedAt: tiktokAccounts.lastRefreshedAt,
  createdAt: tiktokAccounts.createdAt,
  updatedAt: tiktokAccounts.updatedAt,
};

@Injectable()
export class TikTokAccountsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByUser(userId: string): Promise<TikTokAccountRecord[]> {
    return this.database.db
      .select(tiktokAccountColumns)
      .from(tiktokAccounts)
      .where(eq(tiktokAccounts.userId, userId))
      .orderBy(desc(tiktokAccounts.updatedAt));
  }

  async findById(id: string): Promise<TikTokAccountRecord | null> {
    const [row] = await this.database.db
      .select(tiktokAccountColumns)
      .from(tiktokAccounts)
      .where(eq(tiktokAccounts.id, id))
      .limit(1);

    return row ?? null;
  }

  async upsert(
    userId: string,
    input: UpsertTikTokAccountInput,
  ): Promise<TikTokAccountRecord> {
    const now = new Date();
    const [row] = await this.database.db
      .insert(tiktokAccounts)
      .values({
        userId,
        openId: input.openId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        accessExpiresAt: input.accessExpiresAt,
        refreshExpiresAt: input.refreshExpiresAt,
        scope: input.scope,
        isActive: true,
        lastRefreshedAt: null,
      })
      .onConflictDoUpdate({
        target: [tiktokAccounts.userId, tiktokAccounts.openId],
        set: {
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          accessExpiresAt: input.accessExpiresAt,
          refreshExpiresAt: input.refreshExpiresAt,
          scope: input.scope,
          isActive: true,
          lastRefreshedAt: null,
          updatedAt: now,
        },
      })
      .returning(tiktokAccountColumns);

    if (!row) {
      throw new Error('Failed to upsert TikTok account');
    }

    return row;
  }

  async updateTokens(
    id: string,
    tokens: TikTokTokenColumns,
  ): Promise<TikTokAccountRecord | null> {
    const now = new Date();
    const [row] = await this.database.db
      .update(tiktokAccounts)
      .set({
        accessTokenEncrypted: tokens.accessTokenEncrypted,
        refreshTokenEncrypted: tokens.refreshTokenEncrypted,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        scope: tokens.scope,
        lastRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(tiktokAccounts.id, id))
      .returning(tiktokAccountColumns);

    return row ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.database.db
      .delete(tiktokAccounts)
      .where(eq(tiktokAccounts.id, id));
  }

  /** Keeps the row for audit but prevents it from being picked for publishing. */
  async deactivate(id: string): Promise<void> {
    await this.database.db
      .update(tiktokAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(tiktokAccounts.id, id));
  }
}
