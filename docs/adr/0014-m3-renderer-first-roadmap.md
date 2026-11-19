# ADR-0014 — M3 renderer-first roadmap reset

**Status:** accepted · 2026-11-10 · M3.4–M3.6 subject-asset boundary refined by ADR-0015

## Context

A read-only architectural audit (2026-11-10) found that the Remotion renderer is still a
fixture renderer: it renders `storyboardFixture15Deg`, but it does not consume
`implementation.params`, `camera.shot`, `camera.parallax`, `scene.transition`, `effects`,
`environment` or asset references. The API/worker/S3 path does not call Remotion at all; the
`render` stage uses Pixabay + FFmpeg. `scene_clip` and `storyboard_json` are declared artifact
types with no producer/consumer. `mapping.ts` silently degrades unknown components to
`kinetic-typography`.

The previous M3.3–M3.8 order started with a broad component library and the `scene-render`
queue. That risks building infrastructure and asset systems before proving that the visual
language can produce a coherent story. The new order is:

1. Data-driven renderer foundation.
2. Five scene recipes with composition variants.
3. Two-topic end-to-end animation spike without AI assets.
4. Asset Library + Asset Generator + style preset.
5. Production hardening: scene clips, per-scene regeneration, queue, vision QC, review, cost.

This is a reordering of M3.3–M3.8, not a rewrite. M3.1/M3.2 remain valid.

## Decision

### D1 — Renderer foundation before recipes

M3.3 makes Remotion accept any valid `storyboard.v1` scene/storyboard through a CLI, passes
`implementation.params`/`fallback.params` to components, adds per-component Zod params schemas
and defaults, and adds a minimal local-asset mechanism (`public/` + `staticFile` or equivalent).
No AI generation and no Asset Library in M3.3.

Param handling is explicit: missing params/fields → defaults; invalid values → per-field default
**plus diagnostics** (path/reason/received); unknown `componentId` → error. `mapping.ts` returns
one resolved scene (`componentId`, `params`, `source`, `diagnostics`); components receive only
`componentId`/`params`, so they never decide between `implementation` and `fallback`. The video
target (1080×1920/30, H.264, `yuv420p`, BT.709, no audio) is a shared **specification** in
contracts; Remotion and FFmpeg map it to their own options independently, with `ffprobe`
verification before changing color flags. The renderer must prove independence with a real
`examples/custom-storyboard.json` (not derived from a fixture) and a boundary test that the core
render path does not import fixtures.

### D2 — Recipes before the production queue

M3.4 introduces five recipes: `hook-hero`, `fact-object`, `comparison`, `process`, `cta`, each
with 2–3 composition variants. A recipe explains an idea (slots, camera/motion, allowed
primitives), it is not a layout template. The recipe catalog is data for the future DeepSeek
director. `SceneObjects` is split into reusable layers, including an `image`/`subject` layer
that renders local `public/assets/` keys via the M3.3 asset resolver and a small curated starter
SVG pack (`public/assets/starter/`, see ADR-0015).

### D3 — End-to-end proof before infrastructure

M3.5 runs two topics (“why does a dog have a wet nose?”, “why are houses built from bricks?”)
through DeepSeek → storyboard → Remotion scenes → FFmpeg assembly. It uses a CLI/script, the
curated local starter SVG pack (`public/assets/starter/`) and the existing `buildVisualConcatArgs`;
it does **not** add `scene-render`, `scene_clip`, S3 asset storage, vision QC or cloud AI image
generation. The goal is to test narrative and visual coherence with real subject slots before
building cloud asset infrastructure (ADR-0015).

### D4 — Assets after the vocabulary is proven

M3.6 adds the Asset Library (metadata, content hash, variants/versions, license enforcement),
Asset Resolver, `ImageProvider` (Recraft V4/V4.1 Vector SVG + fal.ai FLUX.2 `[klein] 4B`/`[pro]`
+ BiRefNet v2 matting), automated SVG/cutout normalization (`svgo` + OKLab palette quantization
to `style.assetPalette`), the parametric `cartoon-character` rig, and the first style preset
(`studio_flat_2d_v1`). Procedural objects, SVG and AI illustrations coexist; technical diagrams
never bake text into AI images (ADR-0015). If generation fails, the scene degrades to a Tier 0
starter icon or a declared procedural fallback.

### D5 — Hardening last

M3.7 adds `scene_clip` artifacts, per-scene regeneration, the `scene-render` queue
(`{runId, sceneIdx}`), vision QC for assets/scenes, review UI and cost/budget tracking. This is
where concurrency and automation are optimized.

### D6 — Unknown components fail explicitly

The generic `kinetic-typography` fallback is removed from the render path. If neither the
implementation nor the declared fallback is implemented, the renderer throws a typed error.
The existing fixture keeps rendering because its fallbacks are explicit and implemented; any
fixture fallback that points at an unimplemented component must be updated to an implemented
fallback or the component must be implemented. Root hard rule 9 records this.

### D7 — One style for v1

The first style preset is neutral studio flat 2D (warm paper palette, Montserrat 700/900,
soft outlines, limited asset palette). A second style preset is M4.1. The style is global data,
not a component branch; assets are validated against it before use.

## Consequences

- `scene-render`, `scene_clip`, vision QC and the cost ledger move to M3.7. Until then, M3.5
  uses the existing FFmpeg concat path and manual review.
- AI images arrive in M3.6. M3.5 is a bounded-language spike, not “any prompt”.
- The audit's infrastructure-first order is intentionally not followed; the risk of premature
  queue/asset complexity is higher than the risk of a manual two-topic spike.
- The renderer must not silently mask missing components; fixtures that relied on the generic
  fallback need explicit data changes.
- `packages/contracts` remains the single source of truth for params, video target and recipe
  slots. `apps/render-worker/AGENTS.md` records the renderer rules.

## References

- `docs/adr/0012-storyboard-and-scene-render.md`
- `docs/adr/0015-subject-assets-and-mvp-formats.md`
- `ROADMAP.md` (M3.3–M3.7)
- `docs/workspace/plans/2026-11-10-m3-3-renderer-foundation-session.md`
- `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research.md`
