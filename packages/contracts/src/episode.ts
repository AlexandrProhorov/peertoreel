import { z } from 'zod';

/**
 * M3.5.1 episode mode: the prototype path DeepSeek → Google TTS → Pixabay →
 * Remotion. Both artifacts live in S3 and are read by the render processor.
 */

/** Google Translate TTS is unofficial and free; recorded verbatim in the manifest. */
export const EPISODE_TTS_PROVIDER = 'google-translate-spike' as const;

/** Pixabay's own licence name; we store the string, not an SPDX identifier. */
export const EPISODE_STOCK_LICENSE = 'pixabay-content-license' as const;

/**
 * The renderer receives assets as input props capped at 2 MB per URL, so an
 * episode image must stay comfortably below that after base64 encoding.
 */
export const EPISODE_IMAGE_MAX_BYTES = 1_400_000;

const dataUriSchema = z
  .string()
  .startsWith('data:image/')
  .max(2_000_000);

/**
 * One subject slot that got a real Pixabay image. `reference` is the asset
 * reference the storyboard uses (`assets/starter/dog-snout.svg` or a key), so
 * the renderer CLI can inject the URL without knowing about Pixabay.
 */
export const episodeVisualSchema = z.object({
  sceneId: z.string().min(1),
  sceneIdx: z.number().int().nonnegative(),
  reference: z.string().min(1).max(500),
  provider: z.literal('pixabay'),
  providerAssetId: z.string().min(1),
  pageUrl: z.url(),
  author: z.string().min(1),
  license: z.literal(EPISODE_STOCK_LICENSE),
  downloadUrl: z.url(),
  tags: z.array(z.string().min(1)),
  query: z.string().min(1).max(240),
  cached: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().positive(),
  dataUri: dataUriSchema,
});
export type EpisodeVisual = z.infer<typeof episodeVisualSchema>;

/** `runs/<runId>/episode/visuals.json` — subject references → image metadata. */
export const episodeVisualsArtifactSchema = z.object({
  images: z.array(episodeVisualSchema),
  /** Real Pixabay search calls (cache misses), not an estimate. */
  providerRequests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  /** Subjects that stayed on Tier 0: no result, no image or a rejected file. */
  skipped: z.number().int().nonnegative(),
});
export type EpisodeVisualsArtifact = z.infer<
  typeof episodeVisualsArtifactSchema
>;

const episodeLlmUsageSchema = z.object({
  provider: z.literal('deepseek'),
  model: z.string().min(1),
  attempts: z.number().int().positive(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  /** DeepSeek reports tokens, not money: `null` means "not measured". */
  costUsd: z.number().nonnegative().nullable(),
});

const episodeTtsUsageSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  characters: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  audioDurationSec: z.number().positive(),
  bytes: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  /** Google Translate TTS is free, so the measured cost is exactly 0. */
  costUsd: z.number().nonnegative().nullable(),
});

const episodeStockUsageSchema = z.object({
  provider: z.literal('pixabay'),
  queries: z.number().int().nonnegative(),
  providerRequests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Free under the Pixabay Content License. */
  costUsd: z.number().nonnegative().nullable(),
});

const episodeRenderUsageSchema = z.object({
  scenesMs: z.number().nonnegative(),
  concatMs: z.number().nonnegative(),
  finalMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative(),
  injectedAssets: z.number().int().nonnegative(),
  /** Local FFmpeg + Remotion: no provider bill. */
  costUsd: z.number().nonnegative().nullable(),
  finishedAt: z.iso.datetime(),
});

/** `runs/<runId>/episode/manifest.json` — real usage, never invented numbers. */
export const episodeManifestSchema = z.object({
  kind: z.literal('m3.5.1-episode'),
  topic: z.string().min(1).max(300),
  title: z.string().min(1),
  generatedAt: z.iso.datetime(),
  totalMs: z.number().nonnegative(),
  llm: episodeLlmUsageSchema,
  tts: episodeTtsUsageSchema,
  stock: episodeStockUsageSchema,
  render: episodeRenderUsageSchema.optional(),
});
export type EpisodeManifest = z.infer<typeof episodeManifestSchema>;
