import type { PublishPrivacyLevel } from '@peertoreel/contracts';
import { z } from 'zod';
import {
  TikTokApiError,
  classifyErrorCode,
  toTikTokError,
} from './errors.js';

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  apiBaseUrl?: string;
  authBaseUrl?: string;
  timeoutMs?: number;
  /** Chunk uploads can be much slower than JSON calls. */
  uploadTimeoutMs?: number;
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface TikTokTokenSet {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  openId: string;
  scope: string;
  tokenType: string;
}

export interface TikTokUserInfo {
  openId: string;
  unionId: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface TikTokCreatorInfo {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  privacyLevelOptions: PublishPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface TikTokVideoInitInput {
  title: string;
  privacyLevel: PublishPrivacyLevel;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}

export interface TikTokVideoInitResult {
  publishId: string;
  uploadUrl: string | null;
}

export type TikTokPostStatus =
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED';

export interface TikTokPostStatusResult {
  status: TikTokPostStatus;
  failReason: string | null;
  publiclyAvailablePostIds: number[];
  uploadedBytes: number | null;
  downloadedBytes: number | null;
}

export interface TikTokChunkResult {
  httpStatus: number;
  uploadedBytes: number | null;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_expires_in: z.number().int().positive(),
  open_id: z.string().min(1),
  scope: z.string(),
  token_type: z.string(),
});

const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  log_id: z.string().optional(),
});

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.url().optional(),
);

const envelopeSchema = z.object({
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
      log_id: z.string().optional(),
    })
    .optional(),
});

const userInfoSchema = z.object({
  user: z.object({
    open_id: z.string().min(1),
    union_id: z.string().optional(),
    display_name: z.string().default(''),
    avatar_url: optionalUrl,
  }),
});

const creatorInfoSchema = z.object({
  creator_username: z.string(),
  creator_nickname: z.string(),
  creator_avatar_url: optionalUrl,
  privacy_level_options: z.array(
    z.enum([
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'SELF_ONLY',
    ]),
  ),
  comment_disabled: z.boolean(),
  duet_disabled: z.boolean(),
  stitch_disabled: z.boolean(),
  max_video_post_duration_sec: z.number().int().positive(),
});

const initResponseSchema = z.object({
  publish_id: z.string().min(1),
  upload_url: optionalUrl,
});

const statusResponseSchema = z.object({
  status: z.enum([
    'PROCESSING_UPLOAD',
    'PROCESSING_DOWNLOAD',
    'SEND_TO_USER_INBOX',
    'PUBLISH_COMPLETE',
    'FAILED',
  ]),
  fail_reason: z.string().optional(),
  publicaly_available_post_id: z.array(z.number().int()).optional(),
  uploaded_bytes: z.number().int().nonnegative().optional(),
  downloaded_bytes: z.number().int().nonnegative().optional(),
});

const DEFAULT_TIMEOUT_MS = 30_000;

