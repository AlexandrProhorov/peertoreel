import {
  episodeManifestSchema,
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
  type EpisodeManifest,
  type EpisodeVisualsArtifact,
} from '@peertoreel/contracts';
import type { Database } from '@peertoreel/db';
import type { ObjectStorage } from '@peertoreel/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { deleteArtifactByObjectKey } from '../stages/delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from '../stages/load-artifact.js';
import { saveArtifact } from '../stages/save-artifact.js';
import { loadRun, transitionRun } from '../stages/transition.js';
import { processEpisodeRenderStage } from './render.processor.js';
import { renderStoryboardCli } from './render-cli.js';

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

vi.mock('../stages/delete-artifact.js', () => ({
  deleteArtifactByObjectKey: vi.fn(),
}));

vi.mock('../media/ffmpeg.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media/ffmpeg.js')>();

  return { ...actual, renderDraft: vi.fn(), runFfmpeg: vi.fn() };
});

vi.mock('./render-cli.js', () => ({
  renderStoryboardCli: vi.fn(),
}));

const runId = '11111111-1111-4111-8111-111111111111';
const manifestKey = `runs/${runId}/episode_plan/manifest.json`;

const visuals: EpisodeVisualsArtifact = {
  images: [
    {
      sceneId: 'scene-1',
      sceneIdx: 0,
      reference: 'assets/starter/dog-snout.svg',
      provider: 'pixabay',
      providerAssetId: '42',
      pageUrl: 'https://pixabay.com/photos/dog-42/',
      author: 'alice',
      license: 'pixabay-content-license',
      downloadUrl: 'https://cdn.test/dog.jpg',
      tags: ['dog'],
      query: 'animal dog nose',
      cached: false,
      width: 1080,
      height: 1920,
      bytes: 3,
      dataUri: 'data:image/jpeg;base64,AAAA',
    },
  ],
  providerRequests: 2,
  cacheHits: 0,
  skipped: 0,
};

const manifest: EpisodeManifest = {
  kind: 'm3.5.1-episode',
  topic: 'Почему у собак мокрый нос',
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
  state?: 'SCRIPT_READY' | 'RENDERING' | 'REVIEW' | 'DRAFT';
  mode?: 'episode' | 'pipeline';
  qcKey?: string | null;
  renderError?: Error;
} = {}) {
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };

  const deps = {
    db: {} as Database,
    storage: storage as unknown as ObjectStorage,
    env: { FFMPEG_BIN: 'ffmpeg' } as unknown as WorkerEnv,
    logger: fakeLogger(),
  };

  vi.mocked(loadRun).mockResolvedValue({
    id: runId,
    createdBy: '22222222-2222-4222-8222-222222222222',
    topic: manifest.topic,
    mode: options.mode ?? 'episode',
    state: options.state ?? 'SCRIPT_READY',
    currentStage: 'episode_plan',
    resumeState: null,
    failedStage: null,
    failureReason: null,
  });
  vi.mocked(transitionRun)
    .mockResolvedValueOnce('RENDERING')
    .mockResolvedValueOnce('REVIEW');
  vi.mocked(loadArtifactBuffer).mockImplementation(
    async (_db, _storage, _runId, type) => {
      switch (type) {
        case 'storyboard_json':
          return Buffer.from(JSON.stringify(storyboardFixture15Deg));
        case 'episode_visuals_json':
          return Buffer.from(JSON.stringify(visuals));
        case 'voiceover_mp3':
          return Buffer.from('audio');
        case 'word_timings':
          return Buffer.from(JSON.stringify(wordTimingsFixture15Deg));
        case 'subtitles_ass':
          return Buffer.from('ass');
        case 'episode_manifest':
          return Buffer.from(JSON.stringify(manifest));
        default:
          throw new Error(`unexpected artifact ${type}`);
      }
    },
  );
  vi.mocked(findArtifactObjectKey).mockImplementation(
    async (_db, _runId, type) =>
      type === 'episode_manifest'
        ? manifestKey
        : type === 'qc_report'
          ? (options.qcKey ?? null)
          : null,
  );
  vi.mocked(deleteArtifactByObjectKey).mockResolvedValue(undefined);
  const renderCli = vi.mocked(renderStoryboardCli);

  if (options.renderError) {
    renderCli.mockRejectedValue(options.renderError);
  } else {
    renderCli.mockResolvedValue(undefined);
  }

  vi.mocked(runFfmpeg).mockResolvedValue('');
  vi.mocked(renderDraft).mockImplementation(async (input) => {
    await writeFile(path.join(input.workDir, input.outputName), 'draft');

    return path.join(input.workDir, input.outputName);
  });
  vi.mocked(saveArtifact).mockImplementation(async (_db, input) => ({
    id: input.objectKey,
    type: input.type,
    objectKey: input.objectKey,
    sizeBytes: input.sizeBytes,
  }));

  return { deps, storage };
}

