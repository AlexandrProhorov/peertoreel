import { describe, expect, it } from 'vitest';
import {
  TIKTOK_DEFAULT_CHUNK_BYTES,
  TIKTOK_MAX_VIDEO_BYTES,
  planChunks,
} from './chunking.js';

const MB = 1024 * 1024;

describe('planChunks', () => {
  it('uploads a file up to 5 MB as one chunk', () => {
    expect(planChunks(4 * MB)).toEqual({
      chunkSize: 4 * MB,
      totalChunkCount: 1,
      chunks: [{ offset: 0, length: 4 * MB }],
    });
    expect(planChunks(5 * MB).totalChunkCount).toBe(1);
  });

  it('splits a 50,000,123-byte file into five chunks like the docs example', () => {
    const size = 50_000_123;
    const plan = planChunks(size);

    expect(plan.chunkSize).toBe(TIKTOK_DEFAULT_CHUNK_BYTES);
    expect(plan.totalChunkCount).toBe(5);
    expect(plan.chunks).toHaveLength(5);
    expect(plan.chunks.at(-1)).toEqual({
      offset: 40_000_000,
      length: 10_000_123,
    });
  });

  it('uploads a 10–20 MB file as one whole chunk', () => {
    const size = 14 * MB;

    expect(planChunks(size)).toEqual({
      chunkSize: size,
      totalChunkCount: 1,
      chunks: [{ offset: 0, length: size }],
    });
  });

  it('declares the whole video size for a single chunk (chunk-size regression)', () => {
    // 13 320 534 bytes used to be planned as chunk_size 10 000 000 / count 1;
    // TikTok answered `The chunk size is invalid` on video/init.
    const size = 13_320_534;
    const plan = planChunks(size);

    expect(plan.totalChunkCount).toBe(1);
    expect(plan.chunkSize).toBe(size);
    expect(plan.chunks).toEqual([{ offset: 0, length: size }]);
  });

  it('starts multi-chunk uploads above 20 MB', () => {
    const plan = planChunks(20 * MB + 1);

    expect(plan.chunkSize).toBe(TIKTOK_DEFAULT_CHUNK_BYTES);
    expect(plan.totalChunkCount).toBe(2);
    expect(plan.chunks[0]).toEqual({
      offset: 0,
      length: TIKTOK_DEFAULT_CHUNK_BYTES,
    });
    expect(plan.chunks.at(-1)?.offset).toBe(TIKTOK_DEFAULT_CHUNK_BYTES);
  });

  it('covers every byte exactly once', () => {
    for (const size of [5 * MB + 1, 39 * MB, 64 * MB, 129 * MB]) {
      const plan = planChunks(size);
      const covered = plan.chunks.reduce((sum, chunk) => sum + chunk.length, 0);

      expect(covered).toBe(size);
      expect(plan.chunks[0]?.offset).toBe(0);

      for (let index = 1; index < plan.chunks.length; index += 1) {
        const previous = plan.chunks[index - 1];
        const current = plan.chunks[index];

        expect(current?.offset).toBe((previous?.offset ?? 0) + (previous?.length ?? 0));
      }
    }
  });

  it('rejects invalid sizes', () => {
    expect(() => planChunks(0)).toThrow();
    expect(() => planChunks(TIKTOK_MAX_VIDEO_BYTES + 1)).toThrow(/4 GB/);
  });
});
