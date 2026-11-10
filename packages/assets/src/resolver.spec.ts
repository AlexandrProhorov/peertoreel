import {
  AssetLicenseError,
  InvalidAssetError,
  ProviderUnavailableError,
  UnknownAssetError,
  UnsupportedAssetKindError,
  type AssetRecord,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './content-hash.js';
import { createFakeImageProvider } from './provider-fake.js';
import { InMemoryAssetRepository } from './repository.js';
import { TieredAssetResolver } from './resolver.js';
import { buildStarterAssets } from './starter.js';

const STYLE_ID = 'studio_flat_2d_v1';

const STARTER_FILES: Record<string, string> = {
  'assets/starter/brick.svg':
    '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#101820"/><circle cx="50" cy="50" r="20" fill="#F59E0A"/></svg>',
  'assets/starter/house.svg':
    '<svg viewBox="0 0 100 100"><path d="M10 90 L50 20 L90 90 Z" fill="#F59E0B"/></svg>',
};

const STARTER_INPUTS = [
  { key: 'brick', objectKey: 'assets/starter/brick.svg', tags: ['brick', 'material'] },
  { key: 'house', objectKey: 'assets/starter/house.svg', tags: ['house', 'building'] },
];

async function starterAssets() {
  return buildStarterAssets(
    async (objectKey) => STARTER_FILES[objectKey] ?? '',
    STYLE_ID,
    STARTER_INPUTS,
  );
}

async function createResolver(
  overrides: {
    repository?: InMemoryAssetRepository;
    provider?: ReturnType<typeof createFakeImageProvider> | null;
  } = {},
) {
  const repository = overrides.repository ?? new InMemoryAssetRepository();

  return {
    repository,
    resolver: new TieredAssetResolver({
      repository,
      starter: await starterAssets(),
      provider: overrides.provider ?? null,
    }),
  };
}

function restrictedStarter(): AssetRecord {
  return {
    id: 'starter/restricted',
    key: 'restricted',
    source: 'starter',
    kind: 'svg',
    styleId: STYLE_ID,
    contentHash: sha256Hex('<svg viewBox="0 0 1 1"/>'),
    tags: ['restricted'],
    license: { name: 'CC BY-NC 4.0', commercialUse: false },
    variants: [
      {
        id: 'default',
        objectKey: 'assets/starter/restricted.svg',
        mimeType: 'image/svg+xml',
        width: 1024,
        height: 1024,
        contentHash: sha256Hex('<svg viewBox="0 0 1 1"/>'),
      },
    ],
    metadata: {},
  };
}

const PROVIDER_FIXTURES = {
  'subject/robot':
    '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#101820"/><circle cx="50" cy="50" r="22" fill="#F59E0A"/></svg>',
};

describe('tiered asset resolver', () => {
  it('resolves the starter pack as Tier 0', async () => {
    const { resolver } = await createResolver();

    const resolution = await resolver.resolve({
      assetKey: 'brick',
      styleId: STYLE_ID,
    });

    expect(resolution.tier).toBe('starter');
    expect(resolution.cacheHit).toBe(false);
    expect(resolution.asset.source).toBe('starter');
    expect(resolution.asset.variants[0]?.objectKey).toBe('assets/starter/brick.svg');
    expect(resolution.diagnostics.map((entry) => entry.code)).toEqual([
      'starter_hit',
    ]);
  });

  it('resolves starter assets by tags without a key', async () => {
    const { resolver } = await createResolver();

    const resolution = await resolver.resolve({
      tags: ['building'],
      styleId: STYLE_ID,
    });

    expect(resolution.tier).toBe('starter');
    expect(resolution.asset.key).toBe('house');
  });

  it('never calls the provider when allowProvider is false', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver } = await createResolver({ provider });

    await expect(
      resolver.resolve({ assetKey: 'subject/unknown', styleId: STYLE_ID }),
    ).rejects.toBeInstanceOf(UnknownAssetError);
    expect(provider.calls).toHaveLength(0);
  });

  it('generates through the provider, normalizes and stores the asset', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver, repository } = await createResolver({ provider });

    const resolution = await resolver.resolve({
      assetKey: 'subject/robot',
      tags: ['robot'],
      styleId: STYLE_ID,
      allowProvider: true,
    });

    expect(resolution.tier).toBe('provider');
    expect(resolution.cacheHit).toBe(false);
    expect(resolution.usage).toEqual({
      provider: 'fake',
      providerRequests: 1,
      cacheHits: 0,
      costUsd: 0,
    });

    const variant = resolution.asset.variants[0];

    expect(variant?.objectKey).toMatch(
      /^assets\/[0-9a-f]{2}\/[0-9a-f]{64}\/[0-9a-f]{64}\.svg$/,
    );
    expect(resolution.asset.metadata).toMatchObject({
      provider: 'fake',
      model: 'fake-flat-v1',
      removedBackgroundRects: 1,
    });
    expect(resolution.asset.id).toBe('library/subject_robot');

    const cached = await repository.findByContentHash(resolution.asset.contentHash);

    expect(cached?.key).toBe('subject/robot');
    expect(provider.calls.map((call) => call.key)).toEqual(['subject/robot']);
  });

  it('returns the cached library record on the next request', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver } = await createResolver({ provider });

    const first = await resolver.resolve({
      assetKey: 'subject/robot',
      styleId: STYLE_ID,
      allowProvider: true,
    });
    const second = await resolver.resolve({
      assetKey: 'subject/robot',
      styleId: STYLE_ID,
    });

    expect(second.tier).toBe('cache');
    expect(second.cacheHit).toBe(true);
    expect(second.asset.contentHash).toBe(first.asset.contentHash);
    expect(provider.calls).toHaveLength(1);
  });

  it('matches cached assets by tags deterministically', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver } = await createResolver({ provider });

    await resolver.resolve({
      assetKey: 'subject/robot',
      tags: ['robot', 'machine'],
      styleId: STYLE_ID,
      allowProvider: true,
    });

    const resolution = await resolver.resolve({
      tags: ['machine'],
      styleId: STYLE_ID,
    });

    expect(resolution.tier).toBe('cache');
    expect(resolution.asset.key).toBe('subject/robot');
    expect(resolution.diagnostics[0]?.code).toBe('tag_match');
  });

  it('deduplicates identical provider output by content hash', async () => {
    const shared =
      '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#101820"/><circle cx="50" cy="50" r="20" fill="#F59E0B"/></svg>';
    const provider = createFakeImageProvider({
      assets: { 'subject/a': shared, 'subject/b': shared },
    });
    const { resolver } = await createResolver({ provider });

    const first = await resolver.resolve({
      assetKey: 'subject/a',
      styleId: STYLE_ID,
      allowProvider: true,
    });
    const second = await resolver.resolve({
      assetKey: 'subject/b',
      styleId: STYLE_ID,
      allowProvider: true,
    });

    expect(second.tier).toBe('cache');
    expect(second.cacheHit).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(second.diagnostics.map((entry) => entry.code)).toContain('deduplicated');
    expect(second.usage).toMatchObject({ providerRequests: 1, cacheHits: 1 });
  });

  it('is deterministic for identical requests', async () => {
    const request = { assetKey: 'subject/robot', styleId: STYLE_ID, allowProvider: true as const };
    const firstProvider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const secondProvider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const first = await createResolver({ provider: firstProvider });
    const second = await createResolver({ provider: secondProvider });

    const left = await first.resolver.resolve({ ...request });
    const right = await second.resolver.resolve({ ...request });

    expect(right.asset.contentHash).toBe(left.asset.contentHash);
    expect(right.asset.variants[0]?.objectKey).toBe(
      left.asset.variants[0]?.objectKey,
    );
    expect(right.tier).toBe(left.tier);
  });

  it('rejects a non-commercial starter asset', async () => {
    const repository = new InMemoryAssetRepository();
    const resolver = new TieredAssetResolver({
      repository,
      starter: [restrictedStarter()],
    });

    await expect(
      resolver.resolve({ assetKey: 'restricted', styleId: STYLE_ID }),
    ).rejects.toBeInstanceOf(AssetLicenseError);
  });

  it('rejects a non-commercial provider licence', async () => {
    const provider = createFakeImageProvider({
      assets: {
        'subject/restricted':
          '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>',
      },
    });
    const original = provider.generate.bind(provider);

    provider.generate = async (request) => {
      const result = await original(request);

      return {
        ...result,
        asset: {
          ...result.asset,
          license: { name: 'CC BY-NC 4.0', commercialUse: false },
        },
      };
    };

    const { resolver } = await createResolver({ provider });

    await expect(
      resolver.resolve({
        assetKey: 'subject/restricted',
        styleId: STYLE_ID,
        allowProvider: true,
      }),
    ).rejects.toBeInstanceOf(AssetLicenseError);
  });

  it('resolves fallbackKey when the primary asset is missing', async () => {
    const { resolver } = await createResolver();

    const resolution = await resolver.resolve({
      assetKey: 'subject/unknown',
      fallbackKey: 'brick',
      styleId: STYLE_ID,
    });

    expect(resolution.tier).toBe('fallback');
    expect(resolution.asset.key).toBe('brick');
    expect(resolution.diagnostics.map((entry) => entry.code)).toContain(
      'fallback_used',
    );
  });

  it('throws a typed error when the provider is disabled and no fallback exists', async () => {
    const provider = createFakeImageProvider({
      assets: PROVIDER_FIXTURES,
      enabled: false,
    });
    const { resolver } = await createResolver({ provider });

    await expect(
      resolver.resolve({
        assetKey: 'subject/robot',
        styleId: STYLE_ID,
        allowProvider: true,
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('throws UnsupportedAssetKindError for raster kinds in M3.6a', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver } = await createResolver({ provider });

    await expect(
      resolver.resolve({
        assetKey: 'subject/robot',
        styleId: STYLE_ID,
        kind: 'png',
        allowProvider: true,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAssetKindError);
  });

  it('does not return an SVG starter icon for a raster request', async () => {
    const { resolver } = await createResolver();

    await expect(
      resolver.resolve({
        assetKey: 'brick',
        styleId: STYLE_ID,
        kind: 'png',
      }),
    ).rejects.toBeInstanceOf(UnknownAssetError);
  });

  it('uses a storyboard-declared palette for quantization', async () => {
    const provider = createFakeImageProvider({ assets: PROVIDER_FIXTURES });
    const { resolver } = await createResolver({ provider });

    const resolution = await resolver.resolve({
      assetKey: 'subject/robot',
      styleId: STYLE_ID,
      assetPalette: ['#00FF00'],
      allowProvider: true,
    });
    const url = resolution.asset.variants[0]?.url ?? '';

    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);

    const svg = Buffer.from(url.split(',')[1] ?? '', 'base64').toString('utf8');

    expect(svg.toLowerCase()).toContain('#00ff00');
    expect(svg.toLowerCase()).not.toContain('#f59e0b');
  });

  it('falls back when the provider cannot produce the requested kind', async () => {
    const hash = sha256Hex('png-fallback');
    const pngFallback: AssetRecord = {
      id: 'starter/brick-png',
      key: 'brick-png',
      source: 'starter',
      kind: 'png',
      styleId: STYLE_ID,
      contentHash: hash,
      tags: ['brick'],
      license: { name: 'authored', commercialUse: true },
      variants: [
        {
          id: 'default',
          objectKey: 'assets/starter/brick.png',
          mimeType: 'image/png',
          width: 512,
          height: 512,
          contentHash: hash,
        },
      ],
      metadata: {},
    };
    const provider = createFakeImageProvider({ supportedKinds: ['svg'] });
    const resolver = new TieredAssetResolver({
      repository: new InMemoryAssetRepository(),
      starter: [pngFallback],
      provider,
    });

    const resolution = await resolver.resolve({
      assetKey: 'subject/missing',
      styleId: STYLE_ID,
      kind: 'png',
      fallbackKey: 'brick-png',
      allowProvider: true,
    });

    expect(resolution.tier).toBe('fallback');
    expect(resolution.asset.key).toBe('brick-png');
    expect(provider.calls).toHaveLength(0);
  });

  it('maps invalid provider SVG to a typed asset error', async () => {
    const provider = createFakeImageProvider({
      assets: { 'subject/broken': 'not an svg document' },
    });
    const { resolver } = await createResolver({ provider });

    await expect(
      resolver.resolve({
        assetKey: 'subject/broken',
        styleId: STYLE_ID,
        allowProvider: true,
      }),
    ).rejects.toBeInstanceOf(InvalidAssetError);
  });
});
