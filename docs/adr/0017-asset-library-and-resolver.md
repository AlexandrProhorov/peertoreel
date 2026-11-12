# ADR-0017 — Asset Library and Resolver contract

**Status:** accepted · 2026-11-11

## Context

ADR-0015 (D2–D4) fixed the three-tier subject-asset funnel, the mandatory palette
normalization and the parametric character rig. M3.4/M3.5 shipped the Tier 0 curated starter
pack (`apps/render-worker/public/assets/starter/`) and prove that recipes and the DeepSeek
director can fill subject slots. M3.6 must turn that single static list into a library:
metadata, content hash, variants, licensing, a deterministic resolver and a style preset.

M3.6 is also too large for the available environment: `RECRAFT_API_KEY` / `FAL_KEY` are absent
and no Docker daemon is running, so no real paid generation or DB/R2 integration can be
verified in this session. The milestone is therefore split:

- **M3.6a (this ADR):** contracts, DB schema/migration, `packages/assets`, resolver, SVG
  normalization, OKLab palette quantization, fake `ImageProvider`, `studio_flat_2d_v1`, renderer
  input props for resolved assets. No paid calls, no real network.
- **M3.6b:** real Recraft Vector / FLUX.2 + BiRefNet adapters, raster-cutout normalization with
  real PNG decoding, `cartoon-character`, third topic, full M3.6 acceptance.

The split has to be explicit, otherwise "M3.6 DONE" would claim unverified provider work.

## Decision

### D1 — Ports and metadata live in `packages/contracts`

`packages/contracts/src/assets.ts` owns the only definition of:

- `AssetKind` = `svg` | `png` | `raster-cutout`;
- `AssetSource` = `starter` | `library` | `recraft` | `flux` | `upload`;
- `AssetLicense` = `{ name, commercialUse, attribution? }`;
- `AssetVariant` = `{ id, objectKey, url?, mimeType, width, height, contentHash }`;
- `AssetRecord` = `{ id, key, source, kind, styleId, contentHash, tags, license, variants,
  metadata }`;
- `AssetRequest` / `AssetResolution` / `AssetDiagnostic` / `AssetUsage`;
- ports `AssetResolver` and `ImageProvider`;
- typed errors `UnknownAssetError`, `AssetLicenseError`, `ProviderUnavailableError`,
  `UnsupportedAssetKindError`;
- `buildAssetObjectKey(contentHash, fileName)` — the content-addressed object key used by the
  resolver, the DB row and the storage adapter (single format, no per-module copies).

The resolver **implementation** is not in contracts: contracts stay dependency-free and browser
safe. `packages/assets` contains the Node-only implementation, normalization, repository
interface and the fake provider.

### D2 — Metadata is data; the DB mirrors the contract

Two tables, mirroring the record (no JSON blob as the only source of truth):

- `assets`: `key`, `source`, `kind`, `style_id`, `content_hash` (unique), `tags`, `license_name`,
  `commercial_use` (check constraint `= true`), `attribution`, `metadata`, `created_at`;
  unique `(key, style_id)`.
- `asset_variants`: `asset_id` FK, `variant_id`, `object_key`, `mime_type`, `width`, `height`,
  `content_hash`; unique `(asset_id, variant_id)`.

`metadata` stays JSON because provider/generation details evolve; queryable fields stay columns.
The same rule as `artifacts`: the object lives in S3/R2, the row is the source of truth. The
contract `AssetRecord.id` has no column: it is derived from `source + key` by `buildAssetId()` so
an in-memory fake and a DB adapter reconstruct the same value.

### D3 — Content hash is the identity of bytes

`sha256Hex(bytes)` is the only identity for deduplication. Saving bytes that already exist
returns the existing record/variant instead of a second row; the object key is
`assets/<hash[0..2]>/<hash>/<hash>.<ext>` — the file name is a pure function of the hash, so one
blob cannot acquire two keys. Variants of one logical asset share `key` but differ by
`variant.id`; byte-identical variants collapse to one stored object.

A content-hash hit with a *different* logical key returns the record that owns those bytes **and**
writes an alias row `(key, style_id) → content_hash` in `asset_aliases` (D11). The alias is written
on persist (`assets:import`, `--persist`) and read by the resolver's cache tier, so the second key
resolves as a cache hit instead of re-entering the provider tier. `assets.content_hash` stays
globally unique: an alias never creates a second row and never duplicates bytes.

