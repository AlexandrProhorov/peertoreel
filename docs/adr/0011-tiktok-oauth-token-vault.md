# ADR-0011 — TikTok OAuth, encrypted token vault and upload spike

**Status:** accepted · 2026-11-07

## Context

M1.1 ended with a publish card and manual export. The next risk is TikTok itself: OAuth,
token lifetime/rotation, `creator_info`, `video/init`, chunked `FILE_UPLOAD` and status
polling. The old AGENTS note said access tokens live ~24 h and refresh tokens ~365 days; the
official docs checked on 2026-11-07 say **access ≈2 h, refresh ≈180 days**, and refresh tokens
**rotate on every refresh** (the previous refresh token is invalidated immediately). Hardcoding
the old numbers would make a background refresh job either late or useless.

The app is also not audited, so TikTok restricts direct posts to `SELF_ONLY` and private
accounts. `PULL_FROM_URL` needs a verified https domain; `FILE_UPLOAD` does not.

This slice (M1.2a) builds the account connection and one real upload path before the queue/UI
publish flow (M1.2b), so the integration can be validated against a private test account
without touching the run state machine.

## Decision

### `packages/tiktok` adapter

All vendor-specific code lives in `@peertoreel/tiktok`, used by API and worker:

- `TikTokApi` — authorization URL, code exchange, refresh, revoke, user info, creator info,
  video init, chunk upload, status fetch;
- `TokenCipher` — AES-256-GCM token encryption (`v1.iv.tag.ciphertext`), 32-byte key;
- `planChunks` — TikTok's chunk rules (≤5 MB as one chunk, 5–64 MB chunks, floor division,
  remaining bytes merged into the final chunk);
- error classification — `token` (refresh once), `retryable` (429/5xx/network), `terminal`
  (spam, auth removal, media validation).

No vendor URL or OAuth payload appears in controllers, stores or business services.

### Token vault

`tiktok_accounts` stores one row per `(user_id, open_id)`:

- `access_token_encrypted`, `refresh_token_encrypted` — never plaintext, never returned;
- `access_expires_at`, `refresh_expires_at` — computed from `expires_in` /
  `refresh_expires_in`, not from hardcoded lifetimes;
- `scope`, `display_name`, `avatar_url`, `is_active`, `last_refreshed_at`.

`TOKEN_ENCRYPTION_KEY` is a 32-byte secret (base64 or 64 hex). It is optional at boot like
provider keys: without it the accounts module returns 503 with the missing variable names, and
the rest of the app keeps working. Key rotation is out of scope; changing the key requires
reconnecting accounts.

### OAuth state and callback

`GET /api/v1/accounts/tiktok/authorize` requires the Peer to Reel session, creates a random state,
stores `tiktok:oauth:<state> → userId` in Redis for 10 minutes and returns the TikTok consent
URL. The callback:

- does **not** require the Peer to Reel cookie: TikTok redirects the browser top-level, and the
  one-time state is the proof of the user;
- consumes the state with `GETDEL`, exchanges the code, reads `user.info.basic`, encrypts and
  upserts the tokens;
- redirects to `${WEB_APP_URL}/accounts?tiktok=connected` or `?tiktok=error`; error details are
  logged without tokens or the full OAuth payload.

`GET /accounts/tiktok` returns metadata only. `DELETE /accounts/tiktok/:id` revokes the token
best-effort and deletes the row locally. `GET /accounts/tiktok/:id/creator-info` is the
connection check and returns the account's privacy options and limits.

### Refresh and rotation

`TikTokTokenService.accessTokenFor()` refreshes when the access token expires within 120 s:

- a Redis `SET NX EX 30` lock per account prevents two processes from rotating the refresh
  token at the same time;
- the winner calls `POST /v2/oauth/token/` with `grant_type=refresh_token`, then stores **both**
  rotated tokens;
- a waiter re-reads the row and uses the fresh access token;
- an invalid refresh token is mapped to "reconnect the account", not to a retry loop.

### Upload spike, not the publish queue yet

`apps/worker/src/tiktok/tiktok-spike.ts` takes a `SCHEDULED` run with a `draft_mp4`, a connected
account, downloads the draft from S3 and:

1. refreshes the token if needed;
2. calls `creator_info/query`;
3. defaults to `SELF_ONLY` and refuses a privacy level absent from the creator options;
4. calls `video/init` with `is_aigc: true`, `brand_content_toggle: false`,
   `brand_organic_toggle: false`, `FILE_UPLOAD` and the planned chunk size/count;
5. uploads chunks sequentially with `Content-Range`;
6. polls `status/fetch` every 5 s for up to 5 minutes.

`--dry-run` stops after creator info. The spike does not change the run state or the card; it
prints `publish_id`, status and post ids. A `SELF_ONLY` post does not return
`publically_available_post_id`, so a null post id is expected for unaudited accounts.

M1.2b will move this logic into a `publish` BullMQ queue, write `publish_id`/`post_id`/
`fail_reason` on the card and drive `SCHEDULED → PUBLISHING → PUBLISHED/FAILED` with the
existing audit transaction. Doing that before a real upload works would build queue semantics on
unverified API behavior.

The spike repeats the refresh-lock logic instead of importing `TikTokTokenService` (which is a
Nest provider tied to the API). The lock key and TTL are the same, so an API refresh and a spike
refresh cannot rotate the token concurrently. M1.2b should extract the vault into a shared
library and delete the duplicate.

The spike stores `publish_id` on the card immediately after `video/init`; a second run refuses
to start a new post and requires `--publish-id` to resume polling. This is the guard against
double publishing while the upload is a standalone command.

### Unaudited app constraints

- Only private accounts can post; `video/init` returns
  `unaudited_client_can_only_post_to_private_accounts` otherwise.
- The privacy selector in the future publish UI must show `privacy_level_options` from
  `creator_info` and must not default to a public value.
- Daily caps and spam errors are terminal; they are never retried automatically.

## Alternatives considered

- **Store tokens in plaintext or in the web session.** A database dump or a browser compromise
  would leak creator access. Rejected.
- **Put the OAuth state in a cookie.** The callback arrives from tiktok.com; relying on a
  SameSite cookie adds a failure mode and couples the callback to the app session. Redis state
  is one-time and browser-independent. Rejected.
- **Hardcode 24 h/365 d lifetimes.** The official numbers changed; `expires_in` is returned on
  every grant. Rejected.
- **Refresh without a lock.** Refresh tokens rotate; two concurrent refreshes invalidate each
  other. Rejected.
- **Start with `PULL_FROM_URL`.** It needs a verified https domain/prefix and a public object;
  `FILE_UPLOAD` works locally and is the AGENTS first path. Rejected for now.
- **Build the full queue + UI publish in this slice.** The upload API needs a live check first;
  the queue would encode unverified assumptions about status timing and error codes. Deferred
  to M1.2b.
- **Use a TikTok SDK.** No official Node SDK covers the Content Posting API; a small typed
  fetch adapter is easier to audit and mock. Rejected.

## Consequences

- New package `@peertoreel/tiktok`, new migration `0007` (`tiktok_accounts`), new API module
  `accounts`, new web route `/accounts`.
- `.env` gains `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`,
  `TOKEN_ENCRYPTION_KEY`, `WEB_APP_URL`.
- AGENTS token-lifetime text is corrected to "read from the response; docs currently ~2 h /
  ~180 d, rotated".
- The run page still shows only manual export until M1.2b. The spike is the first real upload.
- `provider_usage` is not involved: TikTok posting itself has no per-call price. App review and
  account prerequisites are the real blockers.
