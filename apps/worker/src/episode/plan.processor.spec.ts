import {
  episodeManifestSchema,
  type EpisodeManifest,
  type StockProvider,
  type Storyboard,
  type StoryboardDraft,
} from '@peertoreel/contracts';
import type { Database } from '@peertoreel/db';
import type { ObjectStorage } from '@peertoreel/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { generateJson } from '../llm/deepseek.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { buildStoryboardFromDraft } from '../storyboard/build.js';
import { synthesizeWithGoogleTts } from '../storyboard/tts-fallback.js';
import { findArtifactObjectKey } from '../stages/load-artifact.js';
import { saveArtifact } from '../stages/save-artifact.js';
import { loadRun, transitionRun } from '../stages/transition.js';
import { processEpisodePlanStage } from './plan.processor.js';
import { collectEpisodeSubjects } from './subjects.js';
import { fetchEpisodeVisuals } from './visuals.js';

vi.mock('../stages/transition.js', () => ({
  loadRun: vi.fn(),
  transitionRun: vi.fn(),
}));

vi.mock('../stages/load-artifact.js', () => ({
  findArtifactObjectKey: vi.fn(),
  loadArtifactBuffer: vi.fn(),
}));

vi.mock('../stages/save-artifact.js', () => ({
  saveArtifact: vi.fn(),
}));

vi.mock('../llm/deepseek.js', () => ({
  generateJson: vi.fn(),
}));

vi.mock('../storyboard/tts-fallback.js', () => ({
  GOOGLE_TTS_PROVIDER: 'google-translate-spike',
  synthesizeWithGoogleTts: vi.fn(),
}));

vi.mock('../storyboard/build.js', () => ({
  buildStoryboardFromDraft: vi.fn(),
}));

vi.mock('../media/karaoke.js', () => ({
  buildKaraokeAss: vi.fn(() => 'ass'),
}));

vi.mock('./subjects.js', () => ({
  collectEpisodeSubjects: vi.fn(() => []),
}));

vi.mock('./visuals.js', () => ({
  fetchEpisodeVisuals: vi.fn(),
}));

const runId = '11111111-1111-4111-8111-111111111111';
const topic = 'Почему у собак мокрый нос';
const manifestKey = `runs/${runId}/episode_plan/manifest.json`;

const draft: StoryboardDraft = {
  title: 'Мокрый нос',
  scenes: [],
};

const storyboard = {
  scenes: [{ id: 'hook' }, { id: 'fact' }, { id: 'cta' }],
  audio: { durationSec: 3 },
} as unknown as Storyboard;

const manifest: EpisodeManifest = {
  kind: 'm3.5.1-episode',
  topic,
  title: 'Мокрый нос',
  generatedAt: '2026-11-11T12:00:00.000Z',
  totalMs: 1000,
  llm: {
    provider: 'deepseek',
    model: 'deepseek-flash',
    attempts: 1,
    promptTokens: 100,
    completionTokens: 200,
    ms: 500,
    costUsd: null,
  },
  tts: {
    provider: 'google-translate-spike',
    model: 'google-translate:ru',
    characters: 40,
    words: 8,
    audioDurationSec: 3,
    bytes: 1000,
    ms: 200,
    costUsd: 0,
  },
  stock: {
    provider: 'pixabay',
    queries: 1,
    providerRequests: 2,
    cacheHits: 0,
    images: 1,
    skipped: 0,
    costUsd: 0,
  },
};

function fakeLogger(): Logger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

