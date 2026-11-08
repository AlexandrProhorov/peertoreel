import type { StockAsset } from '@peertoreel/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { StockSearchCache } from './cache.js';
import { StockError } from './errors.js';
import { createPixabayStockProvider } from './pixabay.js';
import type { RateLimiter } from './rate-limiter.js';

class MemoryCache implements StockSearchCache {
  readonly entries = new Map<string, StockAsset[]>();

  async get(key: string): Promise<StockAsset[] | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, assets: StockAsset[]): Promise<void> {
    this.entries.set(key, assets);
  }
}

class CountingLimiter implements RateLimiter {
  calls = 0;

  async acquire(): Promise<void> {
    this.calls += 1;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const videoPayload = {
  hits: [
    {
      id: 1,
      pageURL: 'https://pixabay.com/videos/id-1/',
      user: 'alice',
      duration: 12,
      tags: 'dog, snow, animal',
      videos: {
        large: {
          url: 'https://cdn.test/vertical.mp4',
          width: 1080,
          height: 1920,
          size: 1024,
        },
        medium: {
          url: 'https://cdn.test/horizontal.mp4',
          width: 1920,
          height: 1080,
          size: 512,
        },
      },
    },
  ],
};

const imagePayload = {
  hits: [
    {
      id: 2,
      pageURL: 'https://pixabay.com/photos/id-2/',
      user: 'bob',
      imageWidth: 1080,
      imageHeight: 1920,
      largeImageURL: 'https://cdn.test/photo.jpg',
      tags: 'dog, portrait',
    },
  ],
};

function setup(
  fetchImpl: typeof fetch,
  apiKey = 'test-key',
): {
  provider: ReturnType<typeof createPixabayStockProvider>;
  cache: MemoryCache;
  limiter: CountingLimiter;
} {
  const cache = new MemoryCache();
  const limiter = new CountingLimiter();
  const provider = createPixabayStockProvider({
    apiKey,
    cache,
    limiter,
    fetchImpl,
  });

  return { provider, cache, limiter };
}

describe('Pixabay provider', () => {
  it('builds a vertical video search and normalizes the best rendition', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse(videoPayload);
    }) as unknown as typeof fetch;
    const { provider, limiter } = setup(fetchImpl);

    const result = await provider.search({
      query: 'blue sky',
      kind: 'video',
    });
    const url = new URL(calls[0] ?? '');

    expect(url.pathname).toBe('/api/videos/');
    expect(url.searchParams.get('video_type')).toBe('film');
    expect(url.searchParams.get('safesearch')).toBe('true');
    expect(url.searchParams.get('per_page')).toBe('5');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('order')).toBe('popular');
    expect(url.searchParams.get('lang')).toBeNull();
    expect(result.cached).toBe(false);
    expect(result.assets).toEqual([
      {
        provider: 'pixabay',
        providerAssetId: '1',
        kind: 'video',
        downloadUrl: 'https://cdn.test/vertical.mp4',
        pageUrl: 'https://pixabay.com/videos/id-1/',
        author: 'alice',
        width: 1080,
        height: 1920,
        durationSec: 12,
        sizeBytes: 1024,
        tags: ['dog', 'snow', 'animal'],
        rank: 0,
      },
    ]);
    expect(limiter.calls).toBe(1);
  });

  it('searches vertical photos with the image endpoint', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse(imagePayload);
    }) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    const result = await provider.search({ query: 'blue sky', kind: 'image' });
    const url = new URL(calls[0] ?? '');

    expect(url.pathname).toBe('/api/');
    expect(url.searchParams.get('image_type')).toBe('photo');
    expect(url.searchParams.get('orientation')).toBe('vertical');
    expect(result.assets[0]?.kind).toBe('image');
    expect(result.assets[0]?.durationSec).toBeNull();
  });

  it('adds lang=ru only for a Cyrillic query', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse(videoPayload);
    }) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    await provider.search({ query: 'синее небо', kind: 'video' });

    expect(new URL(calls[0] ?? '').searchParams.get('lang')).toBe('ru');
  });

  it('serves the same query from cache without spending the rate limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(videoPayload)) as unknown as typeof fetch;
    const { provider, cache, limiter } = setup(fetchImpl);

    await provider.search({ query: 'blue sky', kind: 'video' });
    const second = await provider.search({ query: 'BLUE SKY', kind: 'video' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(second.cached).toBe(true);
    expect(limiter.calls).toBe(1);
    expect([...cache.entries.keys()][0]).toMatch(/^pixabay:search:[a-f0-9]{64}$/);
    expect([...cache.entries.keys()][0]).not.toContain('test-key');
  });

  it('classifies 429 as retryable and 401 as terminal', async () => {
    const retryable = setup(
      vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    ).provider;
    const terminal = setup(
      vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch,
    ).provider;

    await expect(
      retryable.search({ query: 'blue sky', kind: 'video' }),
    ).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(
      terminal.search({ query: 'blue sky', kind: 'video' }),
    ).rejects.toMatchObject({ status: 401, retryable: false });
  });

  it('treats a malformed payload as a terminal provider error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ hits: 'not-an-array' }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    await expect(
      provider.search({ query: 'blue sky', kind: 'video' }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('skips malformed hits but keeps valid ones', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ hits: [videoPayload.hits[0], { id: 'bad' }] }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    const result = await provider.search({ query: 'blue sky', kind: 'video' });

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.providerAssetId).toBe('1');
  });

  it('fails clearly when the API key is missing', async () => {
    const { provider } = setup(
      vi.fn() as unknown as typeof fetch,
      '',
    );

    await expect(
      provider.search({ query: 'blue sky', kind: 'video' }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('downloads only the selected asset and validates content type', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'video/mp4' },
      }),
    ) as unknown as typeof fetch;
    const { provider, limiter } = setup(fetchImpl);

    const downloaded = await provider.download(
      {
        provider: 'pixabay',
        providerAssetId: '1',
        kind: 'video',
        downloadUrl: 'https://cdn.test/vertical.mp4',
        pageUrl: 'https://pixabay.com/videos/id-1/',
        author: 'alice',
        width: 1080,
        height: 1920,
        durationSec: 12,
        sizeBytes: 1024,
        tags: ['dog'],
        rank: 0,
      },
      { maxBytes: 1024 },
    );

    expect(downloaded.contentType).toBe('video/mp4');
    expect([...downloaded.body]).toEqual([1, 2, 3]);
    expect(limiter.calls).toBe(1);
  });

  it('rejects the wrong content type and oversized bodies', async () => {
    const wrongType = setup(
      vi.fn(async () =>
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      ) as unknown as typeof fetch,
    ).provider;
    const tooLarge = setup(
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'video/mp4' },
        }),
      ) as unknown as typeof fetch,
    ).provider;
    const asset: StockAsset = {
      provider: 'pixabay',
      providerAssetId: '1',
      kind: 'video',
      downloadUrl: 'https://cdn.test/vertical.mp4',
      pageUrl: 'https://pixabay.com/videos/id-1/',
      author: 'alice',
      width: 1080,
      height: 1920,
      durationSec: 12,
      sizeBytes: 1024,
      tags: ['dog'],
      rank: 0,
    };

    await expect(
      wrongType.download(asset, { maxBytes: 1024 }),
    ).rejects.toBeInstanceOf(StockError);
    await expect(
      tooLarge.download(asset, { maxBytes: 2 }),
    ).rejects.toMatchObject({ retryable: false });
  });
});

