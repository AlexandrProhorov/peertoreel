import {
  buildAssetObjectKey,
  type AssetRecord,
  type AssetResolution,
  type AssetVariant,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryAssetBlobStore } from './blob-store.js';
import { sha256Hex } from './content-hash.js';
import { AssetLibraryService } from './library-service.js';
import { createFakeImageProvider } from './provider-fake.js';
import { InMemoryAssetRepository } from './repository.js';
import { TieredAssetResolver } from './resolver.js';

const STYLE_ID = 'studio_flat_2d_v1';
const SVG = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#F59E0B"/></svg>';
const BYTES = new TextEncoder().encode(SVG);
const HASH = sha256Hex(BYTES);
const OBJECT_KEY = buildAssetObjectKey(HASH, 'svg');

/**
 * Mirrors `DrizzleAssetRepository`: a row has no `url` column, so `save`
 * returns stored data without the ephemeral data URI. The in-memory fake keeps
 * it, which is exactly how a persistence bug can hide.
 */
class UrlStrippingRepository extends InMemoryAssetRepository {
  override async save(record: AssetRecord): Promise<AssetRecord> {
    const saved = await super.save(record);

    return {
      ...saved,
      variants: saved.variants.map((variant) => ({
        id: variant.id,
        objectKey: variant.objectKey,
        mimeType: variant.mimeType,
        width: variant.width,
        height: variant.height,
        contentHash: variant.contentHash,
      })),
    };
  }
}

function record(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'starter/ball',
    key: 'ball',
    source: 'starter',
    kind: 'svg',
    styleId: STYLE_ID,
    contentHash: HASH,
    tags: ['ball', 'circle'],
    license: { name: 'authored', commercialUse: true },
    variants: [
      {
        id: 'default',
        objectKey: 'assets/starter/ball.svg',
        mimeType: 'image/svg+xml',
        width: 10,
        height: 10,
        contentHash: HASH,
      },
    ],
    metadata: {},
    ...overrides,
  };
}

function resolutionFor(asset: AssetRecord): AssetResolution {
  return {
    asset,
    tier: 'starter',
    cacheHit: false,
    diagnostics: [],
    usage: { provider: null, providerRequests: 0, cacheHits: 0, costUsd: null },
  };
}

function createService() {
  const repository = new InMemoryAssetRepository();
  const blobStore = new InMemoryAssetBlobStore();
  const service = new AssetLibraryService({ repository, blobStore });

  return { repository, blobStore, service };
}

function dataUriBytes(variant: AssetVariant): Uint8Array {
  const encoded = variant.url?.split(',')[1];

  if (encoded === undefined) {
    throw new Error('expected a data URI variant');
  }

  return new Uint8Array(Buffer.from(encoded, 'base64'));
}

