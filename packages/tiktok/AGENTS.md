# packages/tiktok — TikTok Open API adapter

Applies to the HTTP adapter (`OAuth`, encrypted token vault, Content Posting API). The root
`AGENTS.md` still applies: `is_aigc: true` on every publish, the unaudited-app restrictions,
terminal/transient error classification and the publish UX rules stay cross-cutting and are not
repeated here. Token secrets never appear in logs, DTOs or error messages.

- OAuth (Login Kit): scopes `user.info.basic` + `video.publish`. Read token lifetimes from the
  token response (`expires_in`, `refresh_expires_in`); the docs checked on 2026-11-07 say
  access ≈2 h and refresh ≈180 days. **Refresh tokens rotate** — replace the stored refresh
  token on every refresh, and serialize refreshes per account. Tokens are encrypted at rest
  and never logged. Desktop/localhost authorization requires **PKCE**: send `code_challenge`
  (`S256`, hex SHA-256 per TikTok's desktop guide), keep the verifier server-side and send
  `code_verifier` during the code exchange.
- Upload: `FILE_UPLOAD` (5–64 MB chunks, sequential) is the first path; `PULL_FROM_URL`
  requires verified domain/URL-prefix ownership and a publicly reachable https URL (no redirects,
  available ~1 h). A **single-chunk** upload must declare `chunk_size === video_size`: TikTok
  rejects `chunk_size 10 000 000 / total_chunk_count 1` for a 13 MB file with
  `The chunk size is invalid`, even though the docs let the final chunk absorb the remainder.
- Publish flow: `creator_info/query` → `video/init` → poll `status/fetch` + webhooks
  (`post.publish.complete/failed/publicly_available`). Adapter details live here; the scheduling
  rule (no TikTok scheduling parameter, our delayed job triggers `video/init`) is in the root
  `AGENTS.md` §7.
