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
  // Episode mode (M3.5.1): a parallel two-stage path for the cheap spike.
  'episode_plan',
  'episode_render',
] as const;

export const runStageSchema = z.enum(RUN_STAGES);
export type RunStage = z.infer<typeof runStageSchema>;

/**
 * Two independent execution paths. `pipeline` is the production queue chain
 * (script → voiceover → visuals → render → qc); `episode` is the cheap
 * DeepSeek + Google TTS + Pixabay + Remotion prototype.
 */
export const RUN_MODES = ['pipeline', 'episode'] as const;
export const runModeSchema = z.enum(RUN_MODES);
export type RunMode = z.infer<typeof runModeSchema>;

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
  REVIEW: ['SCHEDULED', 'SCRIPT_READY', 'VOICE_READY', 'VISUALS_READY'],
  SCHEDULED: ['PUBLISHING', 'REVIEW'],
  PUBLISHING: ['PUBLISHED'],
  PUBLISHED: [],
  FAILED: [],
};

/**
 * Episode mode skips research and visuals: one job goes DRAFT → SCRIPT_READY
 * (plan) and the second SCRIPT_READY → REVIEW (render). The publish tail is
 * shared with the pipeline. States that only exist on the pipeline path stay
 * unreachable here instead of silently allowing a dead end.
 */
const EPISODE_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  DRAFT: ['SCRIPT_READY'],
  RESEARCHING: [],
  SCRIPT_READY: ['RENDERING'],
  VOICE_READY: [],
  VISUALS_READY: [],
  RENDERING: ['REVIEW'],
  REVIEW: ['SCHEDULED', 'SCRIPT_READY'],
  SCHEDULED: ['PUBLISHING', 'REVIEW'],
  PUBLISHING: ['PUBLISHED'],
  PUBLISHED: [],
  FAILED: [],
};

function transitionsFor(mode: RunMode): Record<RunState, readonly RunState[]> {
  return mode === 'episode' ? EPISODE_TRANSITIONS : TRANSITIONS;
}

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

/**
 * Episode states map to the job that produced them, so `currentStage` and the
 * history stay readable. `SCRIPT_READY` is the plan gate, not a script stage.
 */
const EPISODE_STATE_STAGE: Record<RunState, RunStage | null> = {
  ...STATE_STAGE,
  RESEARCHING: null,
  SCRIPT_READY: 'episode_plan',
  VOICE_READY: null,
  VISUALS_READY: null,
  RENDERING: 'episode_render',
  REVIEW: 'episode_render',
};

export function stageForState(
  state: RunState,
  mode: RunMode = 'pipeline',
): RunStage | null {
  return (mode === 'episode' ? EPISODE_STATE_STAGE : STATE_STAGE)[state];
}

export function allowedTransitions(
  from: RunState,
  resumeState: RunState | null = null,
  mode: RunMode = 'pipeline',
): readonly RunState[] {
  if (from === 'FAILED') {
    return resumeState ? [resumeState] : [];
  }

  const next = transitionsFor(mode)[from];

  return from === 'PUBLISHED' ? next : [...next, 'FAILED'];
}

export function canTransition(
  from: RunState,
  to: RunState,
  resumeState: RunState | null = null,
  mode: RunMode = 'pipeline',
): boolean {
  return allowedTransitions(from, resumeState, mode).includes(to);
}

export const runSchema = z.object({
  id: z.uuid(),
  topic: z.string().min(1).max(300),
  mode: runModeSchema,
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
  /**
   * The API default keeps existing clients (topic only) on the pipeline path;
   * episode mode must be requested explicitly.
   */
  mode: runModeSchema.default('pipeline'),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
/** Request body as the client sends it: `mode` may be omitted. */
export type CreateRunRequestInput = z.input<typeof createRunRequestSchema>;

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
