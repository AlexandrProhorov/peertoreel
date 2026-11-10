# ADR-0015 — Subject asset pipeline, normalization and MVP video formats

**Status:** accepted · 2026-11-10

## Context

`ROADMAP.md` (M3.3–M3.7) and ADR-0014 established a renderer-first sequence:
data-driven Remotion foundation (M3.3) → scene recipes (M3.4) → two-topic end-to-end spike
(M3.5) → Asset Library and generator (M3.6) → production hardening (M3.7).

A follow-up research study (`docs/workspace/research/2026-11-10-asset-pipeline-and-format-research.md`,
executing `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research-plan.md`) audited
the M3.3 renderer against 20 representative topics (120 scenes) and evaluated asset providers,
character consistency, technical diagram accuracy and unit economics:

1. **Coverage gap (E0):** M3.3 covers ~15% of topics (32.5% of scenes) without new assets; M3.4
   recipes and procedural charts/HUD will raise this to ~35–40% of topics (~57% of scenes). The
   remaining 60–65% of topics require a **subject layer** (flat 2D objects, animals, everyday
   items, structured diagrams or a recurring character).
2. **M3.5 spike blind spot (G5):** M3.5's two target topics (“Why does a dog have a wet nose?”
   and “Why are houses built from bricks?”) are subject-heavy. Running M3.5 with zero subject
   assets would only test abstract text/HUD cards, whereas moving all of M3.6 (cloud APIs, DB,
   S3 cache) before M3.5 would violate ADR-0014 by building infrastructure before proving the
   director's recipe and slot contract.
3. **Diagram hallucination (E4):** Raster and vector text-to-image models hallucinate mechanical/
   anatomical topology and Cyrillic labels.
4. **Licensing traps (E2/RQ8):** Open weights for `FLUX.1/2 [dev]` and `Bria RMBG 2.0`
   (`CC BY-NC 4.0` on HuggingFace) are non-commercial when self-hosted, whereas `FLUX.2 [klein] 4B`
   (`Apache-2.0`), `BiRefNet v2` (`MIT`), `FLUX.2 [pro]` API and `Recraft` paid API permit
   commercial use.

## Decision

### D1 — Three canonical MVP formats

The factory does not promise arbitrary animated scenes for any prompt. MVP supports three
bounded flat 2D formats built on the same recipe and layer engine:

1. **`hud-data-explainer`** — kinetic typography, counters, gauges, comparisons and HUD chips;
   0–1 subject icons from the local starter pack.
2. **`subject-cutout-explainer`** — recipes (`hook-hero`, `fact-object`, `comparison`, `process`,
   `cta`) combined with 3–5 flat SVG or cutout subject illustrations normalized to the style
   palette, plus Remotion callouts and HUD chips.
3. **`cartoon-hud-story`** — a parametric 2D character rig (`cartoon-character`) with discrete
   facial expressions and accessories, 1–2 subject props, ADHD/game-style HUD status pills tied
   to `syncToWord`, and camera shot changes (`wide` → `close_up`).

Complex frame-by-frame character acting, phoneme lipsync, 3D cameras and unverified technical
blueprints are out of scope for MVP.

### D2 — Three-tier subject asset funnel and commercial licensing

`AssetResolver` (M3.6) resolves subject assets in strict order of cost and determinism:

1. **Tier 0 — Curated Local Open SVG Pack (`$0`, `<5 ms`):** MIT/CC0 vector icons and flat
   illustrations in `apps/render-worker/public/assets/starter/` (and R2 library hits).
2. **Tier 1 — Native Vector Generation (`$0.020–$0.088/asset`):** Recraft V4/V4.1 Vector API
   (`recraftv4_vector` / `recraftv4_1_vector`, native SVG with `style_id` and palette controls)
   or `FLUX.2 [klein] 4B` (`$0.009/MP`, Apache 2.0) + Recraft Vectorize (`$0.011/image`).
3. **Tier 2 — Raster Cutout Generation (`$0.010–$0.032/asset`):** `FLUX.2 [klein] 4B` or
   `FLUX.2 [pro]` (`$0.03/first MP`, commercial) on `fal.ai` + background removal via
   `BiRefNet v2` (`$0.0008/compute-s`, MIT) or `Bria RMBG 2.0` paid commercial endpoint
   (`$0.018/image`).
