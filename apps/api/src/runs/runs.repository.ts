import { Injectable } from '@nestjs/common';
import type { RunStage, RunState } from '@kadence/contracts';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { runEvents, runs } from '../db/schema.js';

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

const runColumns = {
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
  ): Promise<RunRecord> {
    return this.database.db.transaction(async (tx) => {
      const [run] = await tx
        .update(runs)
        .set(patch)
        .where(eq(runs.id, runId))
        .returning(runColumns);

      if (!run) {
        throw new Error(`Run ${runId} disappeared during transition`);
      }

      await tx.insert(runEvents).values({ runId, ...event });

      return run;
    });
  }
}