### D4 — Resolver order is fixed and deterministic

`TieredAssetResolver.resolve(request)`:

1. **starter** — exact `assetKey` in the Tier 0 index (or a tag match when no key is given);
2. **cache** — repository lookup by `key + styleId`, then deterministic tag scoring
   (`matched tag count`, then key ascending); `cacheHit: true`;
3. **provider** — only when `allowProvider === true`, a provider is injected, it is `enabled`
   and `supports(kind)`. The result is normalized, hashed, deduplicated and saved; a hash hit is
   reported as `cacheHit: true`. A provider that cannot produce the requested kind is a *skip*,
   not an abort: the fallback tier still applies;
4. **fallback** — `fallbackKey` resolved through the same starter/cache lookups (same `kind`);
5. **typed error** — `UnknownAssetError`, `ProviderUnavailableError`,
   `UnsupportedAssetKindError` or `AssetLicenseError`. Provider output that cannot be normalized
   (no `<svg>` root) becomes `InvalidAssetError`, so an adapter cannot leak an untyped
   `InvalidSvgError` after a paid call.

Rules that fall out of this order:

- with `allowProvider: false` (default) the resolver never touches the provider — a unit test
  asserts zero provider calls;
- identical request + repository state + provider output ⇒ identical resolution (no clock,
  random, network or filesystem reads inside the resolver); tag tie-breaks use code-unit
  comparison, not `localeCompare`, so the result does not depend on host locale;
- a matched asset with `license.commercialUse === false` throws `AssetLicenseError`; it is never
  silently skipped, so a bad library row cannot masquerade as a fallback;
- usage is recorded from what the provider actually reports (`costUsd: null` when the provider
  does not measure cost — never an estimate); a caller aggregating several resolutions keeps
  `null` if any part is unmeasured.

### D5 — Normalization is pure and mandatory before library storage

`packages/assets/src/normalize-svg.ts` is a pure function over SVG text (no DOM):

1. removal of full-bleed background `<rect>` elements (a generator-painted canvas is not part of
   the subject), counted in the result. This runs **before** `svgo` because the optimizer turns
   simple rects into paths; the pass is bounded to the rendered tree and skips
   `<defs>`/`<clipPath>`/`<mask>`/`<pattern>`/`<symbol>`/`<marker>` containers, where a
   full-size rect is functional geometry;
2. `svgo` cleanup (`preset-default`, `viewBox` preserved);
3. `viewBox` padding of 8% per side — geometry is never rescaled, only the frame grows;
4. OKLab quantization: every hex `fill`/`stroke`/`stop-color` (attribute or inline/CSS style)
   maps to the nearest slot of `style.assetPalette`; fully transparent colors are left alone so
   hidden geometry cannot become visible. The result reports replacements and the maximum OKLab
   distance so QC can reject a badly off-style asset later.

The normalizer is deliberately bounded: named colors and `rgb()` are not converted (generator
output in our pipeline is hex), and it is not a general SVG engine.

`assetPalette` is the single source of colors for normalization. `style.palette` keeps driving
backgrounds and text; `style.assetPalette` drives imported/vector subjects. A storyboard may
declare its own `style.assetPalette`; the CLI passes it into `AssetRequest.assetPalette` and the
resolver prefers it over the preset. The curated Tier 0 starter pack is authored in this repo and
stored **already normalized** (M3.6b.1): the 12 files are `normalizeSvg` output quantized to
`studio_flat_2d_v1.assetPalette`, so import needs no re-quantization. The former "stored as-is"
exception is closed; hashes changed and the pre-normalization objects remain in object storage as
orphans (listed in the session record, `--prune` is separate work).

Raster normalization (`alpha occupancy 8%..75%`, trim, sticker outline) needs PNG decoding and
`sharp`; M3.6a only ships the pure `alphaBounds`/`alphaOccupancy` helpers over decoded RGBA and
rejects `raster-cutout` with `UnsupportedAssetKindError` until M3.6b.

### D6 — The renderer receives resolved assets as input props

`SceneInputProps` gains optional `assets?: Record<string, { url: string }>`. `SubjectLayer`
uses `assets[key].url` when present and falls back to the M3.3 `resolveAssetKey` + `assetUrl`
path for local starter keys. No component fetches S3, R2 or a provider. A malformed key still
throws; a well-formed but unknown local key without an injected URL resolves to a `staticFile`
URL and surfaces as a render-time image error — injecting the resolved map is what makes missing
assets fail earlier, in the CLI bridge.

