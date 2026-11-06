import type { VisualsArtifact } from '@kadence/contracts';
import type { Database } from '@kadence/db';
import type { ObjectStorage } from '@kadence/storage';
import type { Job } from 'bullmq';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { renderDraft } from '../media/ffmpeg.js';
import { buildVisualTrack } from '../media/visual-track.js';
import { deleteArtifactByObjectKey } from './delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from './load-artifact.js';
import { processRenderStage } from './render.processor.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';

vi.mock('./transition.js', () => ({
  loadRun: vi.fn(),
  transitionRun: vi.fn(),
}));

vi.mock('./load-artifact.js', () => ({
  findArtifactObjectKey: vi.fn(),
  loadArtifactBuffer: vi.fn(),
}));

vi.mock('./save-artifact.js', () => ({
  saveArtifact: vi.fn(),
}));

vi.mock('./delete-artifact.js', () => ({
  deleteArtifactByObjectKey: vi.fn(),
}));

vi.mock('../media/ffmpeg.js', () => ({
  renderDraft: vi.fn(),
}));

vi.mock('../media/visual-track.js', () => ({
  buildVisualTrack: vi.fn(),
}));

const runId = '11111111-1111-4111-8111-111111111111';
const manifestKey = `runs/${runId}/visuals/visuals.json`;
const words = [
  { text: 'Привет', startSec: 0, endSec: 1 },
  { text: 'мир', startSec: 1, endSec: 2 },
];

