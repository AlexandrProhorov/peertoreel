# AGENTS.md — AI Content Factory

Working agreement for humans and agents on this repo. If this file contradicts the code, one
of them is wrong — flag it instead of silently following either.

App-specific rules live next to the code and load only when you work there:
`apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `apps/worker/AGENTS.md`,
`apps/render-worker/AGENTS.md`, `packages/tiktok/AGENTS.md`. This root file is the map and the
cross-cutting contract.

## 1. What we are building

A content factory that takes a topic and produces a finished vertical short video
(1080×1920, 30 fps, H.264 + AAC) and publishes it to TikTok. Not one autonomous AI agent:
a **pipeline of independent stages with typed inputs and outputs**, human review at two
gates (script, final video).

- **Content language: Russian.** All LLM prompts generate RU content; UI is RU.
- **Volume: low** (a few videos per day at most). Optimize for clarity and reliability,
  not throughput. Single-region, single-tenant is acceptable.
- **M1 ships with pre-made video uploads** to validate the TikTok path before generative
  stages land. The factory (stages 1–7) is the end goal; publishing is already real.

## 2. Repo layout (pnpm monorepo)

```text
apps/
  web/          # Angular 22 dashboard
  api/          # NestJS REST API
  worker/       # Node.js BullMQ worker (pipeline stages, FFmpeg, TikTok publish)
  render-worker/ # Remotion scene renderer (M3.3 data-driven; React only here)
packages/
  contracts/    # Zod schemas, DTOs, stage contracts, error codes — single source of truth
  db/           # Drizzle schema + database handle shared by API and worker
  storage/      # S3-compatible object storage (SeaweedFS locally, R2 in production)
  tiktok/       # TikTok Open API adapter: OAuth, token cipher, Content Posting API
