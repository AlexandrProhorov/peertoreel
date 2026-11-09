# AGENTS.md — AI Content Factory

Working agreement for humans and agents on this repo. If this file contradicts the code, one
of them is wrong — flag it instead of silently following either.

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
  render-worker/ # Remotion scene renderer (M3.2; React only here)
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
| Scene render | Remotion 4.0.x in `apps/render-worker` (M3.2) | React only there; pinned Chrome + local woff2; free ≤3 people (ADR-0012) |
| LLM | DeepSeek V4.1 Flash (default), stronger model for QC | behind `LlmProvider` port |
| TTS | ElevenLabs | `with-timestamps` returns character-level alignment; word timings are derived in our code (Scribe fallback if needed) |
| Stock | **Pixabay** API | Pexels dropped (new keys paused); 100 req/60 s, cache 24 h |
| Images | fal.ai (FLUX.2 `[klein] 4B` default) | `[dev]` weights are non-commercial; `[pro]`/commercial license required for monetized output. Behind `ImageProvider` port |
| Video gen | MiniMax H3 (via fal.ai), optional M3.7 | behind `VideoProvider` port; disabled by default; other models stay swappable (ADR-0012) |
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
| 1 | topic-discovery | project config, topic history | `topics[]` (title, angle, hook hypothesis) | LLM |
| 2 | research | topic | `research_brief` (facts, theses, 2–3 hooks, sources) | LLM |
| 3 | script | brief + template | `script` (hook → beats[] → CTA; per beat: text, duration, visual_direction) + `storyboard_json` (M3.5) | LLM (Zod-validated) |
| 4 | voiceover | beat texts | `voiceover.mp3` + character alignment → derived `word_timings` | ElevenLabs |
| 5 | visuals | `word_timings` + `visual_direction` per beat | `visuals_json` (scenes) + `visual_clip` / `visual_image` / `scene_clip` objects | Pixabay today; M3: storyboard scenes via Remotion / `ImageProvider` / `VideoProvider` (ADR-0012) |
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
- Progress of long jobs is streamed to the UI via SSE.

## 5. Data model (core tables)

```text
users, sessions, tiktok_accounts (user_id, open_id, encrypted tokens, expiry, scope), projects, templates, topics,
runs (state, current_stage, failed_stage, failure_reason, resume_state, cost_estimate),
run_events (run_id, from_state, to_state, stage, reason, created_at), artifacts (stage, type, r2_key, meta),
publish_cards (run_id unique, title, hashtags jsonb, privacy_level, is_aigc, scheduled_at,
               exported_at, published_at, state, publish_id, post_id, fail_reason),
jobs_audit (queue, job_id, run_id, state, attempts, error),
provider_usage (provider, model, units, cost_usd, run_id)
```

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
| research, script | 4–8 | validate LLM output against Zod schema; 3 retries on parse failure |
| tts | 2–4 | ElevenLabs rate limits |
| visuals | 1 | Pixabay **100 req/60 s**, cache every search for **24 h**; download only the selected asset; fallback to `testsrc2` per scene |
| scene-render (M3.4) | 1–2 | per-scene Remotion jobs, payload `{runId, sceneIdx}`; Chrome RAM; fallback to the scene's programmatic component |
| image-gen | 2 | fal.ai pay-per-use; record usage |
| render | 1–2 | FFmpeg is CPU-heavy (1–3 min per video); clean tmp files; report progress |
| qc | 1 | read-only checks on the current draft; a new render invalidates the old `qc_report` |
| publish | 1 | TikTok **6 req/min per token**, **~15 posts/day per account**, status fetch 30/min. The UI job polls status every 5 s; webhooks and a dedicated limiter are M1.2c |
| analytics-cron | 1 | periodic metrics pull |

## 7. TikTok integration rules

- **Status (M1.2b):** Login Kit OAuth, the encrypted token vault, `/accounts`, the `publish`
  queue and the publish-card button exist. A job moves the run
  `SCHEDULED → PUBLISHING → PUBLISHED/FAILED`, resumes by `publish_id` instead of creating a
  duplicate post, and uses the latest active account. Webhooks, a per-token rate limiter,
  per-card account selection and scheduled auto-publish are the next slice (ADR-0013).
