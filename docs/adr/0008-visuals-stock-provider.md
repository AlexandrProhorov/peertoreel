# ADR-0008 — Visuals stage: Pixabay behind a StockProvider port

**Status:** accepted · 2026-11-05

## Context

M2.2 and M2.3 closed the pipeline up to `REVIEW`, but the render stage still used a
synthetic `testsrc2` background. M2.4 has to turn `VOICE_READY` into `VISUALS_READY`:
pick a vertical clip or photo for every beat, store only the chosen assets, keep timing
aligned with the real voiceover, and make render consume those scenes.

The session had to decide five things:

1. How to search Pixabay when `visualDirection` is written by an LLM.
2. How to derive scene boundaries from TTS word timings.
3. Whether scenes deserve a database table in this milestone.
4. Where to record provider usage while the full `provider_usage` ledger does not exist.
5. What happens when one scene, or every scene, has no usable asset.

## Decision

### Stock provider port

- `packages/contracts/src/visuals.ts` defines `StockProvider`, `StockAsset` and the
  `VisualsArtifact` / `VisualScene` schemas. Worker code depends on the port, never on
  Pixabay response shapes.
- `apps/worker/src/stock/pixabay.ts` implements the port:
  - videos: `https://pixabay.com/api/videos/`, `video_type=film`, `safesearch=true`,
    `per_page=5`, `page=1`;
  - photos: `https://pixabay.com/api/`, `image_type=photo`, `orientation=vertical`,
    `safesearch=true`;
  - a video is preferred; when the query has no usable video, the provider searches a
    vertical photo. This is what makes “clip or picture” real instead of theoretical.
- Only the selected asset is downloaded. The download checks `content-type`, enforces a
  size limit (video 50 MB, image 15 MB) and has a timeout/abort path.
- The API key comes from `PIXABAY_API_KEY` (optional at boot). It is never logged, never
  part of a cache key, and never written to an artifact.

### Language

The script prompt already requires `visualDirection` in English, so there is no second LLM
call and no translation cache. The provider passes the direction as `q` and omits `lang`
(Pixabay default is English). If a legacy script contains Cyrillic, the provider adds
`lang=ru`; this keeps old runs searchable without changing the common path.

### Cache and rate limit

- Every search result is cached in Redis for 24 h:
  `pixabay:search:<sha256(query|kind|lang|page|perPage)>`. The API key is not part of the
  hash. A cache hit does not call Pixabay and does not spend the rate limit.
- The limiter is an in-process sliding window of 100 requests / 60 s. The visuals queue
  runs with `concurrency: 1`, so it is effectively global for this deployment. If the
  worker is ever scaled horizontally, the limiter must move to Redis.
- No internal retries: a retryable error is thrown to BullMQ, which owns attempts and
  backoff. This prevents hidden request storms on top of the rate limit.

### Scene timing

`deriveBeatTimings(script, words)` walks hook → beats → CTA and matches normalized word
tokens (lowercase, punctuation removed) against the TTS alignment. If every part matches,
each part starts at its first word and ends at its last word. If anything diverges, the
whole plan falls back to planned durations: hook 3 s, each beat’s `durationSec`, CTA 3 s,
scaled to the real audio end. Mixing aligned and planned parts would hide a bad alignment,
so it is intentionally all-or-nothing.

The resulting parts are made contiguous: the hook starts at 0, each scene ends where the
next one starts, and the CTA ends at the last word. Pauses and leading silence therefore
stay covered by the previous/next visual. Empty `word_timings` is a stage error.

### Scene plan

- One scene per hook, beat and CTA: `beats.length + 2`.
- The hook reuses the first beat’s direction, the CTA reuses the last beat’s direction.
  Their search is served by the cache; the selector avoids reusing the same asset when the
  search returned alternatives.
- Selection prefers vertical assets, then resolution and enough footage, then assets not
  used by another scene.
- Semantic relevance comes first. The script provides a `visualAnchor` (the main subject,
  e.g. `dog`); older scripts get one derived from the most repeated unigram/bigram in the
  beat directions. Pixabay tags must contain the anchor, and API rank is the primary score,
  so a relevant dog clip beats a prettier but unrelated cat clip. If the primary query has
  no anchor-tagged result, the provider retries with the anchor alone. If a tag-matching
  clip is already used, the anchor query is tried before accepting reuse.
