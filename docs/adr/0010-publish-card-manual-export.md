# ADR-0010 — Publish card and manual export

**Status:** accepted · 2026-11-06

## Context

M2 ends with an approved `draft.mp4` in `REVIEW`. The run state machine already has
`SCHEDULED → PUBLISHING → PUBLISHED`, but the `publish` stage has no job: two raw buttons move
the run through `PUBLISHING` without doing anything, leaving a dead intermediate state. There
is no publish data model either: title, hashtags, privacy, schedule and the AIGC disclosure
lived only in the reviewer's head.

TikTok is not connected: there is no app audit, no `tiktok_accounts`, no token vault and no
upload path. Waiting for M1.2 would block the first real publication of a finished video.

M1.1 ships the publication slice without TikTok:

- store one publish card per run;
- create it automatically when the reviewer approves the draft;
- let the human edit the caption and download the draft;
- record the export and the manual publication honestly.

## Decision

### One card per run, full table

`publish_cards.run_id` is unique and cascades with the run. The table follows AGENTS §5 —
including nullable `publish_id`, `post_id` and `fail_reason` — so M1.2 can fill TikTok ids
without another migration. `state` is a Postgres enum (`draft | exported | published |
failed`), kept in sync with `PUBLISH_CARD_STATES` by `schema.spec.ts`. `failed` is unused in
this slice; it is the slot for publisher errors.

`is_aigc` is `true` by default, the API never reads it from the request, and the table has a
`CHECK (is_aigc = true)` constraint. The product rule is a database invariant, not a UI
toggle.

### The card is created by the approval transaction

`RunsService.transition()` prepares the defaults before the transaction:

- title — `script_json.title` when the artifact can be read, otherwise `run.topic`;
- hashtags — up to three words from the topic (deterministic, no LLM; «топ 5 пород собак» →
  `пород`, `собак`);
- `privacy_level = null`, `scheduled_at = null`, `state = draft`.

`RunsRepository.applyTransition()` then writes `runs`, `run_events` and
`INSERT … ON CONFLICT (run_id) DO NOTHING` for the card in **one transaction**. The script
read is best-effort: an S3 failure falls back to the topic and never blocks approval. A second
`REVIEW → SCHEDULED` keeps the reviewer's edits.

`GET /runs/:id/publish-card` never creates data as a side effect; it returns 404. The web store
turns that 404 into an empty form, and the first `PUT` creates the card.

The migration also backfills runs that reached `SCHEDULED`/`PUBLISHING`/`PUBLISHED` before the
table existed. The backfill can only use `runs.topic` (the script title was not persisted on
the run), so legacy cards start with empty hashtags and are edited in the UI. For legacy
`PUBLISHED` runs `published_at` is approximated by `runs.updated_at`; it is the best timestamp
the system has and is documented here rather than presented as an observed event. A second
migration truncates titles longer than 150 characters and adds a check constraint.

### Manual export

The video is not proxied through a new endpoint: the existing `draft_mp4` artifact keeps its
presigned URL. `presignGet` gained an optional download name, and the artifacts endpoint exposes
a second `downloadUrl` for `draft_mp4`, signed with `Content-Disposition: attachment`; without
it a cross-origin `<a download>` is ignored by the browser. The inline `url` stays untouched so
the `<video>` preview and «Открыть» keep working. The presign duration stays one hour.

The card offers:

- download the draft (this also calls `mark-exported`);
- copy the caption (title + hashtags) with a textarea fallback when the Clipboard API is
  unavailable;
- download the card as JSON (Blob + object URL, revoked immediately);
- mark the run published manually.

`exported_at` records the **first** download: repeated downloads do not move it, and a
published card is never downgraded. Copying the text alone does not mark the card exported —
the video is the artifact that gets exported.

Returning to `REVIEW` and approving a **new** draft resets `state` to `draft` and clears
`exported_at` when the new `draft_mp4` is younger than the export. Otherwise the card would
claim that a video nobody downloaded was already exported. The card's title, hashtags, privacy
and schedule survive the re-approval.

### Publication is one action, two audit rows

