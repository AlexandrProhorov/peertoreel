import { describe, expect, it } from 'vitest';
import {
  stockSearchRequestSchema,
  visualsArtifactSchema,
  type VisualScene,
} from './visuals.js';

const fallbackScene: VisualScene = {
  idx: 0,
  part: 'hook',
  beatIndex: null,
  text: 'Первая фраза',
  visualDirection: 'blue sky clouds',
  startSec: 0,
  endSec: 3,
  asset: {
    kind: 'fallback',
    objectKey: null,
    contentType: null,
    width: null,
    height: null,
    provider: null,
    providerAssetId: null,
    author: null,
    pageUrl: null,
  },
};

const mediaScene: VisualScene = {
  ...fallbackScene,
  idx: 1,
  part: 'beat',
  beatIndex: 0,
  text: 'Вторая фраза',
  asset: {
    kind: 'video',
    objectKey: 'runs/run-id/visuals/scene-1',
    contentType: 'video/mp4',
    width: 1080,
    height: 1920,
    provider: 'pixabay',
    providerAssetId: '123',
    author: 'author',
    pageUrl: 'https://pixabay.com/videos/id-123/',
  },
};

describe('visuals contracts', () => {
  it('accepts a manifest with fallback and media scenes', () => {
    const manifest = visualsArtifactSchema.parse({
      scenes: [fallbackScene, mediaScene],
      durationSec: 6,
      providerRequests: 2,
      cacheHits: 1,
    });

    expect(manifest.scenes).toHaveLength(2);
    expect(manifest.scenes[0]?.asset.kind).toBe('fallback');
    expect(manifest.scenes[1]?.asset.kind).toBe('video');
  });

  it('requires an object key and content type for a real asset', () => {
    const invalid = {
      ...mediaScene,
      asset: { ...mediaScene.asset, objectKey: null },
    };

    expect(visualsArtifactSchema.safeParse({
      scenes: [invalid],
      durationSec: 6,
      providerRequests: 1,
      cacheHits: 0,
    }).success).toBe(false);
  });

  it('rejects an empty timeline and non-positive duration', () => {
    expect(visualsArtifactSchema.safeParse({
      scenes: [],
      durationSec: 6,
      providerRequests: 0,
      cacheHits: 0,
    }).success).toBe(false);
    expect(visualsArtifactSchema.safeParse({
      scenes: [fallbackScene],
      durationSec: 0,
      providerRequests: 0,
      cacheHits: 0,
    }).success).toBe(false);
  });

  it('rejects a scene whose end is not after its start', () => {
    expect(visualsArtifactSchema.safeParse({
      scenes: [{ ...fallbackScene, startSec: 3, endSec: 3 }],
      durationSec: 3,
      providerRequests: 0,
      cacheHits: 0,
    }).success).toBe(false);
  });

  it('rejects duplicate scene indexes', () => {
    expect(visualsArtifactSchema.safeParse({
      scenes: [fallbackScene, { ...fallbackScene }],
      durationSec: 6,
      providerRequests: 0,
      cacheHits: 0,
    }).success).toBe(false);
  });

  it('applies stock search defaults and rejects an invalid page size', () => {
    const request = stockSearchRequestSchema.parse({
      query: 'blue sky',
      kind: 'video',
    });

    expect(request.page).toBe(1);
    expect(request.perPage).toBe(5);
    expect(stockSearchRequestSchema.safeParse({
      query: 'blue sky',
      kind: 'video',
      perPage: 10,
    }).success).toBe(false);
  });
});
