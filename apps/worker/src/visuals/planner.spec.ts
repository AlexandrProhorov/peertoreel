import type { StockAsset } from '@kadence/contracts';
import { describe, expect, it } from 'vitest';
import type { BeatTiming } from './beat-timings.js';
import {
  FALLBACK_ASSET,
  planVisualScenes,
  selectStockAsset,
  withAsset,
} from './planner.js';

function asset(overrides: Partial<StockAsset> = {}): StockAsset {
  return {
    provider: 'pixabay',
    providerAssetId: '1',
    kind: 'video',
    downloadUrl: 'https://cdn.test/1.mp4',
    pageUrl: 'https://pixabay.com/videos/id-1/',
    author: 'author',
    width: 1920,
    height: 1080,
    durationSec: 8,
    sizeBytes: 1_000_000,
    tags: [],
    rank: 0,
    ...overrides,
  };
}

const timings: BeatTiming[] = [
  {
    part: 'hook',
    beatIndex: null,
    text: 'Хук',
    visualDirection: 'first visual',
    startSec: 0,
    endSec: 1,
  },
  {
    part: 'beat',
    beatIndex: 0,
    text: 'Бит',
    visualDirection: 'second visual',
    startSec: 1,
    endSec: 4,
  },
  {
    part: 'cta',
    beatIndex: null,
    text: 'Финал',
    visualDirection: 'second visual',
    startSec: 4,
    endSec: 6,
  },
];

describe('planVisualScenes', () => {
  it('turns hook, beats and CTA timings into indexed scenes', () => {
    const scenes = planVisualScenes(timings).map((plan) =>
      withAsset(plan, FALLBACK_ASSET),
    );

    expect(scenes.map((scene) => scene.idx)).toEqual([0, 1, 2]);
    expect(scenes.map((scene) => scene.part)).toEqual(['hook', 'beat', 'cta']);
    expect(scenes[1]?.beatIndex).toBe(0);
    expect(scenes[2]?.beatIndex).toBeNull();
    expect(scenes[0]?.asset.kind).toBe('fallback');
  });
});

describe('selectStockAsset', () => {
  it('prefers a vertical asset over a wider one', () => {
    const selected = selectStockAsset(
      [
        asset({ providerAssetId: 'horizontal', width: 1920, height: 1080 }),
        asset({ providerAssetId: 'vertical', width: 1080, height: 1920 }),
      ],
      { kind: 'video', minDurationSec: 3, maxBytes: 10_000_000 },
    );

    expect(selected?.providerAssetId).toBe('vertical');
  });

  it('skips an asset already used by another scene', () => {
    const selected = selectStockAsset(
      [
        asset({ providerAssetId: 'used', width: 1080, height: 1920 }),
        asset({ providerAssetId: 'fresh', width: 1080, height: 1920 }),
      ],
      {
        kind: 'video',
        minDurationSec: 3,
        maxBytes: 10_000_000,
        usedProviderAssetIds: new Set(['used']),
      },
    );

    expect(selected?.providerAssetId).toBe('fresh');
  });

  it('rotates away from the previous manifest assets on regeneration', () => {
    const selected = selectStockAsset(
      [
        asset({ providerAssetId: 'previous', width: 1080, height: 1920 }),
        asset({ providerAssetId: 'next', width: 1080, height: 1920 }),
      ],
      {
        kind: 'video',
        minDurationSec: 3,
        maxBytes: 10_000_000,
        avoidProviderAssetIds: new Set(['previous']),
      },
    );

    expect(selected?.providerAssetId).toBe('next');
  });

  it('requires the visual anchor in the provider tags', () => {
    const selected = selectStockAsset(
      [
        asset({
          providerAssetId: 'cat',
          width: 1080,
          height: 1920,
          tags: ['cat', 'pet'],
        }),
        asset({
          providerAssetId: 'dog',
          width: 1920,
          height: 1080,
          tags: ['dog', 'pet', 'snow'],
        }),
      ],
      {
        kind: 'video',
        minDurationSec: 3,
        maxBytes: 10_000_000,
        requiredTagTokens: ['dog'],
      },
    );

    expect(selected?.providerAssetId).toBe('dog');
  });

  it('returns null when no candidate has the anchor tag', () => {
    expect(
      selectStockAsset(
        [asset({ providerAssetId: 'cat', tags: ['cat', 'pet'] })],
        {
          kind: 'video',
          minDurationSec: 3,
          maxBytes: 10_000_000,
          requiredTagTokens: ['dog'],
        },
      ),
    ).toBeNull();
  });

  it('treats Pixabay rank as the main relevance signal', () => {
    const selected = selectStockAsset(
      [
        asset({
          providerAssetId: 'first-horizontal',
          width: 1920,
          height: 1080,
          rank: 0,
        }),
        asset({
          providerAssetId: 'second-vertical',
          width: 1080,
          height: 1920,
          rank: 1,
        }),
      ],
      { kind: 'video', minDurationSec: 3, maxBytes: 10_000_000 },
    );

    expect(selected?.providerAssetId).toBe('first-horizontal');
  });

  it('reuses an avoided asset when it is the only candidate', () => {
    const selected = selectStockAsset(
      [asset({ providerAssetId: 'only', width: 1080, height: 1920 })],
      {
        kind: 'video',
        minDurationSec: 3,
        maxBytes: 10_000_000,
        avoidProviderAssetIds: new Set(['only']),
      },
    );

    expect(selected?.providerAssetId).toBe('only');
  });

  it('skips assets over the download limit', () => {
    const selected = selectStockAsset(
      [
        asset({ providerAssetId: 'too-large', sizeBytes: 20_000_000 }),
        asset({ providerAssetId: 'small', sizeBytes: 1_000_000 }),
      ],
      { kind: 'video', minDurationSec: 3, maxBytes: 10_000_000 },
    );

    expect(selected?.providerAssetId).toBe('small');
  });

  it('prefers a clip long enough for the scene', () => {
    const selected = selectStockAsset(
      [
        asset({ providerAssetId: 'short', durationSec: 1.5 }),
        asset({ providerAssetId: 'long', durationSec: 7 }),
      ],
      { kind: 'video', minDurationSec: 4, maxBytes: 10_000_000 },
    );

    expect(selected?.providerAssetId).toBe('long');
  });

  it('returns null when no candidate matches the kind', () => {
    expect(
      selectStockAsset([asset({ kind: 'video' })], {
        kind: 'image',
        minDurationSec: 0,
        maxBytes: 10_000_000,
      }),
    ).toBeNull();
  });
});