infra/          # Dockerfiles, compose, deploy config
docs/           # adr/, pipeline contracts, API notes
```

- One lockfile, one CI, atomic changes across packages. `packages/contracts` is the only
  place where request/response/stage payload shapes are defined.
- Node.js 24 LTS, pnpm 10+. Angular 22.x pinned; other deps latest stable at bootstrap.
- An app/package with its own conventions carries an `AGENTS.md` next to its code; it loads
  when an agent reads that area. The root file stays the map and the cross-cutting contract.

## 3. Stack (decided — do not swap without an ADR)

| Layer | Choice | Notes |
| --- | --- | --- |
| Web | Angular 22 (standalone, signals, zoneless) | Global `AGENTS_ANGULAR.md` conventions apply |
| API | NestJS + REST | modular monolith |
| DB | PostgreSQL + Drizzle ORM | relational model for runs/artifacts/cards; schema in `packages/db/src/schema.ts`, migrations via `drizzle-kit` |
| Queue | Redis + BullMQ | per-stage queues, retries, rate limiting |
| Worker | separate Node.js process | FFmpeg rendering, media downloads, provider calls |
| Storage | Cloudflare R2 (SeaweedFS locally) | all artifacts; custom domain needed for TikTok `PULL_FROM_URL`. MinIO community images were removed in 2026 — see ADR-0002 |
| Render | FFmpeg | 1080×1920, 30 fps, H.264/AAC, loudnorm −14 LUFS, ASS karaoke subtitles |
| Scene render | Remotion 4.0.x in `apps/render-worker` (M3.3) | data-driven storyboard renderer; React only there; pinned Chrome + local woff2; free ≤3 people (ADR-0012/0014) |
| LLM | DeepSeek V4.1 Flash (default), stronger model for QC | behind `LlmProvider` port |
| TTS | ElevenLabs | `with-timestamps` returns character-level alignment; word timings are derived in our code (Scribe fallback if needed) |
| Stock | **Pixabay** API | Pexels dropped (new keys paused); 100 req/60 s, cache 24 h |
| Images / Vectors | Recraft V4/V4.1 Vector (SVG) + fal.ai (FLUX.2 `[klein] 4B` / `[pro]` + BiRefNet v2) | `FLUX.2 [klein] 4B` (Apache 2.0) and `BiRefNet v2` (MIT) are commercial-safe; `FLUX [dev]` and self-hosted `Bria RMBG 2.0` (`CC BY-NC 4.0`) are non-commercial. Behind `ImageProvider` port (ADR-0015) |
| Video gen | MiniMax H3 (via fal.ai), optional M4.8 | behind `VideoProvider` port; disabled by default; other models stay swappable (ADR-0012) |
| Deploy | Docker Compose on one VPS | web + api + worker + postgres + redis |

Every external provider sits behind a port defined in `packages/contracts` (or a
`packages/providers` package): `LlmProvider`, `TtsProvider`, `StockProvider`,
`ImageProvider`, `VideoProvider`, `TikTokPublisher`. Providers are swappable; business code
never imports vendor SDKs directly. The TikTok OAuth/Content Posting HTTP adapter lives in
`packages/tiktok` (ADR-0011).

## 4. Pipeline

Each stage is an independent, idempotent BullMQ job: reads artifacts of previous stages,
writes its own artifact(s) to R2 + `artifacts` rows, advances the run state.

| # | Stage | Input | Output artifact(s) | Executor |
| --- | --- | --- | --- | --- |
| 1 | topic-discovery (planned) | project config, topic history | `topics[]` (title, angle, hook hypothesis) | LLM |
| 2 | research (planned) | topic | `research_brief` (facts, theses, 2–3 hooks, sources) | LLM |
| 3 | script | topic + template | `script` (hook → beats[] → CTA; per beat: text, duration, visual_direction) + `storyboard_json` (M3.5) | LLM (Zod-validated) |
| 4 | voiceover | beat texts | `voiceover.mp3` + character alignment → derived `word_timings` | ElevenLabs |
| 5 | visuals | `word_timings` + `visual_direction` per beat | `visuals_json` (scenes) + `visual_clip` / `visual_image` / `scene_clip` objects | Pixabay today; M3.3/M3.4 storyboard scenes via Remotion; `scene_clip` is M3.7; `ImageProvider` is M3.6 |
| 6 | render | `visuals_json` + voiceover + timings + template | `draft.mp4` + `subtitles.ass` | FFmpeg |
| 7 | qc | draft + script | `qc_report` (duration, loudness, sync, stop-words, AIGC flag, readability) + verdict | rules + FFmpeg |
| 8 | publish | video + publish card | TikTok post (`publish_id` → status → `post_id`) | TikTok API via the `publish` queue (manual export fallback) |

### Run state machine

```text
DRAFT → RESEARCHING → SCRIPT_READY → VOICE_READY → VISUALS_READY
→ RENDERING → REVIEW → SCHEDULED → PUBLISHING → PUBLISHED
                                         ↘ FAILED (failed_stage + failure_reason stored)