describe('processEpisodeRenderStage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects a run that is not in episode mode', async () => {
    const { deps } = setup({ mode: 'pipeline' });

    await expect(processEpisodeRenderStage(fakeJob(), deps)).rejects.toThrow(
      'режиме episode',
    );
  });

  it('returns early when the run is already in REVIEW', async () => {
    const { deps } = setup({ state: 'REVIEW' });

    const result = await processEpisodeRenderStage(fakeJob(), deps);

    expect(result).toEqual({
      runId,
      stage: 'episode_render',
      state: 'REVIEW',
      artifacts: [],
    });
    expect(renderStoryboardCli).not.toHaveBeenCalled();
  });

  it('rejects a run before the plan gate', async () => {
    const { deps } = setup({ state: 'DRAFT' });

    await expect(processEpisodeRenderStage(fakeJob(), deps)).rejects.toThrow(
      'SCRIPT_READY',
    );
  });

  it('renders scenes, concats, burns subtitles and updates the manifest', async () => {
    const { deps, storage } = setup();

    const result = await processEpisodeRenderStage(fakeJob(), deps);

    expect(renderStoryboardCli).toHaveBeenCalledOnce();

    const call = vi.mocked(renderStoryboardCli).mock.calls[0]?.[0];

    expect(call?.assetsPath.endsWith('assets.json')).toBe(true);
    expect(transitionRun).toHaveBeenNthCalledWith(
      1,
      deps.db,
      runId,
      'RENDERING',
    );
    expect(transitionRun).toHaveBeenNthCalledWith(2, deps.db, runId, 'REVIEW');
    expect(renderDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        clipPath: 'visuals.mp4',
        audioPath: 'voiceover.mp3',
        assName: 'subtitles.ass',
      }),
      expect.objectContaining({ ffmpegBin: 'ffmpeg' }),
    );

    const manifestCall = storage.putObject.mock.calls.find(([key]) =>
      String(key).endsWith('manifest.json'),
    );
    const stored = episodeManifestSchema.parse(
      JSON.parse(
        Buffer.from(manifestCall?.[1] as Uint8Array).toString('utf8'),
      ),
    );

    expect(stored.render?.injectedAssets).toBe(1);
    expect(stored.render?.costUsd).toBe(0);
    expect(result.artifacts[0]?.type).toBe('draft_mp4');
    expect(deleteArtifactByObjectKey).not.toHaveBeenCalled();
  });

  it('invalidates a stale QC report after a new draft', async () => {
    const qcKey = `runs/${runId}/qc/qc_report.json`;
    const { deps, storage } = setup({ qcKey });

    await processEpisodeRenderStage(fakeJob(), deps);

    expect(deleteArtifactByObjectKey).toHaveBeenCalledWith(deps.db, qcKey);
    expect(storage.deleteObject).toHaveBeenCalledWith(qcKey);
  });

  it('turns a missing Chrome into an unrecoverable error', async () => {
    const { deps } = setup({
      renderError: new Error('Could not find Chrome (ver. 131)'),
    });

    await expect(
      processEpisodeRenderStage(fakeJob(), deps),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
