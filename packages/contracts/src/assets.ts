import { z } from 'zod';
import { jsonObjectSchema, type JsonObject } from './json.js';

/**
 * Asset Library contract (ADR-0017).
 *
 * Everything here is data or a port: the resolver implementation and the
 * normalizers live in `@peertoreel/assets` (Node-only). The renderer receives
 * already-resolved URLs through input props and never imports this port.
 */

export const ASSET_KINDS = ['svg', 'png', 'raster-cutout'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const assetKindSchema = z.enum(ASSET_KINDS);

export const ASSET_SOURCES = [
  'starter',
  'library',
  'llm',
  'recraft',
  'flux',
  'upload',
] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];
export const assetSourceSchema = z.enum(ASSET_SOURCES);

export const ASSET_MIME_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/webp',
] as const;
export type AssetMimeType = (typeof ASSET_MIME_TYPES)[number];
export const assetMimeTypeSchema = z.enum(ASSET_MIME_TYPES);

/** Ordered resolution outcomes reported by the resolver (ADR-0017 D4). */
export const ASSET_RESOLUTION_TIERS = [
  'starter',
  'cache',
  'provider',
  'fallback',
] as const;
export type AssetResolutionTier = (typeof ASSET_RESOLUTION_TIERS)[number];
export const assetResolutionTierSchema = z.enum(ASSET_RESOLUTION_TIERS);

export const ASSET_DIAGNOSTIC_CODES = [
  'starter_hit',
  'cache_hit',
  'tag_match',
  'provider_generated',
  'provider_skipped',
  'deduplicated',
  'fallback_used',
] as const;
export type AssetDiagnosticCode = (typeof ASSET_DIAGNOSTIC_CODES)[number];
export const assetDiagnosticCodeSchema = z.enum(ASSET_DIAGNOSTIC_CODES);

const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Expected a lowercase SHA-256 hex digest');

const assetNameSchema = z.string().min(1).max(200);
const tagSchema = z.string().min(1).max(60);

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export const assetLicenseSchema = z.object({
  /** SPDX id, vendor licence name, or `authored` for in-repo assets. */
  name: z.string().min(1).max(120),
  /** Required: non-commercial assets never enter the production library. */
  commercialUse: z.boolean(),
  attribution: z.string().min(1).max(300).optional(),
});
export type AssetLicense = z.infer<typeof assetLicenseSchema>;

export const assetVariantSchema = z.object({
  id: z.string().min(1).max(80),
  /** `assets/<hash[0..1]>/<hash>/<name>` or a local `assets/starter/...` path. */
  objectKey: z.string().min(1).max(500),
  /** Resolved URL (presigned or data URI) when the caller has one. */
  url: z.string().min(1).max(2_000_000).optional(),
  mimeType: assetMimeTypeSchema,
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  contentHash: sha256Schema,
});
export type AssetVariant = z.infer<typeof assetVariantSchema>;

export const assetRecordSchema = z.object({
  /** Stable id, e.g. `starter/dog-snout` or `library/brick-wall`. */
  id: z.string().min(1).max(200),
  /** Logical key used by request/starter lookups (`dog-snout`, `subject/robot`). */
  key: assetNameSchema,
  source: assetSourceSchema,
  kind: assetKindSchema,
  styleId: z.string().min(1).max(80),
  contentHash: sha256Schema,
  tags: z.array(tagSchema).max(32),
  license: assetLicenseSchema,
  variants: z.array(assetVariantSchema).min(1).max(8),
  metadata: jsonObjectSchema,
});
export type AssetRecord = z.infer<typeof assetRecordSchema>;

/**
 * Logical-key alias for bytes that already exist under another key (ADR-0017
 * D3/D11). `assets.content_hash` is globally unique, so a second logical key
 * cannot get its own row; the alias table makes it addressable without
 * duplicating bytes or re-entering the provider tier.
 */
