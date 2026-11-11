import {
  buildAssetObjectKey,
  type AssetMimeType,
  type AssetRecord,
  type AssetRequestInput,
  type AssetResolution,
  type AssetResolver,
  type AssetVariant,
} from '@peertoreel/contracts';
import type { AssetBlobStore } from './blob-store.js';
import { sha256Hex } from './content-hash.js';
import type { AssetRepository } from './repository.js';

/**
 * Persistence orchestration for the Asset Library (ADR-0017 D10).
 *
 * Order matters: bytes first (content-addressed, immutable), row second. A hash
 * hit reuses the existing record and never uploads a second copy. The service
 * never calls a provider — it only stores what the resolver already produced —
 * and it never estimates cost.
 */

export const DEFAULT_ASSET_URL_TTL_SEC = 3600;

const EXTENSION_BY_MIME: Readonly<Record<AssetMimeType, string>> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForAssetMimeType(mimeType: AssetMimeType): string {
  return EXTENSION_BY_MIME[mimeType];
}

export interface AssetLibraryServiceOptions {
  readonly repository: AssetRepository;
  readonly blobStore: AssetBlobStore;
  /** Needed only for `resolveAndPersist`; plain `persist` stores a resolution. */
  readonly resolver?: AssetResolver | null;
  /** Presigned URL lifetime; must outlast a render. Defaults to one hour. */
  readonly urlTtlSec?: number;
}

/** Immutable, content-addressed key for one variant's bytes. */
export function contentAddressedVariant(
  variant: AssetVariant,
  objectKey: string,
  mimeType: AssetMimeType,
): AssetVariant {
  return {
    id: variant.id,
    objectKey,
    mimeType,
    width: variant.width,
    height: variant.height,
    contentHash: variant.contentHash,
  };
}

export class AssetLibraryService {
  private readonly repository: AssetRepository;
  private readonly blobStore: AssetBlobStore;
  private readonly resolver: AssetResolver | null;
  private readonly urlTtlSec: number;

  constructor(options: AssetLibraryServiceOptions) {
    this.repository = options.repository;
    this.blobStore = options.blobStore;
    this.resolver = options.resolver ?? null;
    this.urlTtlSec = options.urlTtlSec ?? DEFAULT_ASSET_URL_TTL_SEC;
  }

  /**
   * Store one resolution: upload the bytes (unless these bytes already exist),
   * upsert the record and return the same resolution with presigned URLs.
   *
   * `bytes` must hash to `resolution.asset.contentHash`; a mismatch means the
   * caller read the wrong file and is rejected instead of poisoning the cache.
   */
  async persist(
    resolution: AssetResolution,
    bytes: Uint8Array,
    mimeType: AssetMimeType,
  ): Promise<AssetResolution> {
    const record = resolution.asset;
    const contentHash = sha256Hex(bytes);

    if (contentHash !== record.contentHash) {
      throw new Error(
        `Asset "${record.key}" bytes hash to ${contentHash}, but the record declares ${record.contentHash}`,
      );
    }

    for (const variant of record.variants) {
      if (variant.contentHash !== contentHash) {
        throw new Error(
          `Asset "${record.key}" variant "${variant.id}" has its own bytes; persist one variant at a time`,
        );
      }

      if (variant.mimeType !== mimeType) {
        throw new Error(
          `Asset "${record.key}" variant "${variant.id}" is ${variant.mimeType}, but ${mimeType} bytes were supplied`,
        );
      }
    }

    const existing = await this.repository.findByContentHash(contentHash);

    if (existing !== null) {
      await this.ensureBytes(existing, bytes, mimeType);

      return this.withUrls({ ...resolution, asset: existing });
    }

    const objectKey = buildAssetObjectKey(
      contentHash,
      extensionForAssetMimeType(mimeType),
    );
    const stored: AssetRecord = {
      ...record,
      variants: record.variants.map((variant) =>
        contentAddressedVariant(variant, objectKey, mimeType),
      ),
    };

    if (!(await this.blobStore.exists(objectKey))) {
      await this.blobStore.put(objectKey, bytes, mimeType);
    }

    const saved = await this.repository.save(stored);

    return this.withUrls({ ...resolution, asset: saved });
  }

