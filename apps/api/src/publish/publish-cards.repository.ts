import { Injectable } from '@nestjs/common';
import { publishCards } from '@peertoreel/db';
import type {
  PublishCardState,
  PublishPrivacyLevel,
} from '@peertoreel/contracts';
import { and, eq, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';

export interface PublishCardRecord {
  id: string;
  runId: string;
  title: string;
  hashtags: string[];
  privacyLevel: PublishPrivacyLevel | null;
  isAigc: boolean;
  scheduledAt: Date | null;
  exportedAt: Date | null;
  publishedAt: Date | null;
  state: PublishCardState;
  publishId: string | null;
  postId: string | null;
  failReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shared with `RunsRepository`, which creates/updates the card in a run transaction. */
export const publishCardColumns = {
  id: publishCards.id,
  runId: publishCards.runId,
  title: publishCards.title,
  hashtags: publishCards.hashtags,
  privacyLevel: publishCards.privacyLevel,
  isAigc: publishCards.isAigc,
  scheduledAt: publishCards.scheduledAt,
  exportedAt: publishCards.exportedAt,
  publishedAt: publishCards.publishedAt,
  state: publishCards.state,
  publishId: publishCards.publishId,
  postId: publishCards.postId,
  failReason: publishCards.failReason,
  createdAt: publishCards.createdAt,
  updatedAt: publishCards.updatedAt,
};

export interface PublishCardInput {
  title: string;
  hashtags: string[];
  privacyLevel: PublishPrivacyLevel | null;
  scheduledAt: Date | null;
}

@Injectable()
export class PublishCardsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByRun(runId: string): Promise<PublishCardRecord | null> {
    const [row] = await this.database.db
      .select(publishCardColumns)
      .from(publishCards)
      .where(eq(publishCards.runId, runId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Updates the human-editable fields. `is_aigc`, `state` and TikTok ids are
   * never written from the client request.
   */
  async upsert(
    runId: string,
    input: PublishCardInput,
  ): Promise<PublishCardRecord> {
    const now = new Date();
    const [row] = await this.database.db
      .insert(publishCards)
      .values({
        runId,
        title: input.title,
        hashtags: input.hashtags,
        privacyLevel: input.privacyLevel,
        scheduledAt: input.scheduledAt,
        isAigc: true,
        state: 'draft',
      })
      .onConflictDoUpdate({
        target: publishCards.runId,
        set: {
          title: input.title,
          hashtags: input.hashtags,
          privacyLevel: input.privacyLevel,
          scheduledAt: input.scheduledAt,
          updatedAt: now,
        },
      })
      .returning(publishCardColumns);

    if (!row) {
      throw new Error(`Failed to upsert publish card for run ${runId}`);
    }

    return row;
  }

  /**
   * Keeps the first export timestamp: re-downloading the draft does not move
   * the moment the video was first exported. The predicate prevents a late
   * download from downgrading a card that a manual publish already closed.
   */
  async markExported(
    runId: string,
    exportedAt: Date,
    updatedAt: Date,
  ): Promise<PublishCardRecord | null> {
    const [row] = await this.database.db
      .update(publishCards)
      .set({ state: 'exported', exportedAt, updatedAt })
      .where(
        and(
          eq(publishCards.runId, runId),
          ne(publishCards.state, 'published'),
        ),
      )
      .returning(publishCardColumns);

    return row ?? this.findByRun(runId);
  }
}
