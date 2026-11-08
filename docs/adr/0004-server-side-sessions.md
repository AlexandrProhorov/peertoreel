# ADR-0004 — Server-side sessions for auth

**Status:** accepted · 2026-11-03

## Context

M0 needs authentication before any business table appears: runs, projects and
publish cards must belong to someone, and the TikTok token vault will hang off
`users`. The product is single-tenant with a handful of operators, served from one
VPS. There is no mobile client and no third-party API consumer yet.

## Decision

Sessions are rows in Postgres, addressed by an opaque random token in an
`httpOnly` cookie.

- `users` — id (uuid), email (normalized lowercase), display name, argon2id hash,
  role (`admin` | `editor`), `is_active`, timestamps.
- `sessions` — id, `user_id` (ON DELETE CASCADE), `token_hash` (unique),
  `created_at`, `last_seen_at`, `expires_at`, indexes on user and expiry.
- The browser gets `randomBytes(32)` in `peertoreel_session`; the database only sees
  `sha256(token)`, so a DB dump does not hand out live sessions.
- Cookie: `httpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`,
  `Path=/`, `Expires` = session expiry. TTL is `SESSION_TTL_HOURS` (default 168 h).
- `last_seen_at` is refreshed at most once per 5 minutes to avoid a write per request.
- Passwords use `@node-rs/argon2` (Argon2id, 19 MiB, t=2, p=1) — prebuilt binaries,
  no node-gyp on Windows.
- Login failures always cost one hash verification, including unknown emails, which
  keeps response timing from revealing which accounts exist.
- `POST /auth/logout` deletes the row and clears the cookie. Revocation is immediate.
- First admin comes from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` only
  while `users` is empty; the values can be removed afterwards.

## Alternatives considered

- **JWT in a cookie** — no DB round-trip per request, but logout and "kick this
  device" need a denylist anyway, and rotation/clock handling is more code than one
  indexed lookup. Rejected for now.
- **Passport strategies** — extra indirection (strategies, serializers) for one
  cookie scheme. A single `SessionAuthGuard` is readable and typed.
- **Sessions in Redis** — faster, but Redis is a queue transport here; losing it
  should not sign everyone out. Postgres is the durable store anyway.

## Consequences

- Every authenticated request costs one indexed query (`token_hash`) plus a join.
  Acceptable at this volume; revisit only if it shows up in measurements.
- Sessions survive API restarts and share a single source of truth with `users`.
- Not covered yet: login rate limiting/lockout, MFA, CSRF tokens (safe while the
  cookie is `SameSite=Lax` and the API only accepts JSON bodies), per-user audit log,
  scheduled cleanup of expired rows (currently pruned opportunistically at boot).
