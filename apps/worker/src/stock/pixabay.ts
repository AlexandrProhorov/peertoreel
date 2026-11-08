import {
  stockSearchRequestSchema,
  type StockAsset,
  type StockDownload,
  type StockDownloadOptions,
  type StockProvider,
  type StockSearchRequest,
  type StockSearchResult,
} from '@peertoreel/contracts';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireProviderKey } from '../config/env.js';
import type { StockSearchCache } from './cache.js';
import { StockError, isRetryableStockStatus } from './errors.js';
import { STOCK_LIMITS } from './limits.js';
import type { RateLimiter } from './rate-limiter.js';

const videoRenditionSchema = z.object({
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size: z.number().int().nonnegative(),
});

const pixabayVideoHitSchema = z.object({
  id: z.number().int().positive(),
  pageURL: z.url(),
  user: z.string().min(1),
  duration: z.number().positive(),
  tags: z.string().optional(),
  videos: z.object({
    large: videoRenditionSchema.optional(),
    medium: videoRenditionSchema.optional(),
    small: videoRenditionSchema.optional(),
  }),
});

const pixabayImageHitSchema = z.object({
  id: z.number().int().positive(),
  pageURL: z.url(),
  user: z.string().min(1),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  largeImageURL: z.url().optional(),
  webformatURL: z.url().optional(),
  webformatWidth: z.number().int().positive().optional(),
  webformatHeight: z.number().int().positive().optional(),
  tags: z.string().optional(),
});

const pixabayResponseSchema = z.object({
  hits: z.array(z.unknown()),
});

type VideoRendition = z.infer<typeof videoRenditionSchema>;

export interface PixabayOptions {
  apiKey: string | undefined;
  cache: StockSearchCache;
  limiter: RateLimiter;
  fetchImpl?: typeof fetch;
  searchTimeoutMs?: number;
  downloadTimeoutMs?: number;
}

function requireKey(value: string | undefined): string {
  try {
    return requireProviderKey(value, 'PIXABAY_API_KEY');
  } catch (error: unknown) {
    throw new StockError(
      error instanceof Error ? error.message : 'PIXABAY_API_KEY не задан',
      0,
      false,
    );
  }
}

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/u.test(text);
}

function fingerprint(request: {
  query: string;
  kind: string;
  lang?: string;
  page: number;
  perPage: number;
}): string {
  const payload = JSON.stringify({
    query: request.query.trim().toLowerCase(),
    kind: request.kind,
    lang: request.lang ?? null,
    page: request.page,
    perPage: request.perPage,
  });

  return `pixabay:search:${createHash('sha256').update(payload).digest('hex')}`;
}

function buildSearchUrl(
  apiKey: string,
  request: {
    query: string;
    kind: 'video' | 'image';
    lang?: string;
    page: number;
    perPage: number;
  },
): URL {
  const url = new URL(
    request.kind === 'video'
      ? 'https://pixabay.com/api/videos/'
      : 'https://pixabay.com/api/',
  );

  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', request.query.trim());
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');
  url.searchParams.set('page', String(request.page));
  url.searchParams.set('per_page', String(request.perPage));

  if (request.lang) {
    url.searchParams.set('lang', request.lang);
  }

  if (request.kind === 'video') {
    url.searchParams.set('video_type', 'film');
  } else {
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'vertical');
  }

  return url;
}

function renditionScore(rendition: VideoRendition): number {
  const vertical = rendition.height > rendition.width ? 1_000_000_000 : 0;

  return vertical + rendition.width * rendition.height;
}

