export const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const TIKTOK_DEFAULT_CHUNK_BYTES = 10_000_000;
export const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

export interface ChunkRange {
  offset: number;
  length: number;
}

export interface ChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
  chunks: ChunkRange[];
}

/**
 * TikTok rules (Content Posting API, media transfer guide):
 * - files <= 5 MB are uploaded as one chunk;
 * - chunk size is 5–64 MB; the final chunk may absorb the remainder;
 * - `total_chunk_count` = floor(video_size / chunk_size), at least 1;
 * - chunks are uploaded sequentially.
 */
export function planChunks(size: number): ChunkPlan {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('Video size must be a positive integer');
  }

  if (size > TIKTOK_MAX_VIDEO_BYTES) {
    throw new Error('Video exceeds the TikTok 4 GB limit');
  }

  if (size <= TIKTOK_MIN_CHUNK_BYTES) {
    return {
      chunkSize: size,
      totalChunkCount: 1,
      chunks: [{ offset: 0, length: size }],
    };
  }

  const chunkSize = Math.min(TIKTOK_DEFAULT_CHUNK_BYTES, size);
  const totalChunkCount = Math.max(1, Math.floor(size / chunkSize));

  /**
   * TikTok rejects `chunk_size != video_size` when `total_chunk_count` is 1,
   * even though the media guide allows the final chunk to absorb the remainder.
   * Files in the 10–20 MB range used to hit exactly that: one chunk of 10 MB
   * plus the remainder, declared as one chunk. A single chunk must be whole.
   */
  if (totalChunkCount === 1) {
    return {
      chunkSize: size,
      totalChunkCount: 1,
      chunks: [{ offset: 0, length: size }],
    };
  }

  const chunks: ChunkRange[] = [];

  for (let index = 0; index < totalChunkCount - 1; index += 1) {
    chunks.push({ offset: index * chunkSize, length: chunkSize });
  }

  const lastOffset = (totalChunkCount - 1) * chunkSize;
  chunks.push({ offset: lastOffset, length: size - lastOffset });

  return { chunkSize, totalChunkCount, chunks };
}