4. **Tier 3 — Graceful fallback:** if generation is disabled or fails validation after retries,
   the slot degrades to a Tier 0 fallback icon or `scene.fallback` (never failing the run).

**Licensing rule:** never self-host `Bria RMBG 2.0` (`CC BY-NC 4.0`) or `FLUX [dev]` weights in
commercial production. Every library entry records its license (`commercialUse: true` required).

### D3 — Mandatory style normalization before library storage

External assets (AI SVG, AI raster, or Pixabay vector fallback) are never rendered raw:

- **SVG normalization:** `svgo` cleanup, full-bleed background `<rect>` removal, `viewBox`
  padding normalization (8% margin), and **OKLab palette quantization** mapping every fill/stroke
  color to the closest slot in `style.assetPalette`.
- **Raster cutout normalization:** alpha occupancy check (`8%..75%` opaque pixels; reject empty
  or unmatted images), auto-trim + centered padding in `1024×1024`, and a unified paper-cutout
  outline/drop-shadow in Remotion.

### D4 — Parametric SVG character rig for MVP

Characters in MVP use a deterministic React/SVG rig (`cartoon-character`) with 5 facial states
(`neutral`, `sleep`, `shock`, `happy`, `skeptical`) switched by `syncToWord`, seeded idle
breathing/blinking via `random(seed)`, and modular role accessories (e.g. hoodie, pirate hat,
hard hat, glasses). Instruction-edited raster sprites (`FLUX.2 [pro] Edit`) are an optional
secondary path in M3.6; Rive/Lottie character rigs are deferred beyond MVP.

### D5 — Technical diagrams never bake text or topology in AI images

AI image/vector generators must never be prompted to draw technical diagrams with labels or
arrows. Any negative/system prompt for `ImageProvider` enforces `no text, no labels, no letters,
no numbers, isolated single object`. Diagrams are rendered either as:
- **Structured procedural layers** (`process` / `comparison` steps, bars and node graphs driven
  by recipe slots in Remotion), or
- **Verified text-free layered SVGs (`svg_diagram`)** with normalized coordinate anchors, where
  all Russian labels, highlights and callout arrows are rendered by Remotion.

### D6 — M3.4 / M3.5 / M3.6 boundary: local starter SVGs in M3.4–M3.5, cloud pipeline in M3.6

The milestone order `M3.4 → M3.5 → M3.6 → M3.7` from ADR-0014 stays intact, with one explicit
refinement so M3.5 tests real subject-based videos without premature cloud infrastructure:

- **M3.4 (Scene Recipes v1):** when splitting `SceneObjects` into reusable layers, implement the
  `image` / `subject` layer using the local asset resolver already introduced in M3.3
  (`resolveAssetKey` + `assetUrl` in `apps/render-worker/src/assets.ts`), and ship a small
  curated starter SVG pack under `apps/render-worker/public/assets/starter/` (covering
  `recipe-showcase.json` and the two M3.5 benchmark topics: dog/wet nose and bricks/house).
- **M3.5 (End-to-End Animation Spike):** DeepSeek receives the 5-recipe catalog plus the list of
  available `starter/` asset keys, producing two complete subject-assisted flat 2D shorts via CLI
  and `buildVisualConcatArgs` without cloud image APIs or queues.
- **M3.6 (Asset Library + Asset Generator):** replaces the static starter list with the full
  `AssetResolver`, DB/R2 metadata and content-hash cache, `ImageProvider` (Recraft Vector /
  FLUX.2 + BiRefNet) and automated `studio_flat_2d_v1` palette normalization.

## Consequences

- `SceneObjects.tsx` no longer returns `null` for `kind: 'image'` once M3.4 lands: it renders
  validated local/resolved assets through `resolveAssetKey()` + `assetUrl()`.
- M3.5 validates how DeepSeek fills subject slots (`fact-object`, `comparison`, `process`) on
  concrete topics before a single dollar is spent on cloud image APIs in M3.6.
- Root `AGENTS.md`, `apps/render-worker/AGENTS.md`, `ROADMAP.md` and the M3.4 session plan are
  updated to reflect D1–D6.

## References

- `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research.md`
- `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research-plan.md`
- `docs/adr/0012-storyboard-and-scene-render.md`
- `docs/adr/0014-m3-renderer-first-roadmap.md`
