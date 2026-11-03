import { z } from 'zod';

export const RUN_STAGES = [
  'topic_discovery',
  'research',
  'script',
  'voiceover',
  'visuals',
  'render',
  'qc',
  'publish',
] as const;

export const runStageSchema = z.enum(RUN_STAGES);
export type RunStage = z.infer<typeof runStageSchema>;

export const RUN_STATES = [
  'DRAFT',
  'RESEARCHING',
  'SCRIPT_READY',
  'VOICE_READY',
  'VISUALS_READY',
  'RENDERING',
  'REVIEW',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
] as const;

export const runStateSchema = z.enum(RUN_STATES);
export type RunState = z.infer<typeof runStateSchema>;

/**
 * Happy-path and regeneration edges. `FAILED` is not listed here: it is
 * reachable from any unfinished state and only leads back to `resumeState`.
 */
const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  DRAFT: ['RESEARCHING'],
  RESEARCHING: ['SCRIPT_READY'],
  SCRIPT_READY: ['VOICE_READY', 'RESEARCHING'],
  VOICE_READY: ['VISUALS_READY', 'SCRIPT_READY'],
  VISUALS_READY: ['RENDERING', 'VOICE_READY'],
  RENDERING: ['REVIEW', 'VISUALS_READY'],
  REVIEW: ['SCHEDULED', 'SCRIPT_READY', 'VOICE_READY', 'VISUALS_READY', 'RENDERING'],
  SCHEDULED: ['PUBLISHING', 'REVIEW'],
  PUBLISHING: ['PUBLISHED'],
  PUBLISHED: [],
  FAILED: [],
};

/** Which pipeline stage owns each state; used to tag failures and progress. */
const STATE_STAGE: Record<RunState, RunStage | null> = {
  DRAFT: 'topic_discovery',
  RESEARCHING: 'research',
  SCRIPT_READY: 'script',
  VOICE_READY: 'voiceover',
  VISUALS_READY: 'visuals',
  RENDERING: 'render',
  REVIEW: 'qc',
  SCHEDULED: 'publish',
  PUBLISHING: 'publish',
  PUBLISHED: 'publish',
  FAILED: null,
};

export function stageForState(state: RunState): RunStage | null {
  return STATE_STAGE[state];
}

export function allowedTransitions(
  from: RunState,
  resumeState: RunState | null = null,
): readonly RunState[] {
  if (from === 'FAILED') {
    return resumeState ? [resumeState] : [];
  }

  const next = TRANSITIONS[from];

  return from === 'PUBLISHED' ? next : [...next, 'FAILED'];
}

export function canTransition(
  from: RunState,
  to: RunState,
  resumeState: RunState | null = null,
): boolean {
  return allowedTransitions(from, resumeState).includes(to);
}

export const runSchema = z.object({
  id: z.uuid(),
  topic: z.string().min(1).max(300),
  state: runStateSchema,
  currentStage: runStageSchema.nullable(),
  failedStage: runStageSchema.nullable(),
  failureReason: z.string().nullable(),
  resumeState: runStateSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Run = z.infer<typeof runSchema>;

export const createRunRequestSchema = z.object({
  topic: z.string().min(1).max(300),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const transitionRunRequestSchema = z.object({
  to: runStateSchema,
  reason: z.string().min(1).max(500).optional(),
});
export type TransitionRunRequest = z.infer<typeof transitionRunRequestSchema>;

export const runEventSchema = z.object({
  id: z.uuid(),
  fromState: runStateSchema.nullable(),
  toState: runStateSchema,
  stage: runStageSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const runDetailSchema = runSchema.extend({
  events: z.array(runEventSchema),
});
export type RunDetail = z.infer<typeof runDetailSchema>;

export const runListResponseSchema = z.object({
  runs: z.array(runSchema),
});
export type RunListResponse = z.infer<typeof runListResponseSchema>;