- Object keys are `runs/<runId>/visuals/scene-<idx>` without an extension. `contentType`
  lives in the artifact row. A video → image change overwrites the same key instead of
  leaving a stale file. If a scene becomes a fallback, the old key is deleted.
- `visuals_json` (`runs/<runId>/visuals/visuals.json`) is the single render input. It
  contains the scenes, `durationSec`, and the real `providerRequests` / `cacheHits`.

### No `scenes` table

The scene list has one consumer today: the render stage. A table would need a migration,
repository methods and a review UI before it has any reader. `visuals_json` is enough and
keeps re-runs idempotent via deterministic object keys. The table returns when the review
screen needs to query individual scenes.

### Fallback and terminal failures

- One scene without an asset becomes `kind: 'fallback'`; the stage still finishes.
- If every download fails or every query returns nothing, the run still reaches
  `VISUALS_READY` with fallback scenes. Audio and subtitles are intact, so the draft can
  still be reviewed.
- Download errors (including 429/5xx/timeout, wrong content type, oversize) degrade the
  scene to fallback. Search errors are different: 429/5xx/timeout go back to BullMQ;
  400/401/403/malformed payload are terminal and fail immediately.
- Missing `PIXABAY_API_KEY`, missing `script_json`/`word_timings`, or empty alignment are
  stage failures. Terminal provider errors are converted to BullMQ `UnrecoverableError`,
  and `handleFinalFailure` marks the run `FAILED` even when `attemptsMade` is below
  `attempts`.

### Render

- `media/visual-track.ts` turns scenes into silent 1080×1920 / 30 fps segments.
  Videos use `-stream_loop -1` + `-t`, images use `-loop 1` + `-t`, fallbacks use
  `testsrc2`. Segments are joined with the concat demuxer **and re-encoded to CFR**
  (`fps=30`, libx264). `-c copy` looked cheaper but left DTS gaps at the joins; the muxer
  then dropped ~3 s chunks of the voiceover at scene boundaries and the final draft
  desynced from the subtitles.
- The target duration is `lastWordEnd + 1`: the last scene is extended if the scenes are
  shorter and the tail is trimmed if they are longer.
- Runs without a `visuals_json` keep the old `testsrc2` clip, so M2.3 drafts remain
  renderable. `meta.background` is `'visuals'` when at least one real asset was used and
  `'fallback_testsrc2'` otherwise.

### Provider usage

Pixabay is free and the full `provider_usage` ledger is not part of M2.4. The stage records
real counters: `providerRequests` (search + download attempts) and `cacheHits` (search
results served from Redis). No monetary estimate is invented. The ledger remains a
separate milestone with its own migration and ADR.

## Alternatives considered

- **Use `lang=ru` for every search.** The script prompt already produces English keywords;
  translating at search time would add a provider call and make retries non-deterministic.
  Rejected.
- **Add an LLM step that rewrites directions into English.** Useful only if the quality of
  the script prompt drops. It adds cost and a second cache. Deferred.
- **One scene per beat, stretching the first/last beat over hook/CTA.** Fewer scenes, but
  the hook and CTA lose their own visual identity. Rejected for a 40–60 s vertical video.
- **Store all search results.** Wasteful and exposes stock content in the artifact list.
  Only selected assets are downloaded.
- **Add the `scenes` table now.** No current reader, migration and repository cost.
  Rejected for M2.4.
- **Retry downloads inside the stage.** Would multiply Pixabay traffic and hide a systemic
  download outage. Fallback is visible in `visuals_json` and in the render meta.
- **Use a Redis rate limiter now.** The worker is single-process and visuals concurrency is
  1; a Redis limiter adds an atomic script with no current need. Revisit when scaling.

## Consequences

- `render` no longer needs `testsrc2` for new runs, but the fallback path remains for old
  runs and for failed downloads.
- A visuals re-run overwrites scene objects and removes stale ones; artifact rows stay
  unique by `object_key`.
- `providerRequests` and `cacheHits` are the first real provider counters in the product;
  they are deliberately not a cost ledger.
- The web layer needs no new page or store: `VOICE_READY → visuals` is a contract mapping,
  and stage progress rehydration uses the existing `stageForProgress` path.
- The worker now depends directly on `ioredis` for the search cache; cache failures degrade
  to misses and do not fail the stage.
