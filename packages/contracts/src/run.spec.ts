import { describe, expect, it } from 'vitest';
import {
  RUN_MODES,
  RUN_STAGES,
  allowedTransitions,
  canTransition,
  createRunRequestSchema,
  runSchema,
  stageForState,
  transitionRunRequestSchema,
  type RunState,
} from './run.js';

const episodeRun = {
  id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
  topic: 'Почему небо синее',
  mode: 'episode' as const,
  state: 'DRAFT' as const,
  currentStage: 'topic_discovery' as const,
  failedStage: null,
  failureReason: null,
  resumeState: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

describe('run contracts', () => {
  it('walks the happy path end to end', () => {
    const edges = [
      ['DRAFT', 'RESEARCHING'],
      ['RESEARCHING', 'SCRIPT_READY'],
      ['SCRIPT_READY', 'VOICE_READY'],
      ['VOICE_READY', 'VISUALS_READY'],
      ['VISUALS_READY', 'RENDERING'],
      ['RENDERING', 'REVIEW'],
      ['REVIEW', 'SCHEDULED'],
      ['SCHEDULED', 'PUBLISHING'],
      ['PUBLISHING', 'PUBLISHED'],
    ] as const satisfies ReadonlyArray<readonly [RunState, RunState]>;

    for (const [from, to] of edges) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('allows regenerating from an earlier stage but not skipping ahead', () => {
    expect(canTransition('REVIEW', 'SCRIPT_READY')).toBe(true);
    expect(canTransition('REVIEW', 'VISUALS_READY')).toBe(true);
    expect(canTransition('REVIEW', 'RENDERING')).toBe(false);
    expect(canTransition('DRAFT', 'REVIEW')).toBe(false);
    expect(canTransition('SCRIPT_READY', 'RENDERING')).toBe(false);
  });

  it('lets any unfinished state fail', () => {
    expect(allowedTransitions('RESEARCHING')).toContain('FAILED');
    expect(allowedTransitions('PUBLISHING')).toContain('FAILED');
    expect(allowedTransitions('PUBLISHED')).not.toContain('FAILED');
    expect(allowedTransitions('FAILED')).toEqual([]);
  });

  it('returns from FAILED only to the state it stopped in', () => {
    expect(allowedTransitions('FAILED', 'RENDERING')).toEqual(['RENDERING']);
    expect(canTransition('FAILED', 'RENDERING', 'RENDERING')).toBe(true);
    expect(canTransition('FAILED', 'DRAFT', 'RENDERING')).toBe(false);
    expect(canTransition('FAILED', 'DRAFT', null)).toBe(false);
  });

  it('maps every state to its stage', () => {
    expect(stageForState('RESEARCHING')).toBe('research');
    expect(stageForState('RENDERING')).toBe('render');
    expect(stageForState('REVIEW')).toBe('qc');
    expect(stageForState('FAILED')).toBeNull();
    expect(RUN_STAGES).toHaveLength(10);
    expect(RUN_MODES).toEqual(['pipeline', 'episode']);
  });

  it('keeps episode mode on its own two-stage path', () => {
    expect(canTransition('DRAFT', 'SCRIPT_READY', null, 'episode')).toBe(true);
    expect(canTransition('SCRIPT_READY', 'RENDERING', null, 'episode')).toBe(
      true,
    );
    expect(canTransition('RENDERING', 'REVIEW', null, 'episode')).toBe(true);
    expect(canTransition('REVIEW', 'SCRIPT_READY', null, 'episode')).toBe(true);
    expect(canTransition('REVIEW', 'SCHEDULED', null, 'episode')).toBe(true);

    // Pipeline-only states and edges stay unreachable.
    expect(canTransition('SCRIPT_READY', 'VOICE_READY', null, 'episode')).toBe(
      false,
    );
    expect(canTransition('VOICE_READY', 'VISUALS_READY', null, 'episode')).toBe(
      false,
    );
    expect(canTransition('REVIEW', 'VISUALS_READY', null, 'episode')).toBe(
      false,
    );
  });

  it('does not let pipeline runs take episode edges', () => {
    expect(canTransition('DRAFT', 'SCRIPT_READY')).toBe(false);
    expect(canTransition('SCRIPT_READY', 'RENDERING')).toBe(false);
    expect(canTransition('DRAFT', 'RESEARCHING', null, 'episode')).toBe(false);
  });

  it('maps episode states to the stage that produced them', () => {
    expect(stageForState('SCRIPT_READY', 'episode')).toBe('episode_plan');
    expect(stageForState('RENDERING', 'episode')).toBe('episode_render');
    expect(stageForState('REVIEW', 'episode')).toBe('episode_render');
    expect(stageForState('SCHEDULED', 'episode')).toBe('publish');
    expect(stageForState('SCRIPT_READY')).toBe('script');
  });

  it('validates payloads', () => {
    expect(transitionRunRequestSchema.safeParse({ to: 'REVIEW' }).success).toBe(
      true,
    );
    expect(transitionRunRequestSchema.safeParse({ to: 'NOPE' }).success).toBe(
      false,
    );
    expect(runSchema.safeParse(episodeRun).success).toBe(true);
    expect(
      runSchema.safeParse({ ...episodeRun, mode: 'nope' }).success,
    ).toBe(false);
    expect(
      runSchema.safeParse({ ...episodeRun, mode: undefined }).success,
    ).toBe(false);
  });

  it('defaults a new run to pipeline mode', () => {
    expect(createRunRequestSchema.parse({ topic: 'Тема' })).toEqual({
      topic: 'Тема',
      mode: 'pipeline',
    });
    expect(
      createRunRequestSchema.parse({ topic: 'Тема', mode: 'episode' }),
    ).toEqual({ topic: 'Тема', mode: 'episode' });
    expect(
      createRunRequestSchema.safeParse({ topic: 'Тема', mode: 'nope' }).success,
    ).toBe(false);
  });
});
