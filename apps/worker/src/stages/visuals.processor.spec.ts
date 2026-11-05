import type {
  StageJobResult,
  StockAsset,
  StockProvider,
  StockSearchResult,
  VisualsArtifact,
} from '@kadence/contracts';
import { visualsArtifactSchema } from '@kadence/contracts';
import type { Database } from '@kadence/db';
import type { ObjectStorage } from '@kadence/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { StockError } from '../stock/errors.js';
import type { DerivedWord } from '../tts/word-timings.js';
import type { Script } from '@kadence/contracts';
import { deleteArtifactByObjectKey } from './delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from './load-artifact.js';
import { saveArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';
import { processVisualsStage } from './visuals.processor.js';

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

const runId = '11111111-1111-4111-8111-111111111111';

const script: Script = {
  title: 'Почему небо синее',
  hook: 'Первый кадр',
  beats: [
    {
      text: 'Второй кадр',
      visualDirection: 'blue sky',
      durationSec: 4,
    },
    {
      text: 'Третий кадр',
      visualDirection: 'green field',
      durationSec: 4,
    },
  ],
  cta: 'Подпишись',
};

const words: DerivedWord[] = [
  { text: 'Первый', startSec: 0, endSec: 0.5 },
  { text: 'кадр', startSec: 0.5, endSec: 1 },
  { text: 'Второй', startSec: 1, endSec: 1.5 },
  { text: 'кадр', startSec: 1.5, endSec: 2 },
  { text: 'Третий', startSec: 2, endSec: 2.5 },
  { text: 'кадр', startSec: 2.5, endSec: 3 },
  { text: 'Подпишись', startSec: 3, endSec: 4 },
];

const asset: StockAsset = {
  provider: 'pixabay',
  providerAssetId: '1',
  kind: 'video',
  downloadUrl: 'https://cdn.test/1.mp4',
  pageUrl: 'https://pixabay.com/videos/id-1/',
  author: 'alice',
  width: 1080,
  height: 1920,
  durationSec: 10,
  sizeBytes: 1024,
  tags: [],
  rank: 0,
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

interface Harness {
  deps: Parameters<typeof processVisualsStage>[1];
  provider: {
    search: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  storage: {
    getObject: ReturnType<typeof vi.fn>;
    putObject: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };
  artifactKeys: Set<string>;
}

function setup(options: {
  keys?: string[];
  state?: 'VOICE_READY' | 'VISUALS_READY' | 'SCRIPT_READY';
  search?: () => Promise<StockSearchResult>;
  download?: () => Promise<{ body: Uint8Array; contentType: string }>;
  apiKey?: string | undefined;
} = {}): Harness {
  const artifactKeys = new Set(options.keys ?? []);
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() =>
          Promise.resolve(
            [...artifactKeys].map((objectKey) => ({ objectKey })),
          ),
        ),
      })),
    })),
  } as unknown as Database;

  const storage = {
    getObject: vi.fn().mockResolvedValue(new Uint8Array()),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    search: vi.fn(
      options.search ??
        (async () => ({ assets: [asset], cached: false })),
    ),
    download: vi.fn(
      options.download ??
        (async () => ({
          body: new Uint8Array([1, 2, 3]),
          contentType: 'video/mp4',
        })),
    ),
  };
  const deps = {
    db,
    storage: storage as unknown as ObjectStorage,
    env: {
      PIXABAY_API_KEY: 'apiKey' in options ? options.apiKey : 'test-key',
    } as unknown as WorkerEnv,
    logger: fakeLogger(),
    stockProvider: provider as unknown as StockProvider,
  };

  vi.mocked(loadRun).mockResolvedValue({
    id: runId,
    state: options.state ?? 'VOICE_READY',
    currentStage: 'voiceover',
    resumeState: null,
    failedStage: null,
    failureReason: null,
  });
  vi.mocked(transitionRun).mockResolvedValue('VISUALS_READY');
  vi.mocked(findArtifactObjectKey).mockResolvedValue(null);
  vi.mocked(loadArtifactBuffer).mockImplementation(
    async (_db, _storage, _runId, type) => {
      if (type === 'script_json') {
        return Buffer.from(JSON.stringify(script));
      }
      if (type === 'word_timings') {
        return Buffer.from(JSON.stringify(words));
      }
      throw new Error(`unexpected artifact ${type}`);
    },
  );
  vi.mocked(saveArtifact).mockImplementation(async (_db, input) => {
    artifactKeys.add(input.objectKey);
    return {
      id: input.objectKey,
      type: input.type,
      objectKey: input.objectKey,
      sizeBytes: input.sizeBytes,
    };
  });
  vi.mocked(deleteArtifactByObjectKey).mockImplementation(
    async (_db, objectKey) => {
      artifactKeys.delete(objectKey);
    },
  );

  return {
    deps,
    provider,
    storage,
    artifactKeys,
  };
}

