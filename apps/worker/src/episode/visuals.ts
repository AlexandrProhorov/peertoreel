import {
  EPISODE_IMAGE_MAX_BYTES,
  EPISODE_STOCK_LICENSE,
  episodeVisualSchema,
  episodeVisualsArtifactSchema,
  type EpisodeVisual,
  type EpisodeVisualsArtifact,
  type StockProvider,
} from '@peertoreel/contracts';
import type { Logger } from 'pino';
import { StockError } from '../stock/errors.js';
import { STOCK_LIMITS } from '../stock/limits.js';
import type { EpisodeSubject } from './subjects.js';

export interface EpisodeVisualsResult {
  artifact: EpisodeVisualsArtifact;
  /** Unique subject references searched (not the number of scenes). */
  queries: number;
}

function dataUriFor(contentType: string, body: Uint8Array): string {
  return `data:${contentType};base64,${Buffer.from(body).toString('base64')}`;
}

async function imageForSubject(
  subject: EpisodeSubject,
  provider: StockProvider,
  logger: Logger,
): Promise<{
  visual: Omit<EpisodeVisual, 'sceneId' | 'sceneIdx'> | null;
  requests: number;
  cacheHits: number;
}> {
  let result: Awaited<ReturnType<StockProvider['search']>>;

  try {
    result = await provider.search({
      query: subject.query,
      kind: 'image',
      page: 1,
      perPage: 3,
      ...(subject.lang === undefined ? {} : { lang: subject.lang }),
    });
  } catch (error: unknown) {
    if (error instanceof StockError && !error.retryable) {
      logger.warn(
        { reference: subject.reference, reason: error.message },
        'episode image search failed; keeping the starter asset',
      );

      return { visual: null, requests: 0, cacheHits: 0 };
    }

    throw error;
  }

  const asset = result.assets[0];
  const requests = result.cached ? 0 : 1;
  const cacheHits = result.cached ? 1 : 0;

  if (asset === undefined) {
    return { visual: null, requests, cacheHits };
  }

  let downloaded: Awaited<ReturnType<StockProvider['download']>>;

  try {
    downloaded = await provider.download(asset, {
      maxBytes: EPISODE_IMAGE_MAX_BYTES,
      timeoutMs: STOCK_LIMITS.downloadTimeoutMs,
    });
  } catch (error: unknown) {
    if (error instanceof StockError && !error.retryable) {
      logger.warn(
        { reference: subject.reference, reason: error.message },
        'episode image download failed; keeping the starter asset',
      );

      return { visual: null, requests: requests + 1, cacheHits };
    }

    throw error;
  }

  const contentType =
    downloaded.contentType.split(';')[0]?.trim().toLowerCase() ??
    downloaded.contentType;

  if (!contentType.startsWith('image/')) {
    return { visual: null, requests: requests + 1, cacheHits };
  }

  const dataUri = dataUriFor(contentType, downloaded.body);

  // Remotion input props cap a URL at 2 MB; keep the starter instead of failing.
  if (dataUri.length > 2_000_000) {
    logger.warn(
      { reference: subject.reference, bytes: downloaded.body.byteLength },
      'episode image is too large for input props; keeping the starter asset',
    );

    return { visual: null, requests: requests + 1, cacheHits };
  }

  return {
    requests: requests + 1,
    cacheHits,
    visual: {
      reference: subject.reference,
      provider: 'pixabay',
      providerAssetId: asset.providerAssetId,
      pageUrl: asset.pageUrl,
      author: asset.author,
      license: EPISODE_STOCK_LICENSE,
      downloadUrl: asset.downloadUrl,
      tags: [...asset.tags],
      query: subject.query,
      cached: result.cached,
      width: asset.width,
      height: asset.height,
      bytes: downloaded.body.byteLength,
      dataUri,
    },
  };
}

/**
 * One Pixabay image per unique subject reference. Scenes that share a subject
 * reuse the same image; subjects without a usable photo stay on Tier 0.
 */
export async function fetchEpisodeVisuals(
  subjects: readonly EpisodeSubject[],
  provider: StockProvider,
  logger: Logger,
): Promise<EpisodeVisualsResult> {
  const byReference = new Map<
    string,
    Omit<EpisodeVisual, 'sceneId' | 'sceneIdx'> | null
  >();
  let providerRequests = 0;
  let cacheHits = 0;
  let queries = 0;
  let skipped = 0;

  for (const subject of subjects) {
    if (byReference.has(subject.reference)) {
      continue;
    }

    const result = await imageForSubject(subject, provider, logger);

    queries += 1;
    providerRequests += result.requests;
    cacheHits += result.cacheHits;
    byReference.set(subject.reference, result.visual);
  }

  const images: EpisodeVisual[] = [];

  for (const subject of subjects) {
    const visual = byReference.get(subject.reference) ?? null;

    if (visual === null) {
      skipped += 1;
      continue;
    }

    images.push(
      episodeVisualSchema.parse({
        ...visual,
        sceneId: subject.sceneId,
        sceneIdx: subject.sceneIdx,
      }),
    );
  }

  return {
    queries,
    artifact: episodeVisualsArtifactSchema.parse({
      images,
      providerRequests,
      cacheHits,
      skipped,
    }),
  };
}
