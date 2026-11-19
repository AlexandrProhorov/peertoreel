import { stageJobDataSchema } from '@peertoreel/contracts';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { generateJson } from '../llm/deepseek.js';
import { saveArtifact } from './save-artifact.js';
import type { StageDeps } from './context.js';
import { processScriptStage } from './script.processor.js';
import { loadRun, transitionRun } from './transition.js';

vi.mock('./transition.js', () => ({
  loadRun: vi.fn(),
  transitionRun: vi.fn(),
}));

vi.mock('../llm/deepseek.js', () => ({
  generateJson: vi.fn(),
}));

vi.mock('./save-artifact.js', () => ({
  saveArtifact: vi.fn(),
}));

const runId = '11111111-1111-4111-8111-111111111111';

function job(): Job {
  return {
    data: stageJobDataSchema.parse({ runId }),
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

function deps(): StageDeps<WorkerEnv> {
  return {
    db: {
      query: { runs: { findFirst: vi.fn() } },
    },
    storage: { putObject: vi.fn() },
    env: {},
  } as unknown as StageDeps<WorkerEnv>;
}

describe('script stage state guard', () => {
  beforeEach(() => {
    vi.mocked(generateJson).mockReset();
    vi.mocked(saveArtifact).mockReset();
    vi.mocked(transitionRun).mockReset();
  });

  it('refuses a run that is not in RESEARCHING', async () => {
    vi.mocked(loadRun).mockResolvedValue({ state: 'DRAFT' } as never);

    await expect(processScriptStage(job(), deps())).rejects.toThrow(
      /RESEARCHING/,
    );
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('returns early for a run that already has a script', async () => {
    vi.mocked(loadRun).mockResolvedValue({ state: 'SCRIPT_READY' } as never);

    await expect(processScriptStage(job(), deps())).resolves.toMatchObject({
      runId,
      stage: 'script',
      artifacts: [],
    });
    expect(generateJson).not.toHaveBeenCalled();
  });
});
