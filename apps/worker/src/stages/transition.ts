import { runEvents, runs, type Database } from '@peertoreel/db';
import {
  canTransition,
  stageForState,
  type RunMode,
  type RunStage,
  type RunState,
} from '@peertoreel/contracts';
import { eq } from 'drizzle-orm';

export class StageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageTransitionError';
  }
}

export interface RunSnapshot {
  id: string;
  createdBy: string;
  topic: string;
  mode: RunMode;
  state: RunState;
  currentStage: RunStage | null;
  resumeState: RunState | null;
  failedStage: RunStage | null;
  failureReason: string | null;
}

export async function loadRun(
  db: Database,
  runId: string,
): Promise<RunSnapshot> {
  const [run] = await db
    .select({
      id: runs.id,
      createdBy: runs.createdBy,
      topic: runs.topic,
      mode: runs.mode,
      state: runs.state,
      currentStage: runs.currentStage,
      resumeState: runs.resumeState,
      failedStage: runs.failedStage,
      failureReason: runs.failureReason,
    })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (!run) {
    throw new StageTransitionError(`Run ${runId} не найден`);
  }

  return run;
}

/**
 * Moves the run and writes the audit row in one transaction. Repeating the same
 * target state is a no-op, which keeps retried jobs from failing on a race.
 */
export async function transitionRun(
  db: Database,
  runId: string,
  to: RunState,
  reason: string | null = null,
): Promise<RunState> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: runs.id,
        mode: runs.mode,
        state: runs.state,
        resumeState: runs.resumeState,
      })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (!run) {
      throw new StageTransitionError(`Run ${runId} не найден`);
    }

    if (run.state === to) {
      return run.state;
    }

    if (!canTransition(run.state, to, run.resumeState, run.mode)) {
      throw new StageTransitionError(
        `Переход ${run.state} → ${to} невозможен для run ${runId}`,
      );
    }

    const stage = stageForState(to, run.mode);

    await tx
      .update(runs)
      .set({
        state: to,
        currentStage: stage,
        failedStage: null,
        failureReason: null,
        resumeState: null,
        updatedAt: new Date(),
      })
      .where(eq(runs.id, runId));

    await tx.insert(runEvents).values({
      runId,
      fromState: run.state,
      toState: to,
      stage,
      reason,
    });

    return to;
  });
}

/**
 * Marks the run as failed and keeps the state it can resume from. Called only
 * when a job has no retries left, so a transient 429 does not end the run.
 */
export async function failRun(
  db: Database,
  runId: string,
  stage: RunStage,
  reason: string,
  resumeState?: RunState,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: runs.id,
        state: runs.state,
        failedStage: runs.failedStage,
      })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (!run || run.state === 'FAILED' || run.state === 'PUBLISHED') {
      return;
    }

    await tx
      .update(runs)
      .set({
        state: 'FAILED',
        failedStage: run.failedStage ?? stage,
        failureReason: reason.slice(0, 500),
        resumeState: resumeState ?? run.state,
        updatedAt: new Date(),
      })
      .where(eq(runs.id, runId));

    await tx.insert(runEvents).values({
      runId,
      fromState: run.state,
      toState: 'FAILED',
      stage,
      reason: reason.slice(0, 500),
    });
  });
}