`POST /runs/:id/manual-publish` requires `SCHEDULED` and an existing card. In one transaction it
writes `SCHEDULED → PUBLISHING` and `PUBLISHING → PUBLISHED`, each with a `run_events` row and
reason «Ручной экспорт», then sets the card to `published` with `published_at`. The first
`UPDATE runs` is guarded by `state = 'SCHEDULED'`, so two overlapping requests cannot both
publish; the loser gets 409. The two event timestamps differ by 1 ms so the history order is
deterministic. A failure can never leave the run in `PUBLISHING`: there is no separate job and
no network call between the edges.

The generic `POST /runs/:id/transitions` endpoint rejects `PUBLISHING` and `PUBLISHED`: those
edges belong to the publish card. Hiding them in one client would leave the API as a path to a
`PUBLISHING` run without a job. The raw `SCHEDULED → PUBLISHING` / `PUBLISHING → PUBLISHED`
buttons are hidden too.

### UI placement

The card is rendered on the run page in `SCHEDULED` (editable) and `PUBLISHING` (read-only).
It is not shown in `REVIEW`: the reviewer approves the video first, then prepares the caption.
Privacy has no default value in the form. The `is_aigc` fact is a read-only badge.

`PublishCardStoreService` is route-scoped next to `RunDetailStoreService`; the card reads the
draft (`type === 'draft_mp4'`) from the detail store through an input. After a manual publish
the card emits `published` and the run page reloads the run and its history.

### API

- `GET /runs/:id/publish-card` — card or 404;
- `PUT /runs/:id/publish-card` — upsert; only in `SCHEDULED`/`PUBLISHING`; title 1–150,
  hashtags 0–30 (`#` normalization, case-insensitive de-duplication), nullable privacy,
  nullable ISO `scheduled_at`;
- `POST /runs/:id/publish-card/mark-exported` — first export timestamp;
- `POST /runs/:id/manual-publish` — two transitions + card update.

All routes sit under `SessionAuthGuard`.

## Alternatives considered

- **Minimal table with timestamps only, no states.** The UI needs to distinguish draft,
  exported and published; timestamps alone are ambiguous and M1.2 wants a failure slot.
  Rejected.
- **Create the card lazily on GET.** A read request would write data and the first reviewer
  would still see a 404 race. Rejected: the approval transaction is the natural creation point.
- **Create the card after the transaction in `PublishService.ensureForRun`.** Simpler wiring,
  but approval could succeed while the card insert fails, leaving a `SCHEDULED` run that the
  UI must repair. One transaction avoids the intermediate state. Rejected.
- **Keep the two raw publish buttons.** `SCHEDULED → PUBLISHING` alone is a dead end without a
  job; after a manual publication the user would press two buttons that do not correspond to
  anything. Rejected.
- **Add a new `SCHEDULED → PUBLISHED` edge.** Two audit rows on the existing edges tell the
  same story without changing the contract or the history viewer. Rejected.
- **Mark the card exported with the copy button or with saving.** Copying text is not exporting
  the video; saving the form is not exporting either. The download click is. Rejected.
- **Proxy the MP4 through the API for a forced download.** It wastes API bandwidth and
  duplicates storage. Signing `ResponseContentDisposition` is enough. Rejected.
- **Show the card in `REVIEW`.** It would add a second editing surface before the video is
  approved. Deferred until there is a real request for pre-filling.
- **Store `provider_usage` / TikTok ids now.** No provider call happens in M1.1; the nullable
  columns are reserved, not populated.

## Consequences

- New migration `0005` adds the enum, the table, the unique index, the AIGC check and the
  backfill for existing scheduled/published runs.
- Legacy scheduled runs get a topic-only title and no hashtags; the reviewer fills them once.
- The download URL carries a download name for `draft_mp4`; other artifacts keep their inline
  presigned URL.
- The web data layer gains `PublishCardApiService`, `PublishCardStoreService`,
  `publish-card-form.ts` helpers, a card component and a route-scoped provider.
- The run page no longer renders raw publishing transitions.
- M1.2 takes over the same card: `publish_id`/`post_id`, `tiktok_accounts`, token refresh,
  `video/init`, status/webhooks, rate limiting and the unaudited `SELF_ONLY` rule.
