import type { StockAsset, StockProvider } from '@peertoreel/contracts';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { StockError } from '../stock/errors.js';
import type { EpisodeSubject } from './subjects.js';
import { fetchEpisodeVisuals } from './visuals.js';

const asset: StockAsset = {
  provider: 'pixabay',
  providerAssetId: '42',
  kind: 'image',
  downloadUrl: 'https://cdn.test/dog.jpg',
  pageUrl: 'https://pixabay.com/photos/dog-42/',
  author: 'alice',
  width: 1080,
  height: 1920,
  durationSec: null,
  sizeBytes: 1024,
  tags: ['dog', 'nose'],
  rank: 0,
};

const subjects: EpisodeSubject[] = [
  {
    sceneId: 'hook',
    sceneIdx: 0,
    reference: 'assets/starter/dog-snout.svg',
    query: 'animal dog nose',
    lang: undefined,
  },
  {
    sceneId: 'fact',
    sceneIdx: 1,
    reference: 'assets/starter/dog-snout.svg',
    query: 'animal dog nose',
    lang: undefined,
  },
  {
    sceneId: 'cta',
    sceneIdx: 2,
    reference: 'assets/starter/unknown.svg',
    query: 'unknown thing',
    lang: 'ru',
  },
];

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

function provider(options: {
  search?: (request: {
    query: string;
  }) => Promise<{ assets: StockAsset[]; cached: boolean }>;
  download?: () => Promise<{ body: Uint8Array; contentType: string }>;
} = {}): StockProvider & {
  search: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
} {
  return {
    search: vi.fn(
      options.search ??
        (async (request: { query: string }) =>
          request.query === 'animal dog nose'
            ? { assets: [asset], cached: false }
            : { assets: [], cached: false }),
    ),
    download: vi.fn(
      options.download ??
        (async () => ({
          body: new Uint8Array([0xff, 0xd8, 0xff]),
          contentType: 'image/jpeg',
        })),
    ),
  } as unknown as StockProvider & {
    search: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
}

describe('fetchEpisodeVisuals', () => {
  it('downloads one image per unique reference and reuses it per scene', async () => {
    const stock = provider();

    const result = await fetchEpisodeVisuals(subjects, stock, fakeLogger());

    expect(result.queries).toBe(2);
    expect(result.artifact.images).toHaveLength(2);
    expect(result.artifact.images.map((image) => image.sceneId)).toEqual([
      'hook',
      'fact',
    ]);
    expect(result.artifact.images[0]?.dataUri).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(result.artifact.images[0]?.license).toBe('pixabay-content-license');
    expect(result.artifact.skipped).toBe(1);
    // Two searches + one download (the empty query downloads nothing).
    expect(result.artifact.providerRequests).toBe(3);
    expect(result.artifact.cacheHits).toBe(0);
    expect(stock.download).toHaveBeenCalledTimes(1);
  });

  it('counts a cache hit as no provider request', async () => {
    const stock = provider({
      search: async (request) => ({
        assets: request.query === 'animal dog nose' ? [asset] : [],
        cached: true,
      }),
    });

    const result = await fetchEpisodeVisuals(subjects, stock, fakeLogger());

    expect(result.artifact.cacheHits).toBe(2);
    expect(result.artifact.providerRequests).toBe(1);
  });

  it('keeps Tier 0 on a non-retryable search error', async () => {
    const stock = provider({
      search: async () => {
        throw new StockError('Pixabay ответил 401', 401, false);
      },
    });

    const result = await fetchEpisodeVisuals(subjects, stock, fakeLogger());

    expect(result.artifact.images).toHaveLength(0);
    expect(result.artifact.skipped).toBe(3);
  });

  it('lets a retryable search error reach BullMQ', async () => {
    const stock = provider({
      search: async () => {
        throw new StockError('Pixabay ответил 429', 429, true);
      },
    });

    await expect(
      fetchEpisodeVisuals(subjects, stock, fakeLogger()),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('skips a download that is too large but keeps the search count', async () => {
    const stock = provider({
      download: async () => {
        throw new StockError('Ассет Pixabay больше допустимого размера', 0, false);
      },
    });

    const result = await fetchEpisodeVisuals(subjects, stock, fakeLogger());

    expect(result.artifact.images).toHaveLength(0);
    expect(result.artifact.skipped).toBe(3);
    expect(result.artifact.providerRequests).toBe(3);
  });
});
