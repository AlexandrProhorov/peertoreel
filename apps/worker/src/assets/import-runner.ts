import {
  AssetLibraryService,
  buildStarterAssets,
  type AssetBlobStore,
  type AssetRepository,
} from '@peertoreel/assets';
import {
  DEFAULT_STYLE_PRESET_ID,
  type AssetRecord,
  type AssetResolution,
} from '@peertoreel/contracts';

/**
 * Idempotent Tier 0 seeding, testable without a database, S3 or `.env`.
 *
 * `import.ts` owns env/files/stdout; this function owns the library rules:
 * bytes first, hash dedup by `AssetLibraryService`, no row without an object.
 */

export type AssetImportStatus = 'added' | 'existing';

export interface AssetImportEntry {
  readonly key: string;
  readonly contentHash: string;
  readonly objectKey: string;
  readonly status: AssetImportStatus;
}

export interface RunAssetImportOptions {
  readonly repository: AssetRepository;
  readonly blobStore: AssetBlobStore;
  /** UTF-8 SVG source by object key (relative to the public directory). */
  readContent(objectKey: string): Promise<string>;
  /** Raw bytes by object key; must be the same file `readContent` returned. */
  readBytes(objectKey: string): Promise<Uint8Array>;
  readonly styleId?: string;
}

export interface AssetImportSummary {
  readonly entries: readonly AssetImportEntry[];
  readonly added: number;
  readonly existing: number;
}

function resolutionOf(asset: AssetRecord): AssetResolution {
  return {
    asset,
    tier: 'starter',
    cacheHit: false,
    diagnostics: [],
    usage: { provider: null, providerRequests: 0, cacheHits: 0, costUsd: null },
  };
}

export async function runAssetImport(
  options: RunAssetImportOptions,
): Promise<AssetImportSummary> {
  const records = await buildStarterAssets(
    options.readContent,
    options.styleId ?? DEFAULT_STYLE_PRESET_ID,
  );
  const service = new AssetLibraryService({
    repository: options.repository,
    blobStore: options.blobStore,
  });
  const entries: AssetImportEntry[] = [];

  for (const record of records) {
    const variant = record.variants[0];

    if (variant === undefined) {
      throw new Error(`Starter asset "${record.key}" has no variant`);
    }

    const alreadyStored = await options.repository.findByContentHash(
      record.contentHash,
    );
    const persisted = await service.persist(
      resolutionOf(record),
      await options.readBytes(variant.objectKey),
      variant.mimeType,
    );

    entries.push({
      key: record.key,
      contentHash: record.contentHash,
      objectKey: persisted.asset.variants[0]?.objectKey ?? variant.objectKey,
      status: alreadyStored === null ? 'added' : 'existing',
    });
  }

  return {
    entries,
    added: entries.filter((entry) => entry.status === 'added').length,
    existing: entries.filter((entry) => entry.status === 'existing').length,
  };
}