export const assetAliasSchema = z.object({
  key: assetNameSchema,
  styleId: z.string().min(1).max(80),
  contentHash: sha256Schema,
});
export type AssetAlias = z.infer<typeof assetAliasSchema>;

// ---------------------------------------------------------------------------
// Requests and resolutions
// ---------------------------------------------------------------------------

export const assetRequestSchema = z.object({
  assetKey: assetNameSchema.optional(),
  tags: z.array(tagSchema).max(16).default([]),
  styleId: z.string().min(1).max(80),
  kind: assetKindSchema.default('svg'),
  fallbackKey: assetNameSchema.optional(),
  /**
   * Palette used by normalization. Defaults to the style preset's
   * `assetPalette`; a storyboard may declare its own (ADR-0017 D5/D7).
   */
  assetPalette: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .min(1)
    .max(32)
    .optional(),
  /** Provider prompt; never used when `allowProvider` is false. */
  prompt: z.string().min(1).max(2000).optional(),
  /** Defaults to false: a resolver call must not spend money implicitly. */
  allowProvider: z.boolean().default(false),
});
export type AssetRequest = z.infer<typeof assetRequestSchema>;
export type AssetRequestInput = z.input<typeof assetRequestSchema>;

export function parseAssetRequest(raw: AssetRequestInput): AssetRequest {
  return assetRequestSchema.parse(raw);
}

export const assetDiagnosticSchema = z.object({
  code: assetDiagnosticCodeSchema,
  message: z.string().min(1).max(500),
  assetKey: z.string().min(1).max(200).optional(),
});
export type AssetDiagnostic = z.infer<typeof assetDiagnosticSchema>;

/**
 * Usage reported by the provider. `costUsd: null` means "not measured"; it is
 * never filled with an estimate (root hard rule 7).
 */
export const assetUsageSchema = z.object({
  provider: z.string().min(1).max(120).nullable(),
  providerRequests: z.number().int().min(0),
  cacheHits: z.number().int().min(0),
  costUsd: z.number().min(0).nullable(),
});
export type AssetUsage = z.infer<typeof assetUsageSchema>;

export const assetResolutionSchema = z.object({
  asset: assetRecordSchema,
  tier: assetResolutionTierSchema,
  cacheHit: z.boolean(),
  diagnostics: z.array(assetDiagnosticSchema),
  usage: assetUsageSchema,
});
export type AssetResolution = z.infer<typeof assetResolutionSchema>;

// ---------------------------------------------------------------------------
// Object keys
// ---------------------------------------------------------------------------

/**
 * Content-addressed object key. The file name is a pure function of the hash,
 * so one blob can never acquire two keys. One format shared by the resolver,
 * the DB row and `@peertoreel/storage`; changing it is a data migration.
 */
export function buildAssetObjectKey(
  contentHash: string,
  extension: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error('Asset object key needs a lowercase SHA-256 hex digest');
  }

  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  if (!safeExtension) {
    throw new Error('Asset object key needs a file extension');
  }

  return `assets/${contentHash.slice(0, 2)}/${contentHash}/${contentHash}.${safeExtension}`;
}

/**
 * Stable logical id derived from `source` + `key`, so a DB adapter can rebuild
 * the contract `AssetRecord.id` without a second column (ADR-0017 D2).
 */