function fakeJob(): Job {
  return {
    data: { runId },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

function setup(options: {
  state?: 'DRAFT' | 'SCRIPT_READY' | 'RESEARCHING';
  mode?: 'episode' | 'pipeline';
  deepseekKey?: string;
  pixabayKey?: string;
  completePlan?: boolean;
  previousTopic?: string;
} = {}) {
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(async () =>
      Buffer.from(
        JSON.stringify({
          ...manifest,
          topic: options.previousTopic ?? topic,
        }),
      ),
    ),
  };

  const deps = {
    db: {} as Database,
    storage: storage as unknown as ObjectStorage,
    env: {
      DEEPSEEK_API_KEY:
        'deepseekKey' in options ? options.deepseekKey : 'deepseek-key',
      PIXABAY_API_KEY:
        'pixabayKey' in options ? options.pixabayKey : 'pixabay-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_MODEL: 'deepseek-flash',
      FFMPEG_BIN: 'ffmpeg',
      FFPROBE_BIN: 'ffprobe',
    } as unknown as WorkerEnv,
    logger: fakeLogger(),
    stockProvider: { search: vi.fn(), download: vi.fn() } as unknown as StockProvider,
  };

  vi.mocked(loadRun).mockResolvedValue({
    id: runId,
    createdBy: '22222222-2222-4222-8222-222222222222',
    topic,
    mode: options.mode ?? 'episode',
    state: options.state ?? 'DRAFT',
    currentStage: 'topic_discovery',
    resumeState: null,
    failedStage: null,
    failureReason: null,
  });
  vi.mocked(transitionRun).mockResolvedValue('SCRIPT_READY');
  vi.mocked(findArtifactObjectKey).mockImplementation(async (_db, _runId, type) =>
    options.completePlan ? `runs/${runId}/episode_plan/${type}` : null,
  );
  if (options.completePlan) {
    vi.mocked(findArtifactObjectKey).mockImplementation(
      async (_db, _runId, type) =>
        type === 'episode_manifest' ? manifestKey : `runs/${runId}/${type}`,
    );
  }
  vi.mocked(saveArtifact).mockImplementation(async (_db, input) => ({
    id: input.objectKey,
    type: input.type,
    objectKey: input.objectKey,
    sizeBytes: input.sizeBytes,
  }));
  vi.mocked(generateJson).mockResolvedValue({
    data: draft,
    usage: { promptTokens: 100, completionTokens: 200 },
    attempts: 1,
  } as Awaited<ReturnType<typeof generateJson>>);
  vi.mocked(synthesizeWithGoogleTts).mockImplementation(async (input) => {
    await writeFile(path.join(input.workDir, 'voiceover.mp3'), 'audio');

    return {
      provider: 'google-translate-spike',
      model: 'google-translate:ru',
      words: [{ text: 'Мокрый', startSec: 0, endSec: 1 }],
      audioDurationSec: 3,
      sceneDurationsSec: [3],
      characters: 40,
      bytes: 5,
    };
  });
  vi.mocked(buildStoryboardFromDraft).mockReturnValue(storyboard);
  vi.mocked(collectEpisodeSubjects).mockReturnValue([]);
  vi.mocked(fetchEpisodeVisuals).mockResolvedValue({
    queries: 1,
    artifact: {
      images: [],
      providerRequests: 2,
      cacheHits: 0,
      skipped: 0,
    },
  });
  vi.mocked(buildKaraokeAss).mockReturnValue('ass');

  return { deps, storage };
}

describe('processEpisodePlanStage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects a run that is not in episode mode', async () => {
    const { deps } = setup({ mode: 'pipeline' });

    await expect(processEpisodePlanStage(fakeJob(), deps)).rejects.toThrow(
      'режиме episode',
    );
  });

  it('returns early when the plan already produced SCRIPT_READY', async () => {
    const { deps } = setup({ state: 'SCRIPT_READY' });

    const result = await processEpisodePlanStage(fakeJob(), deps);

    expect(result).toEqual({
      runId,
      stage: 'episode_plan',
      state: 'SCRIPT_READY',
      artifacts: [],
    });
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('rejects a run in the wrong state', async () => {
    const { deps } = setup({ state: 'RESEARCHING' });

    await expect(processEpisodePlanStage(fakeJob(), deps)).rejects.toThrow(
      'DRAFT',
    );
  });

  it('fails fast when a provider key is missing', async () => {
    const noDeepseek = setup({ deepseekKey: undefined });
    const noPixabay = setup({ pixabayKey: undefined });

    await expect(
      processEpisodePlanStage(fakeJob(), noDeepseek.deps),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processEpisodePlanStage(fakeJob(), noPixabay.deps),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(generateJson).not.toHaveBeenCalled();
    expect(synthesizeWithGoogleTts).not.toHaveBeenCalled();
  });

  it('writes the plan artifacts with real usage and moves to SCRIPT_READY', async () => {
    const { deps, storage } = setup();

    const result = await processEpisodePlanStage(fakeJob(), deps);

    expect(synthesizeWithGoogleTts).toHaveBeenCalledOnce();
    expect(fetchEpisodeVisuals).toHaveBeenCalledOnce();
    expect(transitionRun).toHaveBeenCalledWith(deps.db, runId, 'SCRIPT_READY');
    expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
      'storyboard_json',
      'episode_visuals_json',
      'voiceover_mp3',
      'word_timings',
      'subtitles_ass',
      'episode_manifest',
    ]);

    const manifestCall = storage.putObject.mock.calls.find(([key]) =>
      String(key).endsWith('/manifest.json'),
    );
    const stored = episodeManifestSchema.parse(
      JSON.parse(
        Buffer.from(manifestCall?.[1] as Uint8Array).toString('utf8'),
      ),
    );

    expect(stored.llm.promptTokens).toBe(100);
    expect(stored.llm.costUsd).toBeNull();
    expect(stored.tts.costUsd).toBe(0);
    expect(stored.stock.providerRequests).toBe(2);
    expect(stored.topic).toBe(topic);
  });

  it('reuses a complete plan instead of paying for LLM, TTS and Pixabay twice', async () => {
    const { deps, storage } = setup({
      completePlan: true,
      state: 'DRAFT',
    });

    const result = await processEpisodePlanStage(fakeJob(), deps);

    expect(generateJson).not.toHaveBeenCalled();
    expect(synthesizeWithGoogleTts).not.toHaveBeenCalled();
    expect(fetchEpisodeVisuals).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(transitionRun).toHaveBeenCalledWith(deps.db, runId, 'SCRIPT_READY');
    expect(result.artifacts).toEqual([]);
  });

  it('regenerates when the topic changed under the old manifest', async () => {
    const { deps } = setup({
      completePlan: true,
      previousTopic: 'Другая тема',
    });

    await processEpisodePlanStage(fakeJob(), deps);

    expect(generateJson).toHaveBeenCalledOnce();
  });
});
