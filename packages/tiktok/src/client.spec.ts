import { describe, expect, it, vi } from 'vitest';
import { TikTokApi } from './client.js';
import { TikTokApiError } from './errors.js';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function envelope(data: unknown, code = 'ok'): unknown {
  return {
    data,
    error: {
      code,
      message: code === 'ok' ? '' : `error ${code}`,
      log_id: 'log-1',
    },
  };
}

function setup(body: unknown, status = 200, headers?: Record<string, string>) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status, headers));
  const api = new TikTokApi({
    clientKey: 'client-key',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3000/api/v1/accounts/tiktok/callback',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  return { api, fetchMock };
}

const tokenPayload = {
  access_token: 'act.token',
  expires_in: 7200,
  refresh_token: 'rft.token',
  refresh_expires_in: 15_552_000,
  open_id: 'open-1',
  scope: 'user.info.basic,video.publish',
  token_type: 'Bearer',
};

describe('TikTokApi', () => {
  it('builds the authorization URL with PKCE', () => {
    const { api } = setup({});
    const challenge = 'a'.repeat(64);

    const url = new URL(
      api.authorizeUrl(
        'state-1',
        ['user.info.basic', 'video.publish'],
        challenge,
      ),
    );

    expect(url.origin).toBe('https://www.tiktok.com');
    expect(url.pathname).toBe('/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('client-key');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/accounts/tiktok/callback',
    );
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges an authorization code with the PKCE verifier', async () => {
    const { api, fetchMock } = setup(tokenPayload);

    const tokens = await api.exchangeCode('code-1', 'verifier-1');

    expect(tokens).toEqual({
      accessToken: 'act.token',
      expiresIn: 7200,
      refreshToken: 'rft.token',
      refreshExpiresIn: 15_552_000,
      openId: 'open-1',
      scope: 'user.info.basic,video.publish',
      tokenType: 'Bearer',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    expect(init.method).toBe('POST');

    const form = new URLSearchParams(String(init.body));

    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code_verifier')).toBe('verifier-1');
  });

  it('refreshes with the refresh token grant', async () => {
    const { api, fetchMock } = setup(tokenPayload);

    await api.refresh('old-refresh');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));

    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('old-refresh');
    expect(form.get('client_secret')).toBe('client-secret');
  });

  it('maps user info', async () => {
    const { api } = setup(
      envelope({
        user: {
          open_id: 'open-1',
          display_name: 'Peer to Reel',
          avatar_url: 'https://cdn.test/avatar.jpg',
        },
      }),
    );

    await expect(api.getUserInfo('act.token')).resolves.toEqual({
      openId: 'open-1',
      unionId: null,
      displayName: 'Peer to Reel',
      avatarUrl: 'https://cdn.test/avatar.jpg',
    });
  });

  it('treats an empty avatar URL as null', async () => {
    const { api } = setup(
      envelope({
        user: {
          open_id: 'open-1',
          display_name: 'Peer to Reel',
          avatar_url: '',
        },
      }),
    );

    await expect(api.getUserInfo('act.token')).resolves.toMatchObject({
      avatarUrl: null,
    });
  });

  it('maps creator info', async () => {
    const { api } = setup(
      envelope({
        creator_username: 'peertoreel',
        creator_nickname: 'Peer to Reel',
        creator_avatar_url: 'https://cdn.test/avatar.jpg',
        privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: false,
        max_video_post_duration_sec: 300,
      }),
    );

    const info = await api.queryCreatorInfo('act.token');

    expect(info.privacyLevelOptions).toEqual(['SELF_ONLY', 'PUBLIC_TO_EVERYONE']);
    expect(info.maxVideoPostDurationSec).toBe(300);
  });

  it('sends the AIGC flag and FILE_UPLOAD source when initializing', async () => {
    const { api, fetchMock } = setup(
      envelope({
        publish_id: 'v_pub_file~1',
        upload_url: 'https://upload.test/video?token=1',
      }),
    );

    const result = await api.initVideo('act.token', {
      title: 'Топ 5 пород собак #собаки',
      privacyLevel: 'SELF_ONLY',
      videoSize: 14_000_000,
      chunkSize: 10_000_000,
      totalChunkCount: 1,
    });

    expect(result).toEqual({
      publishId: 'v_pub_file~1',
      uploadUrl: 'https://upload.test/video?token=1',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(body.post_info.is_aigc).toBe(true);
    expect(body.post_info.brand_content_toggle).toBe(false);
    expect(body.post_info.privacy_level).toBe('SELF_ONLY');
    expect(body.source_info).toEqual({
      source: 'FILE_UPLOAD',
      video_size: 14_000_000,
      chunk_size: 10_000_000,
      total_chunk_count: 1,
    });
  });

  it('uploads a chunk with Content-Range and reads progress', async () => {
    const { api, fetchMock } = setup({}, 206, {
      'Content-Range': 'bytes 0-999/2000',
    });

    const result = await api.uploadChunk(
      'https://upload.test/video?token=1',
      new Uint8Array(1000),
      0,
      2000,
    );

    expect(result).toEqual({ httpStatus: 206, uploadedBytes: 1000 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers['Content-Range']).toBe('bytes 0-999/2000');
    expect(headers['Content-Length']).toBe('1000');
  });

  it('marks a 5xx chunk upload as retryable', async () => {
    const { api } = setup({}, 503);

    const error = await api
      .uploadChunk('https://upload.test/video', new Uint8Array(10), 0, 10)
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(TikTokApiError);
    expect((error as TikTokApiError).kind).toBe('retryable');
  });

  it('maps the post status', async () => {
    const { api } = setup(
      envelope({
        status: 'PUBLISH_COMPLETE',
        publicaly_available_post_id: [123, 456],
        uploaded_bytes: 14_000_000,
      }),
    );

    await expect(api.fetchStatus('act.token', 'v_pub_file~1')).resolves.toEqual({
      status: 'PUBLISH_COMPLETE',
      failReason: null,
      publiclyAvailablePostIds: ['123', '456'],
      uploadedBytes: 14_000_000,
      downloadedBytes: null,
    });
  });

  it('maps a failed post status and its reason', async () => {
    const { api } = setup(
      envelope({
        status: 'FAILED',
        fail_reason: 'spam_risk_text',
      }),
    );

    await expect(api.fetchStatus('act.token', 'publish-1')).resolves.toEqual({
      status: 'FAILED',
      failReason: 'spam_risk_text',
      publiclyAvailablePostIds: [],
      uploadedBytes: null,
      downloadedBytes: null,
    });
  });

  it('throws a classified error for a TikTok error code', async () => {
    const { api } = setup(
      envelope(null, 'spam_risk_too_many_posts'),
      403,
    );

    const error = await api
      .queryCreatorInfo('act.token')
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(TikTokApiError);
    expect((error as TikTokApiError).code).toBe('spam_risk_too_many_posts');
    expect((error as TikTokApiError).kind).toBe('terminal');
  });

  it('marks a rate limit as retryable', async () => {
    const { api } = setup(envelope(null, 'rate_limit_exceeded'), 429);

    const error = await api
      .fetchStatus('act.token', 'publish-1')
      .catch((value: unknown) => value);

    expect((error as TikTokApiError).kind).toBe('retryable');
  });
});