  /**
   * Attach presigned URLs to an already-persisted record; no writes.
   *
   * Every variant must be content-addressed and its object must exist: signing
   * a missing object would turn a library inconsistency into a 404 inside the
   * renderer instead of a visible error here.
   */
  async withUrls(resolution: AssetResolution): Promise<AssetResolution> {
    const variants: AssetVariant[] = [];

    for (const variant of resolution.asset.variants) {
      const expectedKey = buildAssetObjectKey(
        variant.contentHash,
        extensionForAssetMimeType(variant.mimeType),
      );

      if (variant.objectKey !== expectedKey) {
        throw new Error(
          `Asset "${resolution.asset.key}" variant "${variant.id}" is stored under "${variant.objectKey}", not the content-addressed "${expectedKey}"`,
        );
      }
      if (!(await this.blobStore.exists(expectedKey))) {
        throw new Error(
          `Asset "${resolution.asset.key}" variant "${variant.id}" has no object at "${expectedKey}"`,
        );
      }

      variants.push({
        ...variant,
        url: await this.blobStore.urlFor(expectedKey, this.urlTtlSec),
      });
    }

    return { ...resolution, asset: { ...resolution.asset, variants } };
  }

  /**
   * Resolve through the injected resolver and persist the result. Bytes are
   * read after resolution and immediately verified against the record hash, so
   * a resolver that already saved the row cannot leave wrong bytes behind.
   */
  async resolveAndPersist(
    request: AssetRequestInput,
    readBytes: (variant: AssetVariant) => Promise<Uint8Array>,
  ): Promise<AssetResolution> {
    if (this.resolver === null) {
      throw new Error(
        'AssetLibraryService.resolveAndPersist needs a resolver in its options',
      );
    }

    const resolution = await this.resolver.resolve(request);
    const primary = resolution.asset.variants[0];

    if (primary === undefined) {
      throw new Error(
        `Asset "${resolution.asset.key}" resolved without a variant`,
      );
    }

    const existing = await this.repository.findByContentHash(
      resolution.asset.contentHash,
    );

    if (existing !== null) {
      await this.ensureBytes(
        existing,
        await readBytes(primary),
        primary.mimeType,
      );

      return this.withUrls({ ...resolution, asset: existing });
    }

    return this.persist(resolution, await readBytes(primary), primary.mimeType);
  }

  /** A resolver that already saved the row may not have uploaded the bytes. */
  private async ensureBytes(
    record: AssetRecord,
    bytes: Uint8Array,
    mimeType: AssetMimeType,
  ): Promise<void> {
    const primary = record.variants[0];

    if (primary === undefined) {
      throw new Error(`Asset "${record.key}" has no variants`);
    }
    if (primary.mimeType !== mimeType) {
      throw new Error(
        `Asset "${record.key}" stores ${primary.mimeType}, but ${mimeType} bytes were supplied`,
      );
    }

    const contentHash = sha256Hex(bytes);

    if (contentHash !== primary.contentHash) {
      throw new Error(
        `Asset "${record.key}" bytes hash to ${contentHash}, but the stored variant declares ${primary.contentHash}`,
      );
    }

    const expectedKey = buildAssetObjectKey(
      contentHash,
      extensionForAssetMimeType(mimeType),
    );

    if (primary.objectKey !== expectedKey) {
      throw new Error(
        `Asset "${record.key}" is stored under "${primary.objectKey}", not the content-addressed "${expectedKey}"`,
      );
    }
    if (!(await this.blobStore.exists(expectedKey))) {
      await this.blobStore.put(expectedKey, bytes, mimeType);
    }
  }
}
