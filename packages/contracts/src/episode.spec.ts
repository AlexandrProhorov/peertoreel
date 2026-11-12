import { describe, expect, it } from 'vitest';
import {
  episodeManifestSchema,
  episodeVisualsArtifactSchema,
  runStoryboardResponseSchema,
} from './episode.js';
import { storyboardFixture15Deg } from './storyboard.fixture.js';

const visual = {
  sceneId: 'hook',
  sceneIdx: 0,
  reference: 'assets/starter/dog-snout.svg',
  provider: 'pixabay',
  providerAssetId: '42',
  pageUrl: 'https://pixabay.com/photos/dog-42/',
  author: 'alice',
  license: 'pixabay-content-license',
  downloadUrl: 'https://cdn.test/dog.jpg',
  tags: ['dog'],
  query: 'animal dog nose',
  cached: false,
  width: 1080,
  height: 1920,
  bytes: 3,
  dataUri: 'data:image/jpeg;base64,AAAA',
} as const;

const manifest = {
  kind: 'm3.5.1-episode',
  topic: 'Почему у собак мокрый нос',
  title: 'Мокрый нос',
  generatedAt: '2026-11-11T12:00:00.000Z',
  totalMs: 1000,
  llm: {
    provider: 'deepseek',
    model: 'deepseek-flash',
    attempts: 1,
    promptTokens: 100,
    completionTokens: 200,
    ms: 500,
    costUsd: null,
  },
  tts: {
    provider: 'google-translate-spike',
    model: 'google-translate:ru',
    characters: 40,
    words: 8,
    audioDurationSec: 3,
    bytes: 1000,
    ms: 200,
    costUsd: 0,
  },
  stock: {
    provider: 'pixabay',
    queries: 1,
    providerRequests: 2,
    cacheHits: 0,
    images: 1,
    skipped: 0,
    costUsd: 0,
  },
} as const;

describe('episode contracts', () => {
  it('validates the visuals artifact and keeps data URIs only', () => {
    expect(
      episodeVisualsArtifactSchema.safeParse({
        images: [visual],
        providerRequests: 2,
        cacheHits: 0,
        skipped: 0,
      }).success,
    ).toBe(true);

    expect(
      episodeVisualsArtifactSchema.safeParse({
        images: [{ ...visual, dataUri: 'https://pixabay.com/dog.jpg' }],
        providerRequests: 0,
        cacheHits: 0,
        skipped: 0,
      }).success,
    ).toBe(false);

    expect(
      episodeVisualsArtifactSchema.safeParse({
        images: [{ ...visual, provider: 'recraft' }],
        providerRequests: 0,
        cacheHits: 0,
        skipped: 0,
      }).success,
    ).toBe(false);
  });

  it('validates the manifest before and after render', () => {
    expect(episodeManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      episodeManifestSchema.safeParse({
        ...manifest,
        render: {
          scenesMs: 100,
          concatMs: 50,
          finalMs: 150,
          totalMs: 300,
          injectedAssets: 1,
          costUsd: 0,
          finishedAt: '2026-11-11T12:01:00.000Z',
        },
      }).success,
    ).toBe(true);
  });

  it('requires all three parts of the storyboard preview', () => {
    const visuals = {
      images: [visual],
      providerRequests: 2,
      cacheHits: 0,
      skipped: 0,
    };

    expect(
      runStoryboardResponseSchema.safeParse({
        storyboard: storyboardFixture15Deg,
        visuals,
        manifest,
      }).success,
    ).toBe(true);

    expect(
      runStoryboardResponseSchema.safeParse({
        storyboard: storyboardFixture15Deg,
        manifest,
      }).success,
    ).toBe(false);

    expect(
      runStoryboardResponseSchema.safeParse({
        storyboard: storyboardFixture15Deg,
        visuals,
      }).success,
    ).toBe(false);
  });
});
