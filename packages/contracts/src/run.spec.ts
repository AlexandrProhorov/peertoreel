import { describe, expect, it } from 'vitest';
import {
  RUN_STAGES,
  allowedTransitions,
  canTransition,
  runSchema,
  stageForState,
  transitionRunRequestSchema,
  type RunState,
} from './run.js';

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
    expect(RUN_STAGES).toHaveLength(8);
  });

  it('validates payloads', () => {
    expect(transitionRunRequestSchema.safeParse({ to: 'REVIEW' }).success).toBe(
      true,
    );
    expect(transitionRunRequestSchema.safeParse({ to: 'NOPE' }).success).toBe(
      false,
    );
    expect(
      runSchema.safeParse({
        id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
        topic: 'Почему небо синее',
        state: 'DRAFT',
        currentStage: 'topic_discovery',
        failedStage: null,
        failureReason: null,
        resumeState: null,
        createdAt: '2026-11-03T12:00:00.000Z',
        updatedAt: '2026-11-03T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