`render-storyboard --resolve-assets [--provider=fake]` builds the map through the resolver
(Tier 0 + optional fake provider), converts content to a data URI and passes it through input
props. This proves the resolver → renderer boundary without a network call. The flag is opt-in;
all existing fixture/custom/storyboard renders keep working unchanged.

### D7 — `studio_flat_2d_v1` is data in contracts

`packages/contracts/src/style.ts` owns `STYLE_PRESETS` with palette, `assetPalette`, typography
and effects. `storyboardStyleSchema` gains optional `assetPalette` (additive; absent means "no
quantization target"). `studio_flat_2d_v1` is added to `STORYBOARD_STYLE_IDS` and applied to
`examples/recipe-showcase.json`. The storyboard value is threaded into
`AssetRequest.assetPalette`, so a custom style is not silently normalized against a preset it
did not declare.

`packages/assets/src/style.ts` derives a `StoryboardStyle` from a preset so renderer/adapter code
never hand-copies palette values. Old `flat_2d_motion` storyboards are untouched.

### D8 — Licensing policy

Every library entry records `license.name`, `commercialUse` and optional `attribution`.
Production inserts are restricted to `commercialUse: true` (DB check + resolver guard). Starter
assets are authored in this repository and map to an internal `authored` license with
`commercialUse: true`. Non-commercial open weights (`FLUX [dev]`, self-hosted
`Bria RMBG 2.0`) must never be recorded as commercial; the M3.6b provider adapters must return
the license they actually operate under.

### D10 — Persistence adapter and blob store (M3.6a.1)

The repository port lives in `packages/assets`; the Postgres adapter lives in
`packages/db/src/assets-repository.ts` (`DrizzleAssetRepository`) and depends on the port through
`import type` only, so `packages/assets` never imports Drizzle/pg.

- `save` runs in one transaction: upsert `assets` by `(key, style_id)`, upsert variants by
  `(asset_id, variant_id)`, delete variants missing from the record. Database errors (unique or
  check violations) propagate; they are never swallowed.
- A content-hash hit returns the record that owns those bytes (D3) and uploads nothing.
- Bytes live behind the `AssetBlobStore` port (`packages/assets/src/blob-store.ts`:
  `put`/`urlFor`/`get`/`exists`); `S3AssetBlobStore` in `packages/storage` maps it onto
  `ObjectStorage` (`putObject` → `Content-Type`, `presignGet`, `getObject`, `HEAD`).
- `AssetLibraryService.persist` normalizes a record's variant keys to
  `buildAssetObjectKey(contentHash, extension)` before saving, so a stored row can never point at
  a local `assets/starter/...` path. A row that is not content-addressed is an explicit error,
  not a silently signed URL to a missing object.
- Rows are written after bytes on the import path. The provider tier is different: the resolver
  saves its row before the CLI can upload, so persistence repairs missing bytes (`exists` → `put`),
  verifies the supplied bytes against `content_hash`, and refuses to sign a variant whose object is
  absent. A crash between row and object leaves a row the next persist repairs, never a silent
  `404` inside the renderer.
- The resolver returns the freshly generated record (with its data URI) instead of the repository
  echo: a stored row has no `url` column, and losing the data URI would force a second provider
  call or upload empty bytes.
- One byte set per record: `persist` accepts bytes for variants that share the record hash.
  Per-variant bytes (outline variants) need an explicit API and arrive with M3.6b.
- Renderer integration is opt-in: `render-storyboard --persist` (only with `--resolve-assets`)
  wires Postgres + S3 from env, replaces data URIs and local files with presigned URLs (1 h TTL)
  and records `assets.persisted` in the manifest. A missing env variable is a hard error; there is
  no silent in-memory fallback. Without `--persist`, M3.6a behaviour is unchanged.
- `assets:import` in `apps/worker` seeds the Tier 0 pack idempotently from
  `apps/render-worker/public` (`--public <dir>`); running it twice uploads nothing and creates no
  rows.

### D9 — M3.6a/M3.6b boundary

**M3.6a ships:** contracts, schema/migration, `packages/assets` (hash, repository + in-memory
fake, resolver, SVG normalization, OKLab quantization, fake provider, style preset), renderer
`assets` input props, showcase restyle, tests and docs. Real generation, `cartoon-character`,
raster-cutout decode/trim, third topic and full M3.6 acceptance are **not** claimed.

**M3.6b ships:** Recraft/FLUX.2/BiRefNet adapters behind `ImageProvider`, a live R2 run, raster
normalization, character rig, third topic and the M3.6 acceptance run.

### D11 — Alias table and provider ledger (M3.6b.1)

**Aliases.** `asset_aliases (key, style_id, content_hash, created_at)` with unique
`(key, style_id)` and an index on `content_hash`; no FK to `assets`. Written whenever a hash hit
comes from another logical key, by `AssetLibraryService.persist` (and therefore `assets:import` and
`render-storyboard --persist`). The resolver's cache tier order is
`findByKey → findByAlias → tag match`; an alias whose bytes were deleted resolves to `null`
instead of resurrecting a record. A repeated alias write is an upsert and changes nothing.
Metadata refresh is the mirror case: when the same `(key, style_id)` owns the bytes and the
catalog changed `tags`/`license`/`metadata`, `persist` updates those fields in place; bytes,
`content_hash` and `object_key` never change, and an unchanged record writes nothing.

**Ledger.** `provider_usage` is append-only: `provider`, `operation`, `model`, `run_id` (FK to
`runs`, `on delete set null`), `source`, `units`, `cost_usd` (numeric, nullable), `recorded_at`,
`meta`. One row per real provider call, written at call time by
`recordingImageProvider` (decorator over `ImageProvider`) through the `ProviderUsageWriter` port;
the Drizzle writer lives in `packages/db`. `cost_usd` is what the provider reported and stays
`null` when it reported nothing — never `0`, never an estimate (`0` is a real measurement from the
fake provider). `units` is written only when the provider returned a count (Recraft credits).
Dashboards, budgets and per-run cost views are M3.7.

**Adapters.** `packages/providers` holds `recraft` (`recraftv4_styles_vector`, native SVG) and
`flux` (FLUX.2 `[klein] 4B` raster) behind the `ImageProvider` port. `enabled` is derived from
`RECRAFT_API_KEY`/`FAL_KEY`; without a key `enabled` is `false` and `generate` throws
`ProviderUnavailableError` before any request. Requests are built by pure functions, responses are
parsed by pure mappers over recorded fixtures, and HTTP is an injected port. Licences come from
policy (`recraft-terms`, `apache-2.0`; `flux [dev]` is non-commercial), and cost is `null` unless
the provider's own response carries it. No app depends on this package yet.

**Status (2026-11-12): parked.** Research `2026-11-11-deepseek-svg-assets-research.md` recommends
generating subject SVG with the DeepSeek API instead of Recraft/fal.ai (measured: 6/6 structurally
valid, ~$0.0003 per asset). The planned production provider is `DeepSeekSvgProvider` behind the
same `ImageProvider` port; the recraft/flux skeletons stay in the repo, unused, until the pilot in
M3.6b.2 decides whether a Recraft adapter is needed for organic subjects. No paid Recraft/fal
calls have been made.

### D12 — DeepSeek SVG provider (M3.6b.2)

**Adapter.** `DeepSeekSvgProvider` lives in `packages/providers/src/deepseek-svg.ts`; vendor code
never enters `packages/assets`. `packages/providers/src/deepseek-client.ts` is the one-attempt
transport behind the `LlmJsonClient` port (contracts), so retries live in the caller and each
attempt can be billed. The worker's `generateJson` reuses the same client and keeps its own
retry loop.

**Ledger.** One `provider_usage` row per attempt (not per `generate`), with
`units = promptTokens + completionTokens` and `cost_usd` = measured tokens × the tariff from
`LLM_INPUT_USD_PER_MTOK`/`LLM_OUTPUT_USD_PER_MTOK`. Tariffs are mandatory when the provider is
enabled; a missing value fails fast instead of writing `0`. `meta` carries `attempt`, `outcome`,
token split, rates and the pricing reference. `ASSET_LLM_MAX_USD_PER_CALL` (default `0.02`)
rejects an attempt before the ledger row.

**Output gate.** JSON `{svg}` → allowlist (`svg/g/path/rect/circle/ellipse/polygon/polyline`;
no `text`, `image`, `filter`, `mask`, `script`, external `href`, `url(...)`) → ≤200 KB and ≤500
elements → `normalizeSvg`. One corrective retry, then `InvalidAssetError`. Shadows are banned;
`studio_flat_2d_v1` effects remain storyboard-level.

**Source and migration.** `ASSET_SOURCES += 'llm'` in contracts and the `asset_source` DB enum
(migration `0011`, additive); the record gets `source: 'llm'` from the provider result.

**Pilot (2026-11-12).** 10 objects × 3 runs × 3 candidates, geometric prompt with
`thinking: enabled`: 87/90 structurally valid (96.7%), `normalizeSvg` 87/90,
`maxColorDistance = 0` on every success, measured **$0.208** for 90 calls, mean latency 18 s.
Organic `pirate` failed 3/9 with empty content after 16k completion tokens (`thinking` eats the
output budget) — an open follow-up, not a Recraft decision yet. Visual 1–5 scores require human
review; artifacts are under `apps/render-worker/out/m3-6b-2/pilot/`.

**Status.** Recraft/FLUX.2 skeletons remain parked and unused; no paid Recraft/fal calls have
been made.

### D13 — Muted style preset and token budget (M3.6b.3)

**Why.** The 2026-11-12 visual review of 87 pilot SVGs found the v1 palette too bright, sharp
corners the main anti-pattern, and `thinking` responsible for 4–7× the expected cost. Detail
level itself was not a problem: simple and detailed candidates both passed when they avoided
outline strokes around small parts and square corners.

**Preset v2.** `studio_flat_2d_v2` (16 asset-palette slots, ~40–50% saturation: ink/surface/
paper/amber/sky/coral/sage/danger) becomes `DEFAULT_STYLE_PRESET_ID`. `studio_flat_2d_v1` stays
addressable so existing records keep resolving; `assets_key_style_unique` means a palette change
cannot rewrite v1 bytes in place. Migration `0012` changes only the `assets.style_id` column
default.

**Tier 0 recolor.** `recolor:starter` quantizes the 12 authored SVGs with `paddingRatio: 0`
(keeps the authored viewBox, idempotent on a second run) and `assets:import` adds rows under v2;
v1 rows and their S3 objects are left untouched (prune later).

**Prompt.** Rounded corners (`rx`/`ry` ≥ 8% of the smaller side), background `<rect>` without
`rx` (it is removed by `removeBackgroundRects`, and rounding left white corners), no outline
`stroke` on small details, 8–15 primitives, 3–5 colors from the 16-slot palette.

**Cost.** `thinking: disabled`, `max_tokens: 1600`. Pilot 10 objects × 3 candidates: 30/30 valid,
`maxColorDistance = 0`, $0.0146 total (≈$0.00049 per candidate, 4.7× cheaper than the thinking
pilot), completion 259–1327 tokens, mean latency 3.3 s.

**Revision (M3.6b.4, same day).** Thinking returns as the default: without it the model produced
overlapping/offset geometry ("каша"), while the reference `geom-test` gallery that set the quality
bar used reasoning. `max_tokens` is 16000 because reasoning tokens are billed inside the same
budget (6000 produced empty content on palm/pirate). The prompt now requires a per-element numeric
PLAN, an object bounding box, silhouette rules (heads/fruits — `ellipse`, not `rect`; wheels —
concentric circles; windows separated by gaps) and 10–18 primitives. A/B on bus/palm/pirate:
9/9 valid, $0.071 for 9 calls (≈$0.003–0.008 per candidate, 16–115 s). Thinking off stays
available per call but is not the production default.

## Consequences

- The starter pack becomes one `AssetSource` inside the library instead of the only source.
- Resolver code is fully unit-testable with an in-memory repository and fake provider: no
  Docker, no network, no Chrome.
- `examples/recipe-showcase.json` changes pixels (preset colors) but keeps duration, resolution,
  fps and codec; `ffprobe` is the regression check.
- Provider work cannot sneak into M3.6a: `allowProvider` defaults to `false` and the only
  provider in the repo is the fake.
- Library persistence is real: rows in Postgres, bytes behind the `AssetBlobStore` port. The
  Postgres adapter has a Testcontainers integration test; object storage is verified against the
  local SeaweedFS. A hosted R2 run is still unreported work.

## References

- ADR-0012 (storyboard/scene render), ADR-0014 (renderer-first order)
- ADR-0015 (D2–D4: funnel, normalization, character rig)
- ADR-0016 (recipe contract; subject slots)
- `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research.md` §7, §10.1