export class TikTokApi {
  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly apiBaseUrl: string;
  private readonly authBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly uploadTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TikTokConfig) {
    this.clientKey = config.clientKey;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.apiBaseUrl = (config.apiBaseUrl ?? 'https://open.tiktokapis.com').replace(
      /\/$/,
      '',
    );
    this.authBaseUrl = (config.authBaseUrl ?? 'https://www.tiktok.com').replace(
      /\/$/,
      '',
    );
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.uploadTimeoutMs = config.uploadTimeoutMs ?? 120_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  authorizeUrl(state: string, scopes: readonly string[]): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: scopes.join(','),
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state,
    });

    return `${this.authBaseUrl}/v2/auth/authorize/?${params.toString()}`;
  }

  exchangeCode(code: string): Promise<TikTokTokenSet> {
    return this.requestToken({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<TikTokTokenSet> {
    return this.requestToken({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async revoke(accessToken: string): Promise<void> {
    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      token: accessToken,
    });

    const response = await this.send(`${this.apiBaseUrl}/v2/oauth/revoke/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.oauthError(response.status, payload);
    }
  }

  async getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
    const data = await this.envelopeRequest(
      `${this.apiBaseUrl}/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      userInfoSchema,
    );

    return {
      openId: data.user.open_id,
      unionId: data.user.union_id ?? null,
      displayName: data.user.display_name,
      avatarUrl: data.user.avatar_url ?? null,
    };
  }

  async queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const data = await this.envelopeRequest(
      `${this.apiBaseUrl}/v2/post/publish/creator_info/query/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: '{}',
      },
      creatorInfoSchema,
    );

    return {
      username: data.creator_username,
      nickname: data.creator_nickname,
      avatarUrl: data.creator_avatar_url ?? null,
      privacyLevelOptions: data.privacy_level_options,
      commentDisabled: data.comment_disabled,
      duetDisabled: data.duet_disabled,
      stitchDisabled: data.stitch_disabled,
      maxVideoPostDurationSec: data.max_video_post_duration_sec,
    };
  }

  async initVideo(
    accessToken: string,
    input: TikTokVideoInitInput,
  ): Promise<TikTokVideoInitResult> {
    const data = await this.envelopeRequest(
      `${this.apiBaseUrl}/v2/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: input.title,
            privacy_level: input.privacyLevel,
            disable_comment: input.disableComment ?? false,
            disable_duet: input.disableDuet ?? false,
            disable_stitch: input.disableStitch ?? false,
            video_cover_timestamp_ms: input.videoCoverTimestampMs ?? 1_000,
            brand_content_toggle: false,
            brand_organic_toggle: false,
            is_aigc: true,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: input.videoSize,
            chunk_size: input.chunkSize,
            total_chunk_count: input.totalChunkCount,
          },
        }),
      },
      initResponseSchema,
    );

    return {
      publishId: data.publish_id,
      uploadUrl: data.upload_url ?? null,
    };
  }

  async uploadChunk(
    uploadUrl: string,
    chunk: Uint8Array,
    offset: number,
    totalSize: number,
  ): Promise<TikTokChunkResult> {
    const lastByte = offset + chunk.length - 1;
    const response = await this.send(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${offset}-${lastByte}/${totalSize}`,
      },
      body: chunk,
    }, this.uploadTimeoutMs);

    if (response.status !== 201 && response.status !== 206) {
      throw new TikTokApiError(
        `TikTok upload failed with HTTP ${response.status}`,
        {
          code: 'upload_failed',
          httpStatus: response.status,
          kind:
            response.status >= 500
              ? 'retryable'
              : classifyErrorCode(response.status, 'upload_failed'),
        },
      );
    }

    const contentRange = response.headers.get('content-range');
    const range = contentRange?.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);

    return {
      httpStatus: response.status,
      uploadedBytes: range?.[2] ? Number(range[2]) + 1 : null,
    };
  }

  async fetchStatus(
    accessToken: string,
    publishId: string,
  ): Promise<TikTokPostStatusResult> {
    const data = await this.envelopeRequest(
      `${this.apiBaseUrl}/v2/post/publish/status/fetch/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
      statusResponseSchema,
    );

    return {
      status: data.status,
      failReason: data.fail_reason ?? null,
      publiclyAvailablePostIds: data.publicaly_available_post_id ?? [],
      uploadedBytes: data.uploaded_bytes ?? null,
      downloadedBytes: data.downloaded_bytes ?? null,
    };
  }

  private async requestToken(
    form: Record<string, string>,
  ): Promise<TikTokTokenSet> {
    const response = await this.send(`${this.apiBaseUrl}/v2/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.oauthError(response.status, payload);
    }

    const oauthError = oauthErrorSchema.safeParse(payload);

    if (oauthError.success) {
      throw this.oauthError(response.status, payload);
    }

    const parsed = tokenResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new TikTokApiError('Unexpected TikTok token response', {
        code: 'invalid_response',
        httpStatus: response.status,
        kind: 'terminal',
      });
    }

    return {
      accessToken: parsed.data.access_token,
      expiresIn: parsed.data.expires_in,
      refreshToken: parsed.data.refresh_token,
      refreshExpiresIn: parsed.data.refresh_expires_in,
      openId: parsed.data.open_id,
      scope: parsed.data.scope,
      tokenType: parsed.data.token_type,
    };
  }

  private async envelopeRequest<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.send(url, init);
    const payload: unknown = await response.json().catch(() => null);
    const envelope = envelopeSchema.safeParse(payload);

    if (!envelope.success) {
      throw new TikTokApiError('Unexpected TikTok response', {
        code: 'invalid_response',
        httpStatus: response.status,
        kind: response.status >= 500 ? 'retryable' : 'terminal',
      });
    }

    const error = envelope.data.error;

    if (error && error.code !== 'ok') {
      throw new TikTokApiError(error.message || error.code, {
        code: error.code,
        httpStatus: response.status,
        logId: error.log_id,
      });
    }

    if (!response.ok) {
      throw new TikTokApiError(`TikTok request failed with HTTP ${response.status}`, {
        code: 'http_error',
        httpStatus: response.status,
      });
    }

    const parsed = schema.safeParse(envelope.data.data);

    if (!parsed.success) {
      throw new TikTokApiError('Unexpected TikTok response payload', {
        code: 'invalid_response',
        httpStatus: response.status,
        kind: 'terminal',
      });
    }

    return parsed.data;
  }

  private async send(
    url: string,
    init: RequestInit,
    timeoutMs = this.timeoutMs,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      throw toTikTokError(error);
    }
  }

  private oauthError(httpStatus: number, payload: unknown): TikTokApiError {
    const parsed = oauthErrorSchema.safeParse(payload);

    if (!parsed.success) {
      return new TikTokApiError(
        `TikTok OAuth failed with HTTP ${httpStatus}`,
        {
          code: 'oauth_error',
          httpStatus,
          kind: httpStatus >= 500 || httpStatus === 429 ? 'retryable' : 'terminal',
        },
      );
    }

    return new TikTokApiError(
      parsed.data.error_description || parsed.data.error,
      {
        code: parsed.data.error,
        httpStatus,
        logId: parsed.data.log_id,
      },
    );
  }
}