function manifestFrom(storage: Harness['storage']): VisualsArtifact {
  const call = storage.putObject.mock.calls.find(([key]) =>
    String(key).endsWith('/visuals.json'),
  );

  expect(call).toBeDefined();

  const body = call?.[1] as Uint8Array;

  return visualsArtifactSchema.parse(
    JSON.parse(Buffer.from(body).toString('utf8')),
  );
}

describe('processVisualsStage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns early when the run is already VISUALS_READY', async () => {
    const { deps, provider, storage } = setup({ state: 'VISUALS_READY' });

    const result = await processVisualsStage(fakeJob(), deps);

    expect(result).toEqual({
      runId,
      stage: 'visuals',
      state: 'VISUALS_READY',
      artifacts: [],
    } as StageJobResult);
    expect(provider.search).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects a run in the wrong state', async () => {
    const { deps } = setup({ state: 'SCRIPT_READY' });

    await expect(processVisualsStage(fakeJob(), deps)).rejects.toThrow(
      'VOICE_READY',
    );
  });

  it('writes one manifest and one artifact per scene, idempotently', async () => {
    const { deps, storage, artifactKeys } = setup();

    const first = await processVisualsStage(fakeJob(), deps);
    const keysAfterFirst = new Set(artifactKeys);
    const second = await processVisualsStage(fakeJob(), deps);

    expect(first.artifacts).toHaveLength(5);
    expect(second.artifacts).toHaveLength(5);
    expect(artifactKeys).toEqual(keysAfterFirst);
    expect(artifactKeys.size).toBe(5);

    const manifest = manifestFrom(storage);

    expect(manifest.scenes).toHaveLength(4);
    expect(manifest.scenes.every((scene) => scene.asset.kind === 'video')).toBe(
      true,
    );
    expect(manifest.providerRequests).toBe(8);
    expect(manifest.cacheHits).toBe(0);
    expect(manifest.durationSec).toBe(4);
  });

  it('rotates to a different Pixabay asset when regenerating', async () => {
    const nextAsset: StockAsset = {
      ...asset,
      providerAssetId: '2',
      downloadUrl: 'https://cdn.test/2.mp4',
    };
    const previousManifest: VisualsArtifact = {
      scenes: [
        {
          idx: 0,
          part: 'hook',
          beatIndex: null,
          text: 'old',
          visualDirection: 'old',
          startSec: 0,
          endSec: 1,
          asset: {
            kind: 'video',
            objectKey: 'runs/old/visuals/scene-0',
            contentType: 'video/mp4',
            width: 1080,
            height: 1920,
            provider: 'pixabay',
            providerAssetId: '1',
            author: 'alice',
            pageUrl: 'https://pixabay.com/videos/id-1/',
          },
        },
      ],
      durationSec: 1,
      providerRequests: 0,
      cacheHits: 0,
    };
    const { deps, storage } = setup({
      search: async () => ({ assets: [asset, nextAsset], cached: true }),
    });
    vi.mocked(findArtifactObjectKey).mockResolvedValue(
      'runs/old/visuals/visuals.json',
    );
    vi.mocked(storage.getObject).mockResolvedValue(
      Buffer.from(JSON.stringify(previousManifest)),
    );

    await processVisualsStage(fakeJob(), deps);

    const manifest = manifestFrom(storage);

    expect(manifest.scenes[0]?.asset.providerAssetId).toBe('2');
    expect(manifest.cacheHits).toBe(4);
  });

  it('keeps the run in VISUALS_READY when every download fails', async () => {    const { deps, storage, artifactKeys } = setup({
      download: async () => {
        throw new StockError('Pixabay отдал ассет со статусом 503', 503, true);
      },
    });

    const result = await processVisualsStage(fakeJob(), deps);
    const manifest = manifestFrom(storage);

    expect(result.state).toBe('VISUALS_READY');
    expect(manifest.scenes).toHaveLength(4);
    expect(manifest.scenes.every((scene) => scene.asset.kind === 'fallback')).toBe(
      true,
    );
    expect(artifactKeys.size).toBe(1);
  });

  it('turns a terminal search error into UnrecoverableError', async () => {
    const { deps } = setup({
      search: async () => {
        throw new StockError('Pixabay ответил 401', 401, false);
      },
    });

    await expect(processVisualsStage(fakeJob(), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('lets a retryable search error reach BullMQ', async () => {
    const { deps } = setup({
      search: async () => {
        throw new StockError('Pixabay ответил 429', 429, true);
      },
    });

    await expect(processVisualsStage(fakeJob(), deps)).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });

  it('fails fast when the Pixabay key is missing', async () => {
    const { deps, provider } = setup({ apiKey: undefined });

    await expect(processVisualsStage(fakeJob(), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('removes artifacts for scenes that no longer exist', async () => {
    const staleKey = `runs/${runId}/visuals/scene-99`;
    const { deps, storage, artifactKeys } = setup({ keys: [staleKey] });

    await processVisualsStage(fakeJob(), deps);

    expect(storage.deleteObject).toHaveBeenCalledWith(staleKey);
    expect(artifactKeys.has(staleKey)).toBe(false);
  });
});

