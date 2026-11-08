import { TikTokApiError, type TikTokApi } from '@peertoreel/tiktok';
import { describe, expect, it, vi } from 'vitest';
import { publishVideo } from './publish-video.js';

const video = Buffer.from([1, 2, 3, 4, 5]);

function creatorInfo(overrides: Record<string, unknown> = {}) {
  return {
    username: 'kadence',
    nickname: 'Kadence',
    avatarUrl: null,
    privacyLevelOptions: ['SELF_ONLY'],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoPostDurationSec: 300,
    ...overrides,
  };
}

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    queryCreatorInfo: vi.fn().mockResolvedValue(creatorInfo()),
    initVideo: vi.fn().mockResolvedValue({
      publishId: 'pub-1',
      uploadUrl: 'https://upload.test/video',
    }),
    uploadChunk: vi.fn().mockResolvedValue({
      httpStatus: 201,
      uploadedBytes: video.length,
    }),
    fetchStatus: vi.fn().mockResolvedValue({
      status: 'PUBLISH_COMPLETE',
      failReason: null,
      publiclyAvailablePostIds: [],
      uploadedBytes: video.length,
      downloadedBytes: null,
    }),
    ...overrides,
  } as unknown as TikTokApi;
}

function baseOptions(api: TikTokApi) {
  return {
    api,
    video,
    title: 'Тест',
    privacy: 'SELF_ONLY' as const,
    accessToken: 'act',
    refreshAccessToken: vi.fn().mockResolvedValue('act-2'),
  };
}

describe('publishVideo', () => {
  it('creates, uploads and polls a new TikTok post', async () => {
    const api = fakeApi();
    const onPublishId = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    const result = await publishVideo({
      ...baseOptions(api),
      onPublishId,
      onProgress,
    });

    expect(api.queryCreatorInfo).toHaveBeenCalledWith('act');
    expect(api.initVideo).toHaveBeenCalledWith(
      'act',
      expect.objectContaining({
        title: 'Тест',
        privacyLevel: 'SELF_ONLY',
        videoSize: video.length,
        chunkSize: video.length,
        totalChunkCount: 1,
      }),
    );
    expect(api.uploadChunk).toHaveBeenCalledWith(
      'https://upload.test/video',
      expect.any(Uint8Array),
      0,
      video.length,
    );
    expect(onPublishId).toHaveBeenCalledWith('pub-1');
    expect(onProgress).toHaveBeenCalled();
    expect(result).toEqual({
      publishId: 'pub-1',
      status: 'PUBLISH_COMPLETE',
      failReason: null,
      postId: null,
    });
  });

  it('resumes status polling when publish_id already exists', async () => {
    const api = fakeApi();

    const result = await publishVideo({
      ...baseOptions(api),
      existingPublishId: 'pub-existing',
    });

    expect(api.queryCreatorInfo).not.toHaveBeenCalled();
    expect(api.initVideo).not.toHaveBeenCalled();
    expect(api.uploadChunk).not.toHaveBeenCalled();
    expect(api.fetchStatus).toHaveBeenCalledWith('act', 'pub-existing');
    expect(result.publishId).toBe('pub-existing');
  });

  it('rejects a privacy level that the creator does not allow', async () => {
    const api = fakeApi({
      queryCreatorInfo: vi
        .fn()
        .mockResolvedValue(creatorInfo({ privacyLevelOptions: ['PUBLIC_TO_EVERYONE'] })),
    });

    await expect(publishVideo(baseOptions(api))).rejects.toBeInstanceOf(
      TikTokApiError,
    );
    expect(api.initVideo).not.toHaveBeenCalled();
  });

  it('returns a failed status with the TikTok reason', async () => {
    const api = fakeApi({
      fetchStatus: vi.fn().mockResolvedValue({
        status: 'FAILED',
        failReason: 'spam_risk_text',
        publiclyAvailablePostIds: [],
        uploadedBytes: 0,
        downloadedBytes: null,
      }),
    });

    const result = await publishVideo(baseOptions(api));

    expect(result.status).toBe('FAILED');
    expect(result.failReason).toBe('spam_risk_text');
  });

  it('refreshes the token once when TikTok rejects it', async () => {
    const api = fakeApi({
      queryCreatorInfo: vi
        .fn()
        .mockRejectedValueOnce(
          new TikTokApiError('expired', {
            code: 'access_token_invalid',
            httpStatus: 401,
            kind: 'token',
          }),
        )
        .mockResolvedValue(creatorInfo()),
    });
    const options = baseOptions(api);

    await publishVideo(options);

    expect(options.refreshAccessToken).toHaveBeenCalledOnce();
    expect(api.queryCreatorInfo).toHaveBeenLastCalledWith('act-2');
  });
});
