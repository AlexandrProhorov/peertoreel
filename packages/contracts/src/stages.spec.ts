import { describe, expect, it } from 'vitest';
import {
  STAGE_PRODUCED_STATE,
  STAGE_REQUIRED_STATE,
  stageForProgress,
  stageJobId,
  stageJobDataSchema,
  stageQueueNameSchema,
} from './stages.js';

describe('stage contracts', () => {
  it('builds a BullMQ-safe deterministic job id', () => {
    const id = stageJobId('voiceover', '11111111-1111-4111-8111-111111111111');

    expect(id).toBe('voiceover-11111111-1111-4111-8111-111111111111');
    // BullMQ rejects custom ids containing ':'
    expect(id).not.toContain(':');
  });

  it('is stable for the same run and stage', () => {
    const runId = '11111111-1111-4111-8111-111111111111';

    expect(stageJobId('script', runId)).toBe(stageJobId('script', runId));
  });

  it('maps stages to the states they need and produce', () => {
    expect(STAGE_REQUIRED_STATE.script).toBe('RESEARCHING');
    expect(STAGE_PRODUCED_STATE.script).toBe('SCRIPT_READY');
    expect(STAGE_REQUIRED_STATE.voiceover).toBe('SCRIPT_READY');
    expect(STAGE_PRODUCED_STATE.voiceover).toBe('VOICE_READY');
    expect(STAGE_REQUIRED_STATE.render).toBe('VISUALS_READY');
    expect(STAGE_PRODUCED_STATE.render).toBe('REVIEW');
  });

  it('maps run states to the stage job worth observing', () => {
    expect(stageForProgress('RESEARCHING')).toBe('script');
    expect(stageForProgress('SCRIPT_READY')).toBe('voiceover');
    expect(stageForProgress('VISUALS_READY')).toBe('render');
    expect(stageForProgress('RENDERING')).toBe('render');
    expect(stageForProgress('DRAFT')).toBeNull();
    expect(stageForProgress('REVIEW')).toBeNull();
    expect(stageForProgress('FAILED')).toBeNull();
  });

  it('validates payloads', () => {
    expect(stageQueueNameSchema.safeParse('script').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('render').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('qc').success).toBe(false);
    expect(
      stageJobDataSchema.safeParse({
        runId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    expect(stageJobDataSchema.safeParse({ runId: 'nope' }).success).toBe(false);
  });
});
