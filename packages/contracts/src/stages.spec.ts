import { describe, expect, it } from 'vitest';
import {
  STAGE_MODES,
  STAGE_PRODUCED_STATE,
  STAGE_QUEUES,
  STAGE_REQUIRED_STATE,
  stageForProgress,
  stageForRun,
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
    expect(STAGE_REQUIRED_STATE.visuals).toBe('VOICE_READY');
    expect(STAGE_PRODUCED_STATE.visuals).toBe('VISUALS_READY');
    expect(STAGE_REQUIRED_STATE.render).toBe('VISUALS_READY');
    expect(STAGE_PRODUCED_STATE.render).toBe('REVIEW');
    expect(STAGE_REQUIRED_STATE.qc).toBe('REVIEW');
    expect(STAGE_PRODUCED_STATE.qc).toBe('REVIEW');
    expect(STAGE_REQUIRED_STATE.episode_plan).toBe('DRAFT');
    expect(STAGE_PRODUCED_STATE.episode_plan).toBe('SCRIPT_READY');
    expect(STAGE_REQUIRED_STATE.episode_render).toBe('SCRIPT_READY');
    expect(STAGE_PRODUCED_STATE.episode_render).toBe('REVIEW');
  });

  it('binds each queue to one run mode', () => {
    expect(STAGE_MODES.script).toBe('pipeline');
    expect(STAGE_MODES.qc).toBe('pipeline');
    expect(STAGE_MODES.episode_plan).toBe('episode');
    expect(STAGE_MODES.episode_render).toBe('episode');
    expect(STAGE_QUEUES.episode_plan).toBe('episode_plan');
    expect(STAGE_QUEUES.episode_render).toBe('episode_render');
  });

  it('picks the next stage by run mode', () => {
    // Pipeline keeps its two human-startable steps.
    expect(stageForRun('RESEARCHING')).toBe('script');
    expect(stageForRun('SCRIPT_READY')).toBe('voiceover');
    expect(stageForRun('DRAFT')).toBeNull();

    // Episode mode runs plan and render only.
    expect(stageForRun('DRAFT', 'episode')).toBe('episode_plan');
    expect(stageForRun('SCRIPT_READY', 'episode')).toBe('episode_render');
    expect(stageForRun('REVIEW', 'episode')).toBeNull();
    expect(stageForRun('RESEARCHING', 'episode')).toBeNull();
  });

  it('rehydrates the in-flight episode job while RENDERING', () => {
    expect(stageForProgress('RENDERING', 'episode')).toBe('episode_render');
    expect(stageForProgress('RENDERING')).toBe('render');
    expect(stageForProgress('DRAFT', 'episode')).toBe('episode_plan');
    expect(stageForProgress('SCRIPT_READY', 'episode')).toBe('episode_render');
    expect(stageForProgress('REVIEW', 'episode')).toBeNull();
  });

  it('maps run states to the stage job worth observing', () => {
    expect(stageForProgress('RESEARCHING')).toBe('script');
    expect(stageForProgress('SCRIPT_READY')).toBe('voiceover');
    expect(stageForProgress('VOICE_READY')).toBe('visuals');
    expect(stageForProgress('VISUALS_READY')).toBe('render');
    expect(stageForProgress('RENDERING')).toBe('render');
    expect(stageForProgress('REVIEW')).toBe('qc');
    expect(stageForProgress('DRAFT')).toBeNull();
    expect(stageForProgress('FAILED')).toBeNull();
  });

  it('validates payloads', () => {
    expect(stageQueueNameSchema.safeParse('script').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('visuals').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('render').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('qc').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('episode_plan').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('episode_render').success).toBe(true);
    expect(stageQueueNameSchema.safeParse('research').success).toBe(false);
    expect(
      stageJobDataSchema.safeParse({
        runId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    expect(stageJobDataSchema.safeParse({ runId: 'nope' }).success).toBe(false);
  });

  it('builds a deterministic visuals job id', () => {
    const runId = '11111111-1111-4111-8111-111111111111';

    expect(stageJobId('visuals', runId)).toBe(`visuals-${runId}`);
    expect(stageJobId('visuals', runId)).not.toContain(':');
  });
});
