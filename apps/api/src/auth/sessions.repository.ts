import { Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { sessions, users } from '@kadence/db';
import type { UserRecord } from './users.repository.js';

export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRecord {
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  user: UserRecord;
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: NewSession): Promise<void> {
    await this.database.db
      .insert(sessions)
      .values({ ...input, lastSeenAt: new Date() });
  }

  async findValid(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.database.db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        lastSeenAt: sessions.lastSeenAt,
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        role: users.role,
        isActive: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        passwordHash: row.passwordHash,
        role: row.role,
        isActive: row.isActive,
      },
    };
  }

  async touch(sessionId: string, lastSeenAt: Date): Promise<void> {
    await this.database.db
      .update(sessions)
      .set({ lastSeenAt })
      .where(eq(sessions.id, sessionId));
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.database.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.database.db.delete(sessions).where(lt(sessions.expiresAt, now));
  }
}
