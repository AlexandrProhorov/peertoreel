import {
  AssetLibraryService,
  InMemoryAssetBlobStore,
  InMemoryAssetRepository,
  type AssetRepository,
} from '@peertoreel/assets';
import { storyboardSchema, type AssetRecord } from '@peertoreel/contracts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveStoryboardAssets } from './asset-resolution.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const SHOWCASE_PATH = fileURLToPath(
  new URL('../examples/recipe-showcase.json', import.meta.url),
);

function showcaseStoryboard() {
  return storyboardSchema.parse(
    JSON.parse(readFileSync(SHOWCASE_PATH, 'utf8')),
  );
}

/** Counts writes so "no second pass" is observable, not inferred from dedup. */
class CountingRepository implements AssetRepository {
  readonly inner = new InMemoryAssetRepository();
  saves = 0;

  findByKey(key: string, styleId: string) {
    return this.inner.findByKey(key, styleId);
  }

  findByContentHash(contentHash: string) {
    return this.inner.findByContentHash(contentHash);
  }

  listByStyle(styleId: string) {
    return this.inner.listByStyle(styleId);
  }

  async save(record: AssetRecord) {
    this.saves += 1;

    return this.inner.save(record);
  }
}

describe('storyboard asset resolution', () => {
  it('resolves showcase subject keys from Tier 0 into data URIs', async () => {
    const resolution = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'none',
    );

    expect(resolution.resolutions.length).toBeGreaterThan(0);

    for (const entry of resolution.resolutions) {
      expect(entry.tier).toBe('starter');
      expect(entry.cacheHit).toBe(false);
      expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }

    const subjectEntry = resolution.resolutions[0];

    if (subjectEntry === undefined) {
      throw new Error('expected a resolved subject');
    }

    // Both the logical key and the catalog path are addressable from a scene.
    expect(resolution.assets[subjectEntry.assetKey]?.url).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
    expect(resolution.assets[subjectEntry.objectKey]?.url).toBe(
      resolution.assets[subjectEntry.assetKey]?.url,
    );
    expect(resolution.usage).toEqual({
      provider: null,
      providerRequests: 0,
      cacheHits: 0,
      costUsd: null,
    });
  });

  it('does not call the fake provider for keys already in Tier 0', async () => {
    const withFake = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'fake',
    );

    expect(withFake.usage.provider).toBe('fake');
    expect(withFake.usage.providerRequests).toBe(0);
    expect(withFake.resolutions.every((entry) => entry.tier === 'starter')).toBe(
      true,
    );
    expect(withFake.persisted).toBe(false);
  });

  it('lets an injected map override a starter reference', async () => {
    const base = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'none',
    );
    const first = base.resolutions[0];

    if (first === undefined) {
      throw new Error('expected a resolved subject');
    }

    const injectedUrl = 'data:image/jpeg;base64,AAAA';
    const resolution = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'none',
      null,
      { [first.assetKey]: { url: injectedUrl } },
    );

    expect(resolution.injected).toBe(1);
    expect(resolution.assets[first.assetKey]?.url).toBe(injectedUrl);
    // Everything else still resolves through Tier 0.
    expect(resolution.resolutions.length).toBe(base.resolutions.length - 1);
  });

  it('still fails on a reference that is neither injected nor resolvable', async () => {
    const showcase = showcaseStoryboard();
    const scene = showcase.scenes[0];

    if (scene === undefined) {
      throw new Error('expected a scene');
    }

    const programmatic = storyboardSchema.parse({
      ...showcase,
      scenes: showcase.scenes.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              environment: { setting: 'test', layers: [] },
              objects: [
                {
                  id: 'missing-subject',
                  kind: 'subject',
                  content: 'missing-key',
                  animation: 'fade-in',
                  syncToWord: null,
                  startSec: null,
                  endSec: null,
                },
              ],
              implementation: {
                type: 'programmatic',
                componentId: 'kinetic-typography',
                params: { text: 'Тест' },
              },
              fallback: {
                type: 'programmatic',
                componentId: 'kinetic-typography',
                params: { text: 'Тест' },
              },
            }
          : candidate,
      ),
    });

    await expect(
      resolveStoryboardAssets(programmatic, PUBLIC_DIR, 'none', null, {
        'another-key': { url: 'data:image/jpeg;base64,AAAA' },
      }),
    ).rejects.toThrow();
  });

  it('persists each resolved asset once and reuses it on a second pass', async () => {
    const repository = new CountingRepository();
    const blobStore = new InMemoryAssetBlobStore();
    const persistence = {
      repository,
      blobStore,
      service: new AssetLibraryService({ repository, blobStore }),
    };

    const first = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'none',
      persistence,
    );
    const firstEntry = first.resolutions[0];

    if (firstEntry === undefined) {
      throw new Error('expected a resolved subject');
    }

    expect(first.persisted).toBe(true);
    expect(blobStore.putCount).toBe(first.resolutions.length);
    expect(repository.saves).toBe(first.resolutions.length);
    expect(first.assets[firstEntry.assetKey]?.url).toMatch(/^memory:\/\/assets\//);
    expect(firstEntry.objectKey).toMatch(/^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\//);

    const second = await resolveStoryboardAssets(
      showcaseStoryboard(),
      PUBLIC_DIR,
      'none',
      persistence,
    );

    expect(blobStore.putCount).toBe(first.resolutions.length);
    expect(repository.saves).toBe(first.resolutions.length);
    expect(second.assets[firstEntry.assetKey]?.url).toBe(
      first.assets[firstEntry.assetKey]?.url,
    );
    expect(await repository.listByStyle('studio_flat_2d_v1')).toHaveLength(
      first.resolutions.length,
    );
  });
});