export function buildAssetId(source: AssetSource, key: string): string {
  const safeKey = key.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

  if (safeKey.length === 0) {
    throw new Error('Asset id needs a key');
  }

  return `${source}/${safeKey}`;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface ImageProviderRequest {
  /** Logical asset key the caller asked for (`subject/dog-wet-nose`). */
  readonly key: string;
  readonly prompt: string;
  readonly kind: AssetKind;
  readonly styleId: string;
  readonly tags: readonly string[];
  /**
   * Palette the caller wants the subject normalized to; adapters may forward it
   * as provider controls (Recraft `controls.colors`). Optional and additive.
   */
  readonly palette?: readonly string[];
}

export interface ImageProviderAsset {
  /** UTF-8 SVG source, or base64 bytes for raster kinds. */
  readonly data: string;
  readonly encoding: 'utf8' | 'base64';
  readonly mimeType: AssetMimeType;
  readonly width: number;
  readonly height: number;
  readonly license: AssetLicense;
}

export interface ImageProviderResult {
  readonly asset: ImageProviderAsset;
  readonly provider: string;
  readonly model: string;
  /** Library source for the generated record; defaults to `library`. */
  readonly source?: AssetSource;
  /** Real measured cost, or null when the provider does not report it. */
  readonly costUsd: number | null;
  /** Billable units the provider reported (credits/MP); null when unreported. */
  readonly units?: number | null;
}

/**
 * One append-only provider-spend row (ADR-0017 D11, root hard rule 7).
 * `costUsd: null` means "not measured" and must never become `0`.
 */
export const providerUsageEntrySchema = z.object({
  provider: z.string().min(1).max(120),
  /** Logical call name (`image.generate`, `image.vectorize`, …). */
  operation: z.string().min(1).max(120),
  model: z.string().min(1).max(200).nullable(),
  /** Run that paid for the call; null for CLI/import work. */
  runId: z.string().uuid().nullable(),
  /** Where the call happened: `assets`, `cli`, … */
  source: z.string().min(1).max(60),
  units: z.number().int().min(0).nullable(),
  costUsd: z.number().min(0).nullable(),
  meta: jsonObjectSchema,
});
export type ProviderUsageEntry = z.infer<typeof providerUsageEntrySchema>;

export interface ImageProvider {
  readonly id: string;
  readonly enabled: boolean;
  supports(kind: AssetKind): boolean;
  generate(request: ImageProviderRequest): Promise<ImageProviderResult>;
}

export interface AssetResolver {
  resolve(request: AssetRequestInput): Promise<AssetResolution>;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class UnknownAssetError extends Error {
  constructor(
    readonly assetKey: string | null,
    readonly tags: readonly string[],
    readonly styleId: string,
  ) {
    super(
      `No asset for key "${assetKey ?? '(none)'}" tags ${JSON.stringify(tags)} in style "${styleId}"`,
    );
    this.name = 'UnknownAssetError';
  }
}

export class AssetLicenseError extends Error {
  constructor(
    readonly assetKey: string,
    readonly license: AssetLicense,
  ) {
    super(
      `Asset "${assetKey}" is licensed "${license.name}" without commercial use`,
    );
    this.name = 'AssetLicenseError';
  }
}

export class ProviderUnavailableError extends Error {
  constructor(
    readonly providerId: string | null,
    readonly reason: string,
  ) {
    super(
      `Image provider "${providerId ?? '(none)'}" is unavailable: ${reason}`,
    );
    this.name = 'ProviderUnavailableError';
  }
}

export class UnsupportedAssetKindError extends Error {
  constructor(
    readonly kind: AssetKind,
    readonly providerId: string | null,
  ) {
    super(
      `Asset kind "${kind}" is not supported${providerId ? ` by provider "${providerId}"` : ' by this resolver'}`,
    );
    this.name = 'UnsupportedAssetKindError';
  }
}

/** Provider output that cannot be normalized (invalid SVG, unknown encoding). */
export class InvalidAssetError extends Error {
  constructor(
    readonly assetKey: string,
    readonly providerId: string | null,
    readonly reason: string,
  ) {
    super(
      `Asset "${assetKey}" from provider "${providerId ?? '(none)'}" is invalid: ${reason}`,
    );
    this.name = 'InvalidAssetError';
  }
}

/** Narrow `unknown` from a provider/adapter boundary into the contract type. */
export function isAssetRecord(value: unknown): value is AssetRecord {
  return assetRecordSchema.safeParse(value).success;
}

export type AssetMetadata = JsonObject;