function parseTags(tags: string | undefined): string[] {
  return (tags ?? '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

function normalizeVideoHits(payload: unknown): StockAsset[] {
  const parsed = pixabayResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new StockError('Pixabay вернул некорректный ответ', 200, false);
  }

  const assets: StockAsset[] = [];

  for (const [rank, raw] of parsed.data.hits.entries()) {
    const hit = pixabayVideoHitSchema.safeParse(raw);

    if (!hit.success) {
      continue;
    }

    const renditions = [
      hit.data.videos.large,
      hit.data.videos.medium,
      hit.data.videos.small,
    ].filter((rendition): rendition is VideoRendition => rendition !== undefined);

    if (renditions.length === 0) {
      continue;
    }

    const best = [...renditions].sort(
      (left, right) => renditionScore(right) - renditionScore(left),
    )[0];

    if (!best) {
      continue;
    }

    assets.push({
      provider: 'pixabay',
      providerAssetId: String(hit.data.id),
      kind: 'video',
      downloadUrl: best.url,
      pageUrl: hit.data.pageURL,
      author: hit.data.user,
      width: best.width,
      height: best.height,
      durationSec: hit.data.duration,
      sizeBytes: best.size,
      tags: parseTags(hit.data.tags),
      rank,
    });
  }

  return assets;
}

function normalizeImageHits(payload: unknown): StockAsset[] {
  const parsed = pixabayResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new StockError('Pixabay вернул некорректный ответ', 200, false);
  }

  const assets: StockAsset[] = [];

  for (const [rank, raw] of parsed.data.hits.entries()) {
    const hit = pixabayImageHitSchema.safeParse(raw);

    if (!hit.success) {
      continue;
    }

    const url = hit.data.largeImageURL ?? hit.data.webformatURL;

    if (!url) {
      continue;
    }

    const width = hit.data.largeImageURL
      ? hit.data.imageWidth
      : (hit.data.webformatWidth ?? hit.data.imageWidth);
    const height = hit.data.largeImageURL
      ? hit.data.imageHeight
      : (hit.data.webformatHeight ?? hit.data.imageHeight);

    assets.push({
      provider: 'pixabay',
      providerAssetId: String(hit.data.id),
      kind: 'image',
      downloadUrl: url,
      pageUrl: hit.data.pageURL,
      author: hit.data.user,
      width,
      height,
      durationSec: null,
      sizeBytes: null,
      tags: parseTags(hit.data.tags),
      rank,
    });
  }

  return assets;
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const body = response.body;

  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      throw new StockError('Ассет Pixabay больше допустимого размера', 0, false);
    }

    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel();
      throw new StockError('Ассет Pixabay больше допустимого размера', 0, false);
    }

    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export function createPixabayStockProvider(
  options: PixabayOptions,
): StockProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function search(
    rawRequest: StockSearchRequest,
  ): Promise<StockSearchResult> {
    const request = stockSearchRequestSchema.parse(rawRequest);
    const apiKey = requireKey(options.apiKey);
    const lang =
      request.lang ?? (hasCyrillic(request.query) ? 'ru' : undefined);
    const cacheKey = fingerprint({ ...request, lang });
    const cached = await options.cache.get(cacheKey);

    if (cached !== null) {
      return { assets: cached, cached: true };
    }

    await options.limiter.acquire();

    const url = buildSearchUrl(apiKey, { ...request, lang });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.searchTimeoutMs ?? STOCK_LIMITS.searchTimeoutMs,
    );

    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new StockError(
          `Pixabay ответил ${response.status}`,
          response.status,
          isRetryableStockStatus(response.status),
        );
      }

      const payload = await response.json().catch(() => {
        throw new StockError('Pixabay вернул некорректный JSON', 200, false);
      });
      const assets =
        request.kind === 'video'
          ? normalizeVideoHits(payload)
          : normalizeImageHits(payload);

      await options.cache.set(cacheKey, assets, STOCK_LIMITS.cacheTtlSec);

      return { assets, cached: false };
    } catch (error: unknown) {
      if (error instanceof StockError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new StockError('Pixabay не ответил вовремя', 0, true);
      }

      throw new StockError('Не удалось связаться с Pixabay', 0, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function download(
    asset: StockAsset,
    downloadOptions: StockDownloadOptions,
  ): Promise<StockDownload> {
    await options.limiter.acquire();

    const controller = new AbortController();
    const externalSignal = downloadOptions.signal;

    if (externalSignal?.aborted) {
      controller.abort();
    }

    const onAbort = (): void => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });

    const timeout = setTimeout(
      () => controller.abort(),
      downloadOptions.timeoutMs ??
        options.downloadTimeoutMs ??
        STOCK_LIMITS.downloadTimeoutMs,
    );

    try {
      const response = await fetchImpl(asset.downloadUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new StockError(
          `Pixabay отдал ассет со статусом ${response.status}`,
          response.status,
          isRetryableStockStatus(response.status),
        );
      }

      const contentType = (
        response.headers.get('content-type') ?? ''
      )
        .split(';')[0]
        ?.trim()
        .toLowerCase();
      const expected = asset.kind === 'video' ? 'video/' : 'image/';

      if (!contentType || !contentType.startsWith(expected)) {
        throw new StockError(
          'Pixabay вернул неожиданный тип файла',
          0,
          false,
        );
      }

      return {
        body: await readBodyWithLimit(response, downloadOptions.maxBytes),
        contentType,
      };
    } catch (error: unknown) {
      if (error instanceof StockError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new StockError('Скачивание ассета Pixabay прервано', 0, true);
      }

      throw new StockError('Не удалось скачать ассет Pixabay', 0, true);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  return { search, download };
}
