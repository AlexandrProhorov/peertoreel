import { Injectable } from '@nestjs/common';
import { MANUAL_PUBLISH_REASON, type RunStage, type RunState } from '@peertoreel/contracts';
import { and, desc, eq, isNotNull, lt, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { publishCards, runEvents, runs } from '@peertoreel/db';
import {
  publishCardColumns,
  type PublishCardRecord,
} from '../publish/publish-cards.repository.js';

export interface RunRecord {
  id: string;
  createdBy: string;
  topic: string;
  state: RunState;
  currentStage: RunStage | null;
  failedStage: RunStage | null;
  failureReason: string | null;
  resumeState: RunState | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunEventRecord {
  id: string;
  fromState: RunState | null;
  toState: RunState;
  stage: RunStage | null;
  reason: string | null;
  createdAt: Date;
}

export interface NewRunEvent {
  runId: string;
  fromState: RunState | null;
  toState: RunState;
  stage: RunStage | null;
  reason: string | null;
}

export interface RunPatch {
  state: RunState;
  currentStage: RunStage | null;
  failedStage: RunStage | null;
  failureReason: string | null;
  resumeState: RunState | null;
  updatedAt: Date;
}

/**
 * Computed by `RunsService` before the transition transaction (the script
 * title lives in S3). `ON CONFLICT DO NOTHING` keeps later user edits.
 */
export interface DefaultPublishCard {
  title: string;
  hashtags: string[];
}

export const runColumns = {
  id: runs.id,
  createdBy: runs.createdBy,
  topic: runs.topic,
  state: runs.state,
  currentStage: runs.currentStage,
  failedStage: runs.failedStage,
  failureReason: runs.failureReason,
  resumeState: runs.resumeState,
  createdAt: runs.createdAt,
  updatedAt: runs.updatedAt,
};

@Injectable()
export class RunsRepository {
  constructor(private readonly database: DatabaseService) {}

  async createWithEvent(input: {
    createdBy: string;
    topic: string;
    stage: RunStage;
  }): Promise<RunRecord> {
    return this.database.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(runs)
        .values({
          createdBy: input.createdBy,
          topic: input.topic,
          state: 'DRAFT',
          currentStage: input.stage,
        })
        .returning(runColumns);

      if (!run) {
        throw new Error('Failed to insert run');
      }

      await tx.insert(runEvents).values({
        runId: run.id,
        fromState: null,
        toState: 'DRAFT',
        stage: input.stage,
        reason: null,
      });

      return run;
    });
  }

  async findById(id: string): Promise<RunRecord | null> {
    const [run] = await this.database.db
      .select(runColumns)
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);

    return run ?? null;
  }

  async list(limit: number): Promise<RunRecord[]> {
    return this.database.db
      .select(runColumns)
      .from(runs)
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async listEvents(runId: string): Promise<RunEventRecord[]> {
    return this.database.db
      .select({
        id: runEvents.id,
        fromState: runEvents.fromState,
        toState: runEvents.toState,
        stage: runEvents.stage,
        reason: runEvents.reason,
        createdAt: runEvents.createdAt,
      })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(runEvents.createdAt);
  }

  async applyTransition(
    runId: string,
    patch: RunPatch,
    event: Omit<NewRunEvent, 'runId'>,
    options: {
      defaultCard?: DefaultPublishCard;
      resetExportBefore?: Date;
    } = {},
  ): Promise<RunRecord | null> {
    return this.database.db.transaction(async (tx) => {
      const expectedState = event.fromState
        ? and(eq(runs.id, runId), eq(runs.state, event.fromState))
        : eq(runs.id, runId);

      const [run] = await tx
        .update(runs)
        .set(patch)
        .where(expectedState)
        .returning(runColumns);

      if (!run) {
        return null;
      }

      await tx.insert(runEvents).values({ runId, ...event });

      if (options.defaultCard) {
        // A new draft invalidates the previous export: the card must not claim
        // that this video was already downloaded.
        if (options.resetExportBefore) {
          await tx
            .update(publishCards)
            .set({ state: 'draft', exportedAt: null, updatedAt: new Date() })
            .where(
              and(
                eq(publishCards.runId, runId),
                ne(publishCards.state, 'published'),
                isNotNull(publishCards.exportedAt),
                lt(publishCards.exportedAt, options.resetExportBefore),
              ),
            );
        }

        await tx
          .insert(publishCards)
          .values({
            runId,
            title: options.defaultCard.title,
            hashtags: options.defaultCard.hashtags,
            isAigc: true,
            state: 'draft',
          })
          .onConflictDoNothing({ target: publishCards.runId });
      }

      return run;
    });
  }

  /**
   * Manual export has no publisher job: the run goes through PUBLISHING to
   * PUBLISHED in one transaction, with an audit row per edge, and the card
   * becomes `published` (ADR-0010). Returns null if another request already
   * moved the run out of SCHEDULED.
   */
  async applyManualPublish(
    runId: string,
    at: Date,
  ): Promise<{ run: RunRecord; card: PublishCardRecord } | null> {
    return this.database.db.transaction(async (tx) => {
      const [publishing] = await tx
        .update(runs)
        .set({ state: 'PUBLISHING', currentStage: 'publish', updatedAt: at })
        .where(and(eq(runs.id, runId), eq(runs.state, 'SCHEDULED')))
        .returning(runColumns);

      if (!publishing) {
        return null;
      }

      // Two events in one transaction would share `now()`; 1 ms keeps the
      // history viewer's `ORDER BY created_at` deterministic.
      await tx.insert(runEvents).values({
        runId,
        fromState: 'SCHEDULED',
        toState: 'PUBLISHING',
        stage: 'publish',
        reason: MANUAL_PUBLISH_REASON,
        createdAt: at,
      });

      const [published] = await tx
        .update(runs)
        .set({
          state: 'PUBLISHED',
          currentStage: 'publish',
          failedStage: null,
          failureReason: null,
          resumeState: null,
          updatedAt: at,
        })
        .where(eq(runs.id, runId))
        .returning(runColumns);

      if (!published) {
        throw new Error(`Run ${runId} disappeared during manual publish`);
      }

      await tx.insert(runEvents).values({
        runId,
        fromState: 'PUBLISHING',
        toState: 'PUBLISHED',
        stage: 'publish',
        reason: MANUAL_PUBLISH_REASON,
        createdAt: new Date(at.getTime() + 1),
      });

      const [card] = await tx
        .update(publishCards)
        .set({
          state: 'published',
          publishedAt: at,
          failReason: null,
          updatedAt: at,
        })
        .where(eq(publishCards.runId, runId))
        .returning(publishCardColumns);

      if (!card) {
        throw new Error(`Publish card for run ${runId} disappeared`);
      }

      return { run: published, card };
    });
  }
}
