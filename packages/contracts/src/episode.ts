import { z } from 'zod';
import {
  assetDiagnosticSchema,
  assetResolutionTierSchema,
} from './assets.js';
import { storyboardSchema } from './storyboard.js';

/**
 * M3.5.1 episode mode: the prototype path DeepSeek → Google TTS → Pixabay →
 * Remotion. Both artifacts live in S3 and are read by the render processor.
 */

/** Google Translate TTS is unofficial and free; recorded verbatim in the manifest. */
export const EPISODE_TTS_PROVIDER = 'google-translate-spike' as const;

/** Pixabay's own licence name; we store the string, not an SPDX identifier. */
export const EPISODE_STOCK_LICENSE = 'pixabay-content-license' as const;

/**
 * Where episode subject images come from (M3.6b.9). `pixabay` is the default
 * until the DeepSeek SVG mode passes acceptance; one env variable rolls back.
 */
export const EPISODE_VISUAL_SOURCES = ['pixabay', 'deepseek-svg'] as const;
export type EpisodeVisualSource = (typeof EPISODE_VISUAL_SOURCES)[number];

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
 * One subject slot that got real media. `reference` is the asset reference the
 * storyboard uses (`assets/starter/dog-snout.svg` or a key), so the renderer
 * CLI can inject the URL without knowing about Pixabay or DeepSeek.
 *
 * M3.6b.9: the shape is source-agnostic. Pixabay rows keep `pageUrl`,
 * `downloadUrl` and `author`; generated SVG rows leave them null and carry the
 * resolver tier, diagnostics and measured cost instead.
 */
export const episodeVisualSchema = z.object({
  sceneId: z.string().min(1),
  sceneIdx: z.number().int().nonnegative(),
  reference: z.string().min(1).max(500),
  source: z.enum(EPISODE_VISUAL_SOURCES).default('pixabay'),
  tier: assetResolutionTierSchema.default('provider'),
  provider: z.string().min(1),
  providerAssetId: z.string().min(1),
  pageUrl: z.url().nullable(),
  author: z.string().min(1).nullable(),
  license: z.string().min(1),
  downloadUrl: z.url().nullable(),
  tags: z.array(z.string().min(1)),
  query: z.string().min(1).max(240).nullable(),
  cached: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().positive(),
  dataUri: dataUriSchema,
  /** Measured provider cost; null means "not measured", never an estimate. */
  costUsd: z.number().nonnegative().nullable().default(null),
  diagnostics: z.array(assetDiagnosticSchema).default([]),
  prompt: z.string().min(1).max(2000).nullable().default(null),
});
export type EpisodeVisual = z.infer<typeof episodeVisualSchema>;

/**
 * Resolution outcome for every subject slot, including slots that stayed on
 * Tier 0. The UI reads this list: tier, source badge, cost and diagnostic
 * codes per subject (M3.6b.9).
 */
export const episodeSubjectDecisionSchema = z.object({
  sceneId: z.string().min(1),
  sceneIdx: z.number().int().nonnegative(),
  reference: z.string().min(1).max(500),
  /** `tier0` means the renderer draws the local starter asset. */
  source: z.enum([...EPISODE_VISUAL_SOURCES, 'tier0'] as const),
  tier: assetResolutionTierSchema,
  provider: z.string().min(1).nullable(),
  costUsd: z.number().nonnegative().nullable(),
  prompt: z.string().min(1).max(2000).nullable(),
  diagnostics: z.array(assetDiagnosticSchema),
});
export type EpisodeSubjectDecision = z.infer<
  typeof episodeSubjectDecisionSchema
>;

/** `runs/<runId>/episode/visuals.json` — subject references → image metadata. */
export const episodeVisualsArtifactSchema = z.object({
  /** Selected source; an artifact from before M3.6b.9 defaults to Pixabay. */
  source: z.enum(EPISODE_VISUAL_SOURCES).default('pixabay'),
  images: z.array(episodeVisualSchema),
  /** One entry per subject slot, Tier 0 included (default for old artifacts). */
  subjects: z.array(episodeSubjectDecisionSchema).default([]),
  /** Real provider calls (Pixabay search/download, DeepSeek attempts). */
  providerRequests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  /** Subjects that stayed on Tier 0: no result, no image or a rejected file. */
  skipped: z.number().int().nonnegative(),
  /** Measured total; null when at least one paid call did not report cost. */
  costUsd: z.number().nonnegative().nullable().default(null),
  /** True when the run budget stopped generation for the remaining slots. */
  providerDisabledByBudget: z.boolean().default(false),
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
  /** `pixabay` or `deepseek-svg` (M3.6b.9). */
  provider: z.string().min(1),
  queries: z.number().int().nonnegative(),
  providerRequests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Free for Pixabay; measured tokens × tariff for DeepSeek, else null. */
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

/**
 * One API payload for the storyboard preview: the UI never downloads or parses
 * S3 objects itself. `visuals` and `manifest` are mandatory because a preview
 * without them would silently hide missing images or fake the usage numbers.
 */
export const runStoryboardResponseSchema = z.object({
  storyboard: storyboardSchema,
  visuals: episodeVisualsArtifactSchema,
  manifest: episodeManifestSchema,
});
export type RunStoryboardResponse = z.infer<typeof runStoryboardResponseSchema>;