```

- Transitions are validated server-side; every transition writes an audit row (`run_events`
  for run state, `jobs_audit` for queue jobs).
- A failed stage restarts **only that stage** — never the whole run.
- Human gates: `SCRIPT_READY` (edit/approve script) and `REVIEW` (approve/reject final video
  with a comment; rejection regenerates from the chosen stage).
- Progress of system jobs is streamed via SSE; run-stage progress is currently polled through
  `GET /runs/:id/stages/:stage/job` (1.5 s). SSE for run stages is not implemented.

## 5. Data model (core tables)

`packages/db/src/schema.ts` is the authoritative field list — do not mirror the DDL here.
Implemented tables: `users`, `sessions`, `tiktok_accounts`, `runs`, `run_events`, `artifacts`,
`publish_cards`. Planned/not yet in schema: `projects`, `templates`, `topics`, `jobs_audit`,
`provider_usage` (run states and their fields are in §4 and ADR-0005/0006). Do not assume a
planned table exists until it is in `schema.ts` and has a migration.

Invariants that must hold regardless of the schema:

`publish_cards` is created automatically in the same transaction as `REVIEW → SCHEDULED`
(title from the script title, fallback to the run topic) and is the manual-export card until
TikTok is connected (ADR-0010). `is_aigc` is always `true`; the API never accepts it from the
client, and a check constraint rejects `false`.

`scenes` is not a table yet: M2.4 stores the scene list in the `visuals_json` artifact
(`runs/<runId>/visuals/visuals.json`). Add a table only when the review UI needs to query
individual scenes.

`provider_usage` (future ledger) will be written on every external call — dashboard cost views
and budget warnings read from it. Never estimate costs; record real usage. The visuals stage
already writes real `providerRequests` / `cacheHits` counters into `visuals_json`; the full
ledger is a separate milestone.

## 6. Queues and limits

| Queue | Concurrency | Hard limits to respect |
| --- | --- | --- |
| script (current) | 2 | validate LLM output against Zod schema; 3 retries on parse failure |
| voiceover (current) | 1 | ElevenLabs rate limits |
| visuals (current) | 1 | Pixabay **100 req/60 s**, cache every search for **24 h**; download only the selected asset; fallback to `testsrc2` per scene |
| render (current) | 1 | FFmpeg is CPU-heavy; clean tmp files; report progress |
| qc (current) | 1 | read-only checks on the current draft; a new render invalidates the old `qc_report` |
| publish (current) | 1 | TikTok **6 req/min per token**, **~15 posts/day per account**, status fetch 30/min. The UI job polls status every 5 s; webhooks and a dedicated limiter are M1.2c |
| scene-render (planned M3.7) | 1–2 | per-scene Remotion jobs, payload `{runId, sceneIdx}`; Chrome RAM; fallback to the scene's declared programmatic component |
| image-gen (planned M3.6) | 2 | fal.ai pay-per-use; record usage in `provider_usage` when the ledger lands |
| research (planned) | — | not implemented; do not assume the state has a processor |
| analytics-cron (planned) | 1 | periodic metrics pull |

## 7. TikTok integration rules

- **Status (M1.2b):** Login Kit OAuth, the encrypted token vault, `/accounts`, the `publish`
  queue and the publish-card button exist. A job moves the run
  `SCHEDULED → PUBLISHING → PUBLISHED/FAILED`, resumes by `publish_id` instead of creating a
  duplicate post, and uses the latest active account. Webhooks, a per-token rate limiter,
  per-card account selection and scheduled auto-publish are the next slice (ADR-0013).
- Publish flow, OAuth/PKCE, token rotation and upload mechanics (endpoint sequence,
  `FILE_UPLOAD` chunking) are adapter details — see `packages/tiktok/AGENTS.md`
  (ADR-0011, ADR-0013). The product rules below stay here.
- TikTok has **no scheduling parameter**; our own delayed job triggers `video/init` at
  `scheduled_at`.
- **`is_aigc: true` on every publish** — product/ethics rule and platform disclosure. The API
  field is optional; we always send it.
- Unaudited app: content is restricted to `SELF_ONLY`, accounts must be private, and at most
  5 users may post in a 24 h window. Public-account posting is blocked at `video/init`.
  Public publishing requires an app audit (M4, out of scope for MVP).
- Error handling: never retry terminal errors (`auth_removed`, `spam_risk`, `spam_risk_text`);
  retry transient ones (`5xx`, `video_pull_failed`, `internal`) with exponential backoff.
- Respect privacy/interaction UX rules from TikTok Content Sharing Guidelines when building
  publish UI (preview before publish, no default privacy value, no watermark on content).

## 8. Conventions

Rules for a single app or package live in its own `AGENTS.md` and load only when you work
there: `apps/web/AGENTS.md` (Angular), `apps/api/AGENTS.md` (NestJS), `apps/worker/AGENTS.md`
(BullMQ worker), `apps/render-worker/AGENTS.md` (Remotion renderer),
`packages/tiktok/AGENTS.md` (TikTok HTTP adapter). Put a new app-specific rule
in the closest file; the root gets only cross-cutting rules. Never copy a field list, a
milestone table or a full flow description into these files — link the single source of truth.

### Shared

- TypeScript `strict`; no `any` in public APIs, DTOs, form values. No `unknown` in public
  signatures either. `unknown` is allowed only at an unavoidable boundary (`catch`, raw
  external payload) and must be narrowed immediately. Normalize errors to user-facing messages
  in one place.
- Zod schemas in `packages/contracts` are the single source of truth for stage payloads,
  API DTOs and worker job payloads. API validates at the boundary.
- Secrets only via `.env` (never committed); validate env with Zod at boot.
- Conventional commits: `feat(worker): retry transient TikTok publish errors`.

### Sessions and learning

- One work session delivers one finished slice: code, tests, demo, and updated docs.
- End an implementation session with a short theory block (5–10 bullets) tied to the code
  that was just written. Keep it practical.
- Do not add control questions, quizzes or explain-back prompts to implementation sessions.
  Deep theory and review are a separate learning session.
- Update `SESSION_LOG.md` after each session. `LEARNING.md` is a local, gitignored
  learning artifact and is not part of the repository.

### App-specific

See the files listed at the start of this section. If a local rule contradicts a Shared rule,
fix one of them — do not assume the root wins; OpenCode combines instruction files and does not
resolve conflicts.

## 9. Testing

- Vitest for units; Testcontainers (Postgres/Redis) for API/worker integration; Playwright
  for a few e2e flows.
- Must-have test targets: stage contract schemas (including `stageForProgress`), run state
  machine transitions (including every failed-stage path), worker job idempotency (run twice,
  assert one result), publish error classification, token refresh flow, web base store/api and
  per-entity store lifecycle (relative id, rehydration, cancellation). For `visuals`:
  beat timings, Pixabay error classification/cache/limiter, scene selection, visual-track
  FFmpeg arguments and processor idempotency. For `qc`: duration, loudness, audio-gap/sync,
  stop-words, AIGC, readability and the review gate. For `publish`: card defaults and hashtag
  normalization, `isAigc` not settable from the client, `GET` 404, upsert, edit restrictions,
  first-export timestamp, manual publish (two audit rows), and the web card form/export helpers.
  For TikTok accounts: AES-GCM cipher round-trip, OAuth state consumption, refresh rotation
  under a lock, creator-info mapping, chunk planning and error classification (token vs
  retryable vs terminal). For the TikTok publish queue: deterministic job id, explicit privacy,
  resume by `publish_id`, terminal/retryable failure mapping and the run/card transition.
  For the render worker: arbitrary storyboard JSON → resolved scene (`componentId`/params/
  source/diagnostics), per-component params schemas/defaults, invalid-value diagnostics,
  explicit unknown-component failure, clip-local object timing, duration-in-frames, input-prop
  validation, local asset resolution, a custom-storyboard boundary test (no fixture imports in
  the core path), and seed/order determinism. For scene recipes: recipe → component/params
  composition, 2–3 variants, diversity rules and no per-topic code. For the asset library (when
  it lands): content hash/dedup, variants, resolver precedence and style-preset matching.
  Unit tests must not launch Chrome or call `renderMedia`.
- External providers are mocked in CI (port fakes or recorded fixtures). No real API calls,
  no real TikTok publishes in tests.
- Do not claim coverage, performance or cost numbers that were not measured.

## 10. Roadmap

`ROADMAP.md` is the plan of record: milestones, tasks, estimates and status. Shape:
M0 skeleton → M1 publish spike → M2 factory v1 → M3 Animated Factory → M4 quality/ops → M5
scale. MVP = M0 + M2 + manual export. M3.3–M3.7 were reordered on 2026-11-10
(renderer-first; see ADR-0014), and the subject-asset strategy plus MVP formats are fixed in
ADR-0015. Change scope or status in `ROADMAP.md`, not here; this file
only names the current milestone in §1 when it matters for the code.

## 11. Hard rules

1. No TikTok publish without `is_aigc: true`.
2. Never retry terminal provider errors; always retry transient ones with backoff.
3. Cache Pixabay queries — the 100 req/60 s limit is real and shared across the whole app.
4. Never log or commit tokens, API keys, cookies or full OAuth payloads.
5. Stage re-entry must be idempotent; if you cannot make it idempotent, do not ship it.
6. No `any` in public interfaces; no vendor SDK imports outside provider adapters.
7. Record external spend in `provider_usage` at call time — no invented numbers anywhere.
8. Decisions that change these instructions get a short ADR in `docs/adr/` and an update to the
   closest `AGENTS.md` (root only for cross-cutting rules; milestone changes also update
   `ROADMAP.md`).
9. Unknown or unimplemented scene components must fail explicitly. A fallback is allowed only
   when the storyboard declares it and the renderer implements it; never silently substitute a
   generic `kinetic-typography` scene.
10. AI image/vector models must never generate technical diagrams with baked-in labels or
    arrows. Diagrams use structured Remotion layers or verified text-free SVGs with Remotion
    callouts (ADR-0015).
