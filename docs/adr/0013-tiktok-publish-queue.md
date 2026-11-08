# ADR-0013 — TikTok publish queue and frontend button

**Status:** accepted · 2026-11-08

## Context

ADR-0011 shipped TikTok OAuth, the encrypted token vault and a CLI `tiktok:spike`. A real
private upload succeeded, so the next product gap was operational: publishing required a
terminal command. M1.1 already had a publish card and manual export; the card had privacy,
title, hashtags and `publish_id`, but no way to start a real TikTok post from the UI.

The upload takes tens of seconds, calls a rate-limited external API and must not run inside an
HTTP request. It also has to survive a page reload, and a retry must never create a second post.

## Decision

### Queue and API

- A dedicated BullMQ queue `publish` (job `tiktok-publish`, concurrency 1), **not** a stage
  queue. The publish action is owned by the publish card, not by
  `POST /runs/:id/stages/:stage`.
- Deterministic job id `publish-<runId>`: at most one publish job per run.
- `POST /runs/:id/tiktok-publish` requires `SCHEDULED`, an existing card, an explicit
  `privacyLevel` and an active account with the `video.publish` scope. It returns `202` and a
  queued job snapshot.
- `GET /runs/:id/tiktok-publish/job` returns the BullMQ snapshot.
- `GET /runs/:id/tiktok-publish` returns the account and current job for page rehydration.

The MVP uses the most recently updated active account of the run owner. Per-card account
selection is a later slice.

### Worker and state machine

- The worker re-checks `SCHEDULED`, moves the run to `PUBLISHING` with the audit reason
  `TikTok publish`, and publishes the card.
- On success it updates the card (`state = published`, `publish_id`, `post_id`,
  `published_at`) and moves the run to `PUBLISHED` — one audit row per edge.
- On failure the card becomes `failed`; on the final attempt the run becomes `FAILED` with
  `failed_stage = publish` and `resume_state = SCHEDULED`, so "retry" returns to the card and
  the button can start again.
- `publish_id` is written **before** the chunks are uploaded. If the job is retried (or the
  page reloads), the worker polls the existing `publish_id` instead of calling `video/init`
  again. This is the duplicate-post guard.
- `creator_info` is queried before init; the requested privacy must be in
  `privacy_level_options`, and the creator's disabled duet/comment/stitch flags are forwarded.

### Frontend

- The publish card gains a TikTok section: connected account, a primary
  «Опубликовать в TikTok» button, job progress, and the published result.
- The button is disabled until the card has a saved privacy level. For the unaudited app the
  only working value is `SELF_ONLY`; the UI says so instead of silently choosing it.
- The store saves the current form first, then enqueues, so the post uses exactly the title,
  hashtags and privacy on screen.
- It polls the job every 1.5 s, rehydrates an in-flight job on mount, and reloads the run on a
  terminal status. The run page now also renders the card in `PUBLISHED` (read-only).
- Manual export and the manual publish fallback remain.

### Limits of this slice

- No webhooks: status is polled. At 5 s per poll this stays under TikTok's 30 status
  requests/min limit, and one job makes only two non-status calls (`creator_info`, `init`),
  below 6/min. A dedicated limiter is still required before multiple concurrent accounts.
- No per-card account selector.
- No scheduled auto-publish: `scheduled_at` remains a reminder; a human presses the button.
- `post_id` is parsed from a JSON number. TikTok returns int64 values that can exceed
  `Number.MAX_SAFE_INTEGER`; the displayed/stored post id may be imprecise. Webhooks return
  `post_id` as a string and will replace this path in the next slice.

## Alternatives considered

- **Run the upload inside the POST request.** It would block for tens of seconds, time out on
  proxies and make the UI retry ambiguous. Rejected.
- **Reuse the stage queue/`POST /stages/publish`.** The generic stage endpoint has no
  privacy/account/card checks, and `stageForState` maps publish states for progress. A
  dedicated action is clearer and keeps the stage queues for media work. Rejected.
- **Default privacy to `SELF_ONLY` silently.** The Content Sharing Guidelines and our own
  ADR-0010 require an explicit user choice; the button stays disabled until a privacy is
  saved. Rejected.
- **Create a new post on every retry.** It consumes the unaudited daily cap and duplicates
  content. Resuming by `publish_id` is mandatory. Rejected.
- **Add a `publish_jobs` table.** BullMQ's deterministic job id plus the card's `publish_id`
  already provide idempotency; the queue snapshot is the source of truth for progress.
  Rejected.
- **Build webhooks and a rate limiter in the same slice.** They are valuable but independent;
  one button and one job do not need them to be correct. Deferred.

## Consequences

- New queue `publish`, new API endpoints, a new worker processor and a TikTok section in the
  publish card.
- No database migration: the card already has `publish_id`, `post_id`, `fail_reason`,
  `published_at` and `state`.
- The worker needs `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` and a
  Redis connection for the token lock. Without them the job fails with a clear terminal
  message.
- A failed publish leaves the run `FAILED` with `resume_state = SCHEDULED`; retry is a normal
  transition, and `publish_id` lets the next job resume instead of re-initializing.
- Next slice: webhooks (`post.publish.complete/failed/publicly_available`), per-token rate
  limiter, account selection, and scheduled auto-publish.
