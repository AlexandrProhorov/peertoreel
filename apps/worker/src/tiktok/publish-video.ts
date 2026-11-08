import type { PublishPrivacyLevel } from '@peertoreel/contracts';
import {
  TikTokApi,
  TikTokApiError,
  planChunks,
  type TikTokPostStatus,
} from '@peertoreel/tiktok';
import { setTimeout as sleep } from 'node:timers/promises';

const STATUS_TIMEOUT_MS = 5 * 60_000;
const STATUS_POLL_MS = 5_000;
const MAX_STATUS_RETRIES = 3;

export interface PublishVideoOptions {
  api: TikTokApi;
  video: Buffer;
  title: string;
  privacy: PublishPrivacyLevel;
  accessToken: string;
  /** Called when TikTok invalidates the access token mid-flight. */
  refreshAccessToken: () => Promise<string>;
  existingPublishId?: string | null;
  onPublishId?: (publishId: string) => Promise<void>;
  onProgress?: (progress: number) => Promise<void>;
}

export interface PublishVideoResult {
  publishId: string;
  status: TikTokPostStatus;
  failReason: string | null;
  postId: string | null;
}

async function report(
  onProgress: ((progress: number) => Promise<void>) | undefined,
  value: number,
): Promise<void> {
  if (onProgress) {
    await onProgress(Math.max(0, Math.min(100, value)));
  }
}

export async function publishVideo(
  options: PublishVideoOptions,
): Promise<PublishVideoResult> {
  const { api, video } = options;
  let accessToken = options.accessToken;

  const refresh = async (): Promise<void> => {
    accessToken = await options.refreshAccessToken();
  };

  const withTokenRetry = async <T>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error: unknown) {
      if (error instanceof TikTokApiError && error.kind === 'token') {
        await refresh();
        return request();
      }

      throw error;
    }
  };

  let publishId = options.existingPublishId ?? null;

  if (!publishId) {
    const creator = await withTokenRetry(() =>
      api.queryCreatorInfo(accessToken),
    );
    await report(options.onProgress, 5);

    if (!creator.privacyLevelOptions.includes(options.privacy)) {
      throw new TikTokApiError(
        `privacy ${options.privacy} is not available; choose one of ${creator.privacyLevelOptions.join(', ')}`,
        {
          code: 'privacy_level_option_mismatch',
          kind: 'terminal',
        },
      );
    }

    const plan = planChunks(video.length);
    const init = await withTokenRetry(() =>
      api.initVideo(accessToken, {
        title: options.title.slice(0, 2200),
        privacyLevel: options.privacy,
        videoSize: video.length,
        chunkSize: plan.chunkSize,
        totalChunkCount: plan.totalChunkCount,
        disableComment: creator.commentDisabled,
        disableDuet: creator.duetDisabled,
        disableStitch: creator.stitchDisabled,
      }),
    );

    publishId = init.publishId;

    if (options.onPublishId) {
      await options.onPublishId(publishId);
    }

    if (!init.uploadUrl) {
      throw new Error('TikTok returned no upload_url for FILE_UPLOAD');
    }

    await report(options.onProgress, 15);

    for (const [index, chunk] of plan.chunks.entries()) {
      const bytes = video.subarray(chunk.offset, chunk.offset + chunk.length);
      let uploaded = false;

      for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
        try {
          const result = await api.uploadChunk(
            init.uploadUrl,
            bytes,
            chunk.offset,
            video.length,
          );

          uploaded = true;
          const uploadedBytes = result.uploadedBytes ?? chunk.offset + chunk.length;
          await report(
            options.onProgress,
            15 + (uploadedBytes / video.length) * 70,
          );
        } catch (error: unknown) {
          if (
            attempt === 3 ||
            !(error instanceof TikTokApiError) ||
            error.kind !== 'retryable'
          ) {
            throw error;
          }

          await sleep(1_000 * attempt);
        }
      }

      if (!uploaded) {
        throw new Error(`TikTok chunk ${index + 1} was not uploaded`);
      }
    }
  }

  await report(options.onProgress, 90);

  const deadline = Date.now() + STATUS_TIMEOUT_MS;
  let status: Awaited<ReturnType<TikTokApi['fetchStatus']>> | null = null;
  let retryableErrors = 0;

  while (Date.now() < deadline) {
    try {
      status = await withTokenRetry(() =>
        api.fetchStatus(accessToken, publishId as string),
      );
    } catch (error: unknown) {
      if (
        error instanceof TikTokApiError &&
        error.kind === 'retryable' &&
        retryableErrors < MAX_STATUS_RETRIES
      ) {
        retryableErrors += 1;
        await sleep(STATUS_POLL_MS);
        continue;
      }

      throw error;
    }

    if (status.status === 'PUBLISH_COMPLETE' || status.status === 'FAILED') {
      break;
    }

    await sleep(STATUS_POLL_MS);
  }

  if (!status) {
    throw new Error('TikTok did not return a publish status within 5 minutes');
  }

  await report(options.onProgress, 100);

  return {
    publishId: publishId as string,
    status: status.status,
    failReason: status.failReason,
    postId: status.publiclyAvailablePostIds[0] ?? null,
  };
}
