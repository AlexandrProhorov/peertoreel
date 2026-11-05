import { z } from 'zod';
import { RUN_STAGES, RUN_STATES, runStageSchema, type RunState } from './run.js';

/** One queue per stage, so concurrency and rate limits stay independent. */
export const STAGE_QUEUES = {
  script: 'script',
  voiceover: 'voiceover',
  visuals: 'visuals',
  render: 'render',
} as const;

export type StageQueueName = keyof typeof STAGE_QUEUES;

export const STAGE_JOB_NAMES = {
  script: 'script',
  voiceover: 'voiceover',
  visuals: 'visuals',
  render: 'render',
} as const satisfies Record<StageQueueName, string>;

export const stageQueueNameSchema = z.enum(
  Object.keys(STAGE_QUEUES) as [StageQueueName, ...StageQueueName[]],
);

/** Queue name → pipeline stage it belongs to. */
export const STAGE_OF_QUEUE = {
  script: 'script',
  voiceover: 'voiceover',
  visuals: 'visuals',
  render: 'render',
} as const satisfies Record<StageQueueName, (typeof RUN_STAGES)[number]>;

export const stageJobDataSchema = z.object({
  runId: z.uuid(),
});
export type StageJobData = z.infer<typeof stageJobDataSchema>;

export const stageArtifactSchema = z.object({
  type: z.string().min(1),
  objectKey: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
});
export type StageArtifact = z.infer<typeof stageArtifactSchema>;

export const stageJobResultSchema = z.object({
  runId: z.uuid(),
  stage: runStageSchema,
  state: z.string().min(1),
  artifacts: z.array(stageArtifactSchema),
});
export type StageJobResult = z.infer<typeof stageJobResultSchema>;

export const stageJobSnapshotSchema = z.object({
  jobId: z.string().min(1),
  stage: runStageSchema,
  status: z.enum(['queued', 'active', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  result: stageJobResultSchema.optional(),
  failedReason: z.string().optional(),
});
export type StageJobSnapshot = z.infer<typeof stageJobSnapshotSchema>;

export const enqueueStageResponseSchema = z.object({
  jobId: z.string().min(1),
  stage: runStageSchema,
  status: z.literal('queued'),
});
export type EnqueueStageResponse = z.infer<typeof enqueueStageResponseSchema>;

/**
 * Which run state a stage expects before it may start. The API rejects an
 * enqueue from any other state; the worker re-checks before doing work.
 */
export const STAGE_REQUIRED_STATE = {
  script: 'RESEARCHING',
  voiceover: 'SCRIPT_READY',
  visuals: 'VOICE_READY',
  render: 'VISUALS_READY',
} as const satisfies Record<StageQueueName, RunState>;

export const STAGE_PRODUCED_STATE = {
  script: 'SCRIPT_READY',
  voiceover: 'VOICE_READY',
  visuals: 'VISUALS_READY',
  render: 'REVIEW',
} as const satisfies Record<StageQueueName, RunState>;

/** Which stage a user can run from a given state (drives the UI buttons). */
export const STAGE_FOR_STATE = {
  RESEARCHING: 'script',
  SCRIPT_READY: 'voiceover',
  VOICE_READY: 'visuals',
  VISUALS_READY: 'render',
} as const satisfies Partial<Record<(typeof RUN_STATES)[number], StageQueueName>>;

/**
 * Stage whose job can be in flight for this state, used to rehydrate progress
 * after a page reload. Unlike `STAGE_FOR_STATE`, it includes `RENDERING`: the
 * render stage is started from `VISUALS_READY` but the run moves to `RENDERING`
 * while FFmpeg is still working.
 */
export function stageForProgress(state: RunState): StageQueueName | null {
  if (state === 'RENDERING') {
    return 'render';
  }

  const stages: Partial<Record<RunState, StageQueueName>> = STAGE_FOR_STATE;

  return stages[state] ?? null;
}

/** Deterministic id: one job per run per stage, safe for BullMQ (no colons). */
export function stageJobId(stage: StageQueueName, runId: string): string {
  return `${stage}-${runId}`;
}
