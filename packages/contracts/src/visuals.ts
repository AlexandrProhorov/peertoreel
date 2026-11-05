import { z } from 'zod';

export const stockAssetKindSchema = z.enum(['video', 'image']);
export type StockAssetKind = z.infer<typeof stockAssetKindSchema>;

/**
 * A candidate returned by a stock provider. `downloadUrl` is transient: it is
 * used to fetch the file and is never persisted in the visuals manifest.
 */
export const stockAssetSchema = z.object({
  provider: z.string().min(1),
  providerAssetId: z.string().min(1),
  kind: stockAssetKindSchema,
  downloadUrl: z.url(),
  pageUrl: z.url(),
  author: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSec: z.number().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  /** Pixabay tags, used for anchor/relevance filtering. Not persisted. */
  tags: z.array(z.string().min(1)),
  /** Position in the provider response; lower is more relevant. */
  rank: z.number().int().nonnegative(),
});
export type StockAsset = z.infer<typeof stockAssetSchema>;

export const stockSearchRequestSchema = z.object({
  query: z.string().min(1).max(240),
  kind: stockAssetKindSchema,
  page: z.number().int().positive().default(1),
  perPage: z.number().int().min(3).max(5).default(5),
  lang: z.string().min(2).max(8).optional(),
});
export type StockSearchRequest = z.input<typeof stockSearchRequestSchema>;

export interface StockSearchResult {
  assets: StockAsset[];
  /** True when the result came from the provider cache, not a network call. */
  cached: boolean;
}

export interface StockDownloadOptions {
  maxBytes: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StockDownload {
  body: Uint8Array;
  contentType: string;
}

/** Port implemented by stock providers (Pixabay today). No vendor SDK leaks out. */
export interface StockProvider {
  search(request: StockSearchRequest): Promise<StockSearchResult>;
  download(
    asset: StockAsset,
    options: StockDownloadOptions,
  ): Promise<StockDownload>;
}

export const visualScenePartSchema = z.enum(['hook', 'beat', 'cta']);
export type VisualScenePart = z.infer<typeof visualScenePartSchema>;

const fallbackSceneAssetSchema = z.object({
  kind: z.literal('fallback'),
  objectKey: z.null(),
  contentType: z.null(),
  width: z.null(),
  height: z.null(),
  provider: z.null(),
  providerAssetId: z.null(),
  author: z.null(),
  pageUrl: z.null(),
});

const mediaSceneAssetSchema = z.object({
  kind: z.enum(['video', 'image']),
  objectKey: z.string().min(1),
  contentType: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  provider: z.string().min(1).nullable(),
  providerAssetId: z.string().min(1).nullable(),
  author: z.string().min(1).nullable(),
  pageUrl: z.url().nullable(),
});

export const visualSceneAssetSchema = z.discriminatedUnion('kind', [
  fallbackSceneAssetSchema,
  mediaSceneAssetSchema,
]);
export type VisualSceneAsset = z.infer<typeof visualSceneAssetSchema>;

export const visualSceneSchema = z
  .object({
    idx: z.number().int().nonnegative(),
    part: visualScenePartSchema,
    beatIndex: z.number().int().nonnegative().nullable(),
    text: z.string().min(1),
    visualDirection: z.string().min(3),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    asset: visualSceneAssetSchema,
  })
  .refine((scene) => scene.endSec > scene.startSec, {
    message: 'Scene end must be after its start',
    path: ['endSec'],
  });
export type VisualScene = z.infer<typeof visualSceneSchema>;

/** `runs/<runId>/visuals/visuals.json` — the only input of the render stage. */
export const visualsArtifactSchema = z
  .object({
    scenes: z.array(visualSceneSchema).min(1),
    durationSec: z.number().positive(),
    /** Real Pixabay HTTP calls (search + download attempts), not an estimate. */
    providerRequests: z.number().int().nonnegative(),
    /** Search results served from the 24 h cache. */
    cacheHits: z.number().int().nonnegative(),
  })
  .refine(
    (manifest) =>
      new Set(manifest.scenes.map((scene) => scene.idx)).size ===
      manifest.scenes.length,
    { message: 'Scene indexes must be unique', path: ['scenes'] },
  );
export type VisualsArtifact = z.infer<typeof visualsArtifactSchema>;