- OAuth (Login Kit): scopes `user.info.basic` + `video.publish`. Read token lifetimes from the
  token response (`expires_in`, `refresh_expires_in`); the docs checked on 2026-11-07 say
  access ≈2 h and refresh ≈180 days. **Refresh tokens rotate** — replace the stored refresh
  token on every refresh, and serialize refreshes per account. Tokens are encrypted at rest
  and never logged. Desktop/localhost authorization requires **PKCE**: send `code_challenge`
  (`S256`, hex SHA-256 per TikTok's desktop guide), keep the verifier server-side and send
  `code_verifier` during the code exchange.
- Upload: `FILE_UPLOAD` (5–64 MB chunks, sequential) is the first path; `PULL_FROM_URL`
  requires verified domain/URL-prefix ownership and a publicly reachable https URL (no redirects,
  available ~1 h).
- Publish flow: `creator_info/query` → `video/init` → poll `status/fetch` + webhooks
  (`post.publish.complete/failed/publicly_available`). TikTok has **no scheduling parameter**;
  our own delayed job triggers `video/init` at `scheduled_at`.
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

### Web (Angular)

- Global `AGENTS_ANGULAR.md` conventions apply (signals, `input()`/`output()`, `@if`/`@for`
  with `track`, no zone.js assumptions, typed reactive forms, lazy routes).
- Feature layout: `features/<feature>/{api,data-access,pages,ui}`; `core/` for
  config/http/auth/layout; `shared/` for reusable UI.

  ```text
  features/<feature>/
  ├── api/
  │   ├── <feature>-api.service.ts
  │   └── <feature>-api.service.spec.ts
  ├── data-access/
  │   ├── <feature>-store.service.ts
  │   ├── <feature>-store.service.spec.ts
  │   └── local helpers/types only when needed
  ├── pages/
  ├── ui/
  └── <feature>.routes.ts
  ```

- Run progress, publish states and cost views render from signal stores fed by SSE.

#### Frontend data layer

- `api/<feature>-api.service.ts` (class `<Feature>ApiService`) extends `BaseApiService`
  (`core/api/base-api.service.ts`) and stays transport only: build the path, choose the HTTP
  method, pass parameters, map DTO → interface, validate the response schema through
  `get`/`post`/`postVoid`. It must not own state, cache, retry, `catchError`, user-facing
  messages, `firstValueFrom`/`lastValueFrom` or business decisions. A mapper that starts making
  business decisions belongs in the store/domain.
- `data-access/<feature>-store.service.ts` (class `<Feature>StoreService`) extends `BaseStore`
  (`core/state/base-store.ts`) and owns the feature state. Use `query(source)` for cancellable
  reads and `command(key, factory)` for one-shot mutations; `loading`, `pending` and `error` come
  from the base class. `query()` does not clear a previous error — call `clearError()` only at an
  explicit entry point (`load`, `setRelativeId`, `command`).
- Per-entity state is scoped by Angular DI: declare the store in the route `providers` (or a
  repeated component's `providers`), not `providedIn: 'root'`. Root stores are only for genuinely
  global state (session/auth, health, the system SSE job). Never keep a registry of per-entity
  store instances.
- A scoped detail store uses `setRelativeId(id)`; the component binds the route input once with
  `effect(() => store.setRelativeId(this.id()))`. Do not write `clear*()` methods or clean up a
  store from `ngOnDestroy`: leaving the route destroys the store.
- Progress of an in-flight job is rehydrated from the server when a scoped store is created (the
  BullMQ snapshot is the source of truth), not cached in a root singleton. This is what makes the
  progress bar survive navigation, F5 and a second tab.
- `data-access/` also holds domain helpers and local types tied to that store (e.g.
  `health.error.ts`). It is not a dumping ground for unrelated business logic, and a store or
  helper file must not exist without a current use.
- Use `switchMap` for cancellable reads. Use `BaseStore.command()` (an in-flight key) for
  submit/mutation flows so the same operation cannot be started twice; `exhaustMap`/`concatMap`
  remain fine inside a command when a stream itself needs serialization.
- `catchError` receives `unknown`; narrow it immediately to `HttpErrorResponse` or a domain
  error and normalize it through one shared mapper. `unknown` must not leak into public
  API/store signatures.
- A component may call `firstValueFrom` directly only for a trivial one-shot request with no
  shared state and no business logic. Otherwise the request belongs in a store.
- Cache and retry policies live in the store or a dedicated service, never in
  `<feature>-api.service.ts`.
- Tests sit next to the file they cover with a `.spec.ts` suffix; do not create a mirrored
  `tests/` tree. `api/<feature>-api.service.spec.ts` covers URL, method, mapping/validation
  with `HttpTestingController`; `data-access/<feature>-store.service.spec.ts` covers stores
  with fake Observables (`of`/`throwError`) and assertions on signals, error and loading state.
  `BaseStore` and `BaseApiService` have their own specs: counters, command deduplication,
  relative-id transitions, malformed payloads.
- Do not use the legacy `*.api.ts` / `*.store.ts` names for new web data services; no barrel
  files or path aliases were introduced with this layout.

### API (NestJS)

- Modules: `auth`, `accounts` (TikTok token vault), `projects`, `templates`, `pipeline`
  (runs/stages), `scripts`, `assets`, `renders`, `publish`, `analytics`, `integrations`
  (provider adapters).
- Controller → service → repository expresses dependency direction, not folder ceremony. A
  small module keeps `*.controller.ts`, `*.service.ts`, `*.module.ts` and its unit test in one
  folder (`health/`, `database/`, `redis/`, `config/`, `common/`, `db/`); do not add
  `controllers/`, `services/`, `repositories/` or `modules/` subfolders per module.
- Business rules in services. No vendor SDK calls in controllers or stores.
- Data access uses Drizzle: schema in `packages/db/src/schema.ts`, `DatabaseService.db` is the
  `NodePgDatabase`, repositories receive that handle. No SQL in controllers or stores.
- Schema changes are `drizzle-kit generate` migrations committed with the code. Applied
  migrations are immutable; never edit them, generate a new one. Production uses
  `drizzle-kit migrate`, never `push`.
- Multi-row invariants (run state transition + audit row) run in one transaction.

### Worker

- `apps/worker` is a separate plain Node.js process, not a Nest application. Job payloads,
  results and queue names live in `packages/contracts`.
- Every job handler is **idempotent**: re-running a job must not duplicate artifacts,
  posts or charges. Use run/stage state as the idempotency guard; use a deterministic
  `jobId` where the queue supports it.
- Classify provider errors: retryable vs terminal (see §7). Max attempts + backoff are
  configured per queue, never hardcoded in handlers.
- FFmpeg arguments come from structured inputs only — never interpolate user text into
  shell strings. Shell out with argument arrays.

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
  For the render worker: storyboard scene → component/fallback mapping, clip-local object
  timing, duration-in-frames and input-prop validation. Unit tests must not launch Chrome or
  call `renderMedia`.
- External providers are mocked in CI (port fakes or recorded fixtures). No real API calls,
  no real TikTok publishes in tests.
- Do not claim coverage, performance or cost numbers that were not measured.

## 10. Roadmap

| Milestone | Scope | Done when |
| --- | --- | --- |
| M0 — skeleton (~1 wk) | pnpm monorepo, compose (api, worker, web, postgres, redis, SeaweedFS), CI, health checks, migrations | `docker compose up` brings up everything; CI green |
| M1 — publish risk spike (~1 wk) | pre-made video upload to R2, minimal publish card, TikTok OAuth/init/status/webhooks, per-account rate limiter | one pre-made video published to a private test account; status visible in UI; manual export fallback validated |
| M2 — factory v1 (~2–3 wk) | stages 1–8 end-to-end: RU scripts, ElevenLabs + word timings, Pixabay visuals, FFmpeg assembly with karaoke subtitles, QC checklist, review screen | topic → approved draft video → calendar in one flow |
| M3 — Animated Factory (~60–90 h) | `storyboard.v1`; Remotion render worker; component library; `scene-render` queue; AI director; image/AI-video producers; storyboard UI | «−15°» experiment: ≥5 distinct scenes, consistent style, sync ±100 ms, ≤15 min render on 4 vCPU, ≤$0.5 (≤$2 with AI video), ≥80% scenes accepted without regeneration |
| M4 — Quality & Ops | style presets, vision QC, `provider_usage` cost ledger, manual scene replacement, music/ducking, Pixabay retry | two visual presets render correctly; cost views and budget warnings; scene replacement works |
| M5 — Scale & Monetization | batch generation, A/B hooks, analytics feedback, multi-platform publish | weekly batch run works unattended |

## 11. Hard rules

1. No TikTok publish without `is_aigc: true`.
2. Never retry terminal provider errors; always retry transient ones with backoff.
3. Cache Pixabay queries — the 100 req/60 s limit is real and shared across the whole app.
4. Never log or commit tokens, API keys, cookies or full OAuth payloads.
5. Stage re-entry must be idempotent; if you cannot make it idempotent, do not ship it.
6. No `any` in public interfaces; no vendor SDK imports outside provider adapters.
7. Record external spend in `provider_usage` at call time — no invented numbers anywhere.
8. Decisions that change this file get a short ADR in `docs/adr/` and an update here.