describe('AssetLibraryService.persist', () => {
  it('rewrites the variant to a content-addressed key and uploads once', async () => {
    const { repository, blobStore, service } = createService();

    const persisted = await service.persist(
      resolutionFor(record()),
      BYTES,
      'image/svg+xml',
    );

    expect(blobStore.putCount).toBe(1);
    expect(blobStore.objectKeys()).toEqual([OBJECT_KEY]);
    expect(persisted.asset.variants[0]?.objectKey).toBe(OBJECT_KEY);
    expect(persisted.asset.variants[0]?.url).toBe(`memory://${OBJECT_KEY}`);
    expect(await repository.findByContentHash(HASH)).not.toBeNull();
  });

  it('is idempotent: a second persist neither uploads nor duplicates rows', async () => {
    const { repository, blobStore, service } = createService();
    const first = await service.persist(
      resolutionFor(record()),
      BYTES,
      'image/svg+xml',
    );
    const second = await service.persist(
      resolutionFor(record()),
      BYTES,
      'image/svg+xml',
    );

    expect(blobStore.putCount).toBe(1);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await repository.listByStyle(STYLE_ID)).toHaveLength(1);
  });

  it('returns the record that owns the bytes on a hash hit with another key', async () => {
    const { service } = createService();
    const owner = record({ id: 'starter/ball', key: 'ball' });

    await service.persist(resolutionFor(owner), BYTES, 'image/svg+xml');

    const aliased = await service.persist(
      resolutionFor(record({ id: 'library/orb', key: 'orb', source: 'library' })),
      BYTES,
      'image/svg+xml',
    );

    expect(aliased.asset.key).toBe('ball');
  });

  it('uploads missing bytes for a record the resolver already saved', async () => {
    const { repository, blobStore, service } = createService();
    const base = record();
    const primary = base.variants[0];

    if (primary === undefined) {
      throw new Error('fixture needs a variant');
    }

    await repository.save({
      ...base,
      variants: [{ ...primary, objectKey: OBJECT_KEY }],
    });

    const persisted = await service.persist(
      resolutionFor(record()),
      BYTES,
      'image/svg+xml',
    );

    expect(blobStore.putCount).toBe(1);
    expect(persisted.asset.variants[0]?.url).toBe(`memory://${OBJECT_KEY}`);
  });

  it('rejects a stored row that is not content-addressed', async () => {
    const repository = new InMemoryAssetRepository([record()]);
    const service = new AssetLibraryService({
      repository,
      blobStore: new InMemoryAssetBlobStore(),
    });

    await expect(
      service.persist(resolutionFor(record()), BYTES, 'image/svg+xml'),
    ).rejects.toThrow(/not the content-addressed/);
  });

  it('rejects bytes that do not match the record hash', async () => {
    const { blobStore, service } = createService();

    await expect(
      service.persist(
        resolutionFor(record()),
        new TextEncoder().encode('<svg>other</svg>'),
        'image/svg+xml',
      ),
    ).rejects.toThrow(/bytes hash to/);
    expect(blobStore.putCount).toBe(0);
  });

  it('rejects a variant whose bytes were not supplied', async () => {
    const { service } = createService();
    const twoVariants = record({
      variants: [
        ...record().variants,
        {
          id: 'outline',
          objectKey: 'assets/starter/ball-outline.svg',
          mimeType: 'image/svg+xml',
          width: 10,
          height: 10,
          contentHash: sha256Hex('other'),
        },
      ],
    });

    await expect(
      service.persist(resolutionFor(twoVariants), BYTES, 'image/svg+xml'),
    ).rejects.toThrow(/own bytes/);
  });
});

describe('AssetLibraryService.resolveAndPersist', () => {
  it('persists provider output and serves the next resolve from cache', async () => {
    const repository = new InMemoryAssetRepository();
    const blobStore = new InMemoryAssetBlobStore();
    const provider = createFakeImageProvider();
    const resolver = new TieredAssetResolver({ repository, provider });
    const service = new AssetLibraryService({
      repository,
      blobStore,
      resolver,
    });
    const request = {
      assetKey: 'subject/robot',
      styleId: STYLE_ID,
      allowProvider: true,
    };

    const generated = await service.resolveAndPersist(request, (variant) =>
      Promise.resolve(dataUriBytes(variant)),
    );

    expect(generated.tier).toBe('provider');
    expect(provider.calls).toHaveLength(1);
    expect(blobStore.putCount).toBe(1);
    expect(generated.asset.variants[0]?.url).toMatch(/^memory:\/\/assets\//);

    const cached = await resolver.resolve({
      assetKey: 'subject/robot',
      styleId: STYLE_ID,
    });

    expect(cached.tier).toBe('cache');
    expect(cached.cacheHit).toBe(true);
    expect(cached.usage.providerRequests).toBe(0);
    expect(provider.calls).toHaveLength(1);
  });

  it('needs a resolver', async () => {
    const { service } = createService();

    await expect(
      service.resolveAndPersist(
        { assetKey: 'ball', styleId: STYLE_ID },
        async () => BYTES,
      ),
    ).rejects.toThrow(/needs a resolver/);
  });

  it('uploads the real provider bytes even when the repository drops URLs', async () => {
    const repository = new UrlStrippingRepository();
    const blobStore = new InMemoryAssetBlobStore();
    const provider = createFakeImageProvider();
    const resolver = new TieredAssetResolver({ repository, provider });
    const service = new AssetLibraryService({
      repository,
      blobStore,
      resolver,
    });

    const generated = await service.resolveAndPersist(
      { assetKey: 'subject/robot', styleId: STYLE_ID, allowProvider: true },
      (variant) => Promise.resolve(dataUriBytes(variant)),
    );
    const [objectKey] = blobStore.objectKeys();

    if (objectKey === undefined) {
      throw new Error('expected one uploaded object');
    }

    const uploaded = await blobStore.get(objectKey);

    expect(blobStore.putCount).toBe(1);
    expect(uploaded.byteLength).toBeGreaterThan(0);
    expect(sha256Hex(uploaded)).toBe(generated.asset.contentHash);
    expect(generated.asset.variants[0]?.url).toBe(`memory://${objectKey}`);
  });
});
