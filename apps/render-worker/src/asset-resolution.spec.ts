import { storyboardSchema } from '@peertoreel/contracts';
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
  });
});