const manifest: VisualsArtifact = {
  scenes: [
    {
      idx: 0,
      part: 'hook',
      beatIndex: null,
      text: 'Привет',
      visualDirection: 'blue sky',
      startSec: 0,
      endSec: 1,
      asset: {
        kind: 'video',
        objectKey: `runs/${runId}/visuals/scene-0`,
        contentType: 'video/mp4',
        width: 1080,
        height: 1920,
        provider: 'pixabay',
        providerAssetId: '1',
        author: 'alice',
        pageUrl: 'https://pixabay.com/videos/id-1/',
      },
    },
    {
      idx: 1,
      part: 'beat',
      beatIndex: 0,
      text: 'мир',
      visualDirection: 'green field',
      startSec: 1,
      endSec: 2,
      asset: {
        kind: 'image',
        objectKey: `runs/${runId}/visuals/scene-1`,
        contentType: 'image/jpeg',
        width: 1080,
        height: 1920,
        provider: 'pixabay',
        providerAssetId: '2',
        author: 'bob',
        pageUrl: 'https://pixabay.com/photos/id-2/',
      },
    },
  ],
  durationSec: 2,
  providerRequests: 2,
  cacheHits: 0,
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

function setup(options: { manifest: VisualsArtifact | null }) {
  const storage = {
    getObject: vi.fn(async (key: string) => {
      if (key === manifestKey) {
        return Buffer.from(JSON.stringify(options.manifest));
      }

      return new Uint8Array([1, 2, 3]);
    }),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };

  vi.mocked(loadRun).mockResolvedValue({
    id: runId,
    state: 'VISUALS_READY',
    currentStage: 'visuals',
    resumeState: null,
    failedStage: null,
    failureReason: null,
  });
  vi.mocked(transitionRun)
    .mockResolvedValueOnce('RENDERING')
    .mockResolvedValueOnce('REVIEW');
  vi.mocked(loadArtifactBuffer).mockImplementation(
    async (_db, _storage, _runId, type) => {
      if (type === 'voiceover_mp3') {
        return Buffer.from('audio');
      }
      if (type === 'word_timings') {
        return Buffer.from(JSON.stringify(words));
      }
      throw new Error(`unexpected artifact ${type}`);
    },
  );
  vi.mocked(findArtifactObjectKey).mockImplementation(
    async (_db, _runId, type) =>
      type === 'visuals_json' && options.manifest ? manifestKey : null,
  );
  vi.mocked(deleteArtifactByObjectKey).mockResolvedValue(undefined);
  vi.mocked(renderDraft).mockImplementation(async (input) => {
    await writeFile(path.join(input.workDir, input.outputName), 'draft');
    return path.join(input.workDir, input.outputName);
  });
  vi.mocked(buildVisualTrack).mockResolvedValue('/tmp/visuals.mp4');
  vi.mocked(saveArtifact).mockResolvedValue({
    id: 'artifact-id',
    type: 'draft_mp4',
    objectKey: `runs/${runId}/render/draft.mp4`,
    sizeBytes: 5,
  });

  const deps = {
    db: {} as Database,
    storage: storage as unknown as ObjectStorage,
    env: { FFMPEG_BIN: 'ffmpeg' } as unknown as WorkerEnv,
    logger: fakeLogger(),
  };

  return { deps, storage };
}

describe('processRenderStage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders from the visual track and reports real sources', async () => {
    const { deps, storage } = setup({ manifest });

    await processRenderStage(fakeJob(), deps);

    expect(buildVisualTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDurationSec: 3,
        scenes: [
          expect.objectContaining({ kind: 'video', fileName: 'scene-0.mp4' }),
          expect.objectContaining({ kind: 'image', fileName: 'scene-1.jpg' }),
        ],
      }),
      { ffmpegBin: 'ffmpeg' },
    );
    expect(renderDraft).toHaveBeenCalledWith(
      expect.objectContaining({ clipPath: 'visuals.mp4' }),
      { ffmpegBin: 'ffmpeg' },
    );
    expect(saveArtifact).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        meta: expect.objectContaining({
          background: 'visuals',
          visualSources: [
            expect.objectContaining({ kind: 'video' }),
            expect.objectContaining({ kind: 'image' }),
          ],
        }),
      }),
    );
    expect(storage.getObject).toHaveBeenCalledWith(manifestKey);
  });

  it('falls back to testsrc2 for old runs without a manifest', async () => {
    const { deps } = setup({ manifest: null });

    await processRenderStage(fakeJob(), deps);

    expect(buildVisualTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDurationSec: 3,
        scenes: [
          expect.objectContaining({
            kind: 'fallback',
            fileName: null,
            durationSec: 3,
          }),
        ],
      }),
      { ffmpegBin: 'ffmpeg' },
    );
    expect(saveArtifact).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        meta: expect.objectContaining({ background: 'fallback_testsrc2' }),
      }),
    );
  });

  it('uses a per-scene fallback when a visual object is missing', async () => {
    const { deps, storage } = setup({ manifest });
    vi.mocked(storage.getObject).mockImplementation(async (key: string) => {
      if (key === manifestKey) {
        return Buffer.from(JSON.stringify(manifest));
      }

      if (key === manifest.scenes[0]?.asset.objectKey) {
        throw new Error('missing object');
      }

      return new Uint8Array([1, 2, 3]);
    });

    await processRenderStage(fakeJob(), deps);

    expect(buildVisualTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [
          expect.objectContaining({ kind: 'fallback' }),
          expect.objectContaining({ kind: 'image' }),
        ],
      }),
      { ffmpegBin: 'ffmpeg' },
    );
    expect(saveArtifact).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        meta: expect.objectContaining({ background: 'visuals' }),
      }),
    );
  });

  it('invalidates the previous QC report when a new draft is rendered', async () => {
    const { deps, storage } = setup({ manifest });
    const qcKey = `runs/${runId}/qc/qc_report.json`;

    vi.mocked(findArtifactObjectKey).mockImplementation(
      async (_db, _runId, type) => {
        if (type === 'visuals_json') {
          return manifestKey;
        }

        return type === 'qc_report' ? qcKey : null;
      },
    );

    await processRenderStage(fakeJob(), deps);

    expect(deleteArtifactByObjectKey).toHaveBeenCalledWith({}, qcKey);
    expect(storage.deleteObject).toHaveBeenCalledWith(qcKey);
  });
});

