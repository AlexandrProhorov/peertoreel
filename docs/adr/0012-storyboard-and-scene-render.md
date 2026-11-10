# ADR-0012 — Storyboard contract and scene render architecture

**Status:** accepted · 2026-11-09 · M3.3–M3.7 order revised 2026-11-10 by ADR-0014 · M3.3 implemented 2026-11-10

## Context

M0–M2 produce a working vertical draft, but every scene is a different Pixabay clip or
photo: mixed styles, frozen stills, hard cuts and no scene-level typography. The next quality
step is **original animated scenes** produced from a structured storyboard instead of stock
footage.

The design was researched in `docs/ignore/research/2026-11-08-ai-video-production-research.md`
and sliced in `docs/ignore/plans/2026-11-08-animated-factory-plan.md` (both are local-only:
`docs/ignore/` is gitignored). M3.1 fixes the data model **before** any renderer exists, so the
render worker and the AI director cannot invent incompatible shapes. The contract must be
generic for any topic; the «−15°» storyboard is a fixed acceptance fixture, not a product
limitation.

## Decision

### D1 — The AI director produces JSON, not code

DeepSeek generates a `peertoreel.storyboard.v1` document validated by Zod. It never writes
React or pixel prompts into the hot path. Free-form code generation stays an emergency
sandbox lane outside M3, because unconstrained animation code has a very low render success
rate.

### D2 — Remotion in an isolated render worker

Programmatic scenes are rendered by Remotion 4.0.x inside `apps/render-worker` (M3.2), a
plain Node.js process with a pinned Chrome and local Cyrillic woff2 fonts. React exists only
in that app; Angular is not touched. Plan B is Revideo (MIT) behind the same scene contract
if Remotion licensing or Chrome stability becomes a problem.

**License:** Remotion is free for teams of up to 3 people, including automation. The team is
≤3 as of 2026-11-09, so M3.2 uses the free tier. If the team grows, the options are
Automators ($0.01/render, minimum $100/month) or Revideo.

### D3 — Scenes are separate mp4 clips; FFmpeg stays

Each scene is rendered as a silent 1080×1920/30 fps H.264 clip. The existing render stage
(`render.processor.ts` → `visual-track.ts` → `concat` → loudnorm → ASS karaoke) assembles
them unchanged, because it already consumes `scene.asset.objectKey + contentType`. No
Remotion code runs inside the final assembly, and no FFmpeg module is replaced.

Scene objects live under the existing visuals key:
`runs/<runId>/visuals/scene-<idx>` (the same `buildArtifactKey(runId, 'visuals', ...)` the
stock path uses). The research draft mentioned `runs/<runId>/scenes/...`; this ADR fixes the
actual key. The artifact type is `scene_clip`, written by the visuals stage; M3.4 wires it.

### D4 — Component library + Zod; params are JSON

Scenes reference a closed `componentId` enum from the initial library
(`parallax-city`, `kinetic-typography`, `infographic-gauge`, `image-parallax`,
`particle-field`, `cta-card`). Component params use `JsonValue` / `jsonObjectSchema`, so
public contracts never contain `unknown`. Adding a component is an additive schema change.

### D5 — Hybrid producers

`implementation` is a discriminated union:
`programmatic` (default), `image_animation` (fal.ai FLUX / future), `ai_video` (MiniMax H3 /
future) and `hybrid`. Every scene also carries a mandatory programmatic `fallback`; a failed
AI producer degrades that scene, never the whole run.

### D6 — Word timings are the timing source of truth

Scene windows and `syncToWord` triggers are validated against the scene's `voiceover.text`;
real timings come from `word_timings.json` (ElevenLabs). `durationSec` is derived from the
voiceover window, not chosen independently. Scenes are contiguous within 0.05 s: pauses stay
covered by the previous scene, as in `deriveBeatTimings()`, and a gap is a validation error.
`startSec` is the object's visible start; `syncToWord` is the accent/anchor word, so a title
may appear before the word it emphasises (the hook does exactly that).

### D7 — Provider ports and spend

`ImageProvider` and `VideoProvider` live in `packages/contracts` by analogy with
`StockProvider`; vendor SDKs stay in adapters. Every paid call records real usage in artifact
`meta` until the `provider_usage` table lands in M4.3. No estimated costs.

### D8 — Angular previews without React

The storyboard UI (M3.8) uses `renderStill()` frames and presigned `<video>` URLs. Remotion
`<Player>` and React islands are not embedded in Angular.

## M3.2 implementation

`apps/render-worker` is a plain Node.js package (`@peertoreel/render-worker`) with Remotion
4.0.542 and React 19. The composition id is `Scene`; `inputProps` are `{ scene, style,
wordTimings? }` and `calculateMetadata()` computes `round(scene.durationSec * 30)`.

- M3.2 implements `parallax-city` and `kinetic-typography`. `image_animation`/`ai_video` and
  unimplemented components fall back to `scene.fallback`, then to generic
  `kinetic-typography`, so every fixture scene is renderable.
- `SceneObjects` renders text, particles, light cones, frost, a car silhouette and a battery
  gauge. Objects use clip-local windows; `syncToWord` is an accent anchor, not the visible
  start.
- `renderMedia()` writes h264/`yuv420p`/`bt709`, CRF 18, `concurrency: 1`, `muted: true`.
  Output is `scene-<idx>.mp4` without an audio track.
- `scene.transition` is declared but not rendered in M3.2: clips are hard-cut. In-window
  transitions are a M3.3/M3.4 enhancement.
- Fonts are local `@fontsource` woff2 (Montserrat 700/900); the used weights are explicitly
  loaded via `document.fonts.load()` inside `delayRender()`/`continueRender()`.
- The Docker image pins the Remotion-managed Chrome Headless Shell
  (158.0.8127.2 at the time of the session) and installs the Debian libraries it needs.
- Measured on 2026-11-09: 140.1 s for the six-scene fixture on the dev machine, 147.6 s in
  the non-root container; clips concatenate via the existing `buildVisualConcatArgs` into a
  60 s silent 1080×1920/30 track.

## M3.3 implementation

M3.3 makes the renderer data-driven. It does not add recipes, AI assets, the asset library or
the scene queue; those stay in M3.4–M3.7.

### Params and diagnostics

- `packages/contracts/src/storyboard.components.ts` defines a Zod schema and defaults for every
  id in `STORYBOARD_COMPONENT_IDS` (six ids). The contract is additive: adding a component means
  adding a schema + defaults there and a renderer branch.
- `parseComponentParams(componentId, params)` returns `{ params, diagnostics }`. Diagnostics
  carry `path` (`$`, `field`, or `field.1`), `reason` (`params_missing`, `invalid_value`,
  `unknown_key`) and the rejected `received` value.
- Resolution rules: absent object → defaults + `params_missing`; absent field → default without
  a warning; invalid value → default for **that field** + `invalid_value` per Zod issue; unknown
  key → dropped + `unknown_key`; unknown `componentId` → `UnknownStoryboardComponentError`.
  A frame that renders with bad input always leaves a diagnostic in the log and the manifest.
- `mapping.ts` returns one resolved value:
  `{ componentId, params, source: 'implementation' | 'fallback', diagnostics }`. The composition
  receives only `componentId`/`params` through input props; `source` and `diagnostics` are
  log/test metadata and are stripped by `resolvedScenePropsSchema` before Remotion sees them.

### Explicit unknown components

The generic `kinetic-typography` fallback is removed. If neither the implementation nor the
declared fallback is implemented, `resolveSceneComponent()` throws
`UnsupportedSceneComponentError` with the scene id and component id. The fixture's CTA scene
keeps `implementation: cta-card` but now declares the implemented
`fallback: kinetic-typography`; this is a data change, not a hidden substitution. `cta-card`,
`infographic-gauge`, `image-parallax` and `particle-field` remain unimplemented.

`ParallaxCity` reads `buildingsSeed`, `lamp`, `snowDensity`, `focus`, `roadGlow`;
`KineticTypography` reads `text`, `accentWords`, `preset`, `align`, `underline`. Both were
checked visually: seed changes building layout, lamp moves the light, density adds/removes ambient
snow, focus moves the framing/vignette, road glow toggles, and the typography preset changes the
ghost headline, accent words and underline.

### Video target

`packages/contracts/src/video.ts` exports one specification (`1080×1920`, 30 fps, h264,
`yuv420p`, BT.709, no audio). Remotion maps it in
`apps/render-worker/src/video-target.ts`; FFmpeg maps it in
`apps/worker/src/media/video-target.ts` (`libx264`, `-pix_fmt`, `-r`, scale filter). The two
adapters do not share an options object.

`ffprobe` before and after the change shows every Remotion clip and the FFmpeg concat with
`color_space=bt709`, `color_primaries=bt709`, `color_transfer=bt709`, `yuv420p`, 30 fps and no
audio track. Because the metadata is already correct, FFmpeg gets **no** explicit
`-colorspace`/`-color_primaries`/`-color_trc` flags. If a future input loses that metadata, the
FFmpeg adapter is where the mapping belongs; this is a known limitation, not silently “fixed”
by copying flags from Remotion.

### Local assets

`bundle({ publicDir: 'apps/render-worker/public' })` plus `staticFile` are configured in
`render.ts`; `public/assets/test-scene.svg` is the sample asset. `src/assets.ts` classifies keys
into `local` (safe relative public path), `remote` (`http(s)`) or `data` (data URI), and rejects
traversal, absolute paths and unknown protocols. This is only the mechanism: no S3/fal.ai
downloads and no Asset Library. The optional minimal `image-parallax` stretch was **not** taken,
so assets will first be consumed visually in M3.6.

### CLI and independence

- `render-fixture [--scene <idx>] [--out <dir>]` is a shortcut for
  `storyboardFixture15Deg` and remains the regression baseline.
- `render-storyboard --input <file> [--scene <idx>] [--out <dir>]` reads JSON, validates it with
  `storyboardSchema` and prints Zod paths on failure.
- Only `src/cli.ts` may import fixture symbols. `src/boundary.spec.ts` fails if `render.ts`,
  `composition/**` or `components/**` mention `storyboardFixture15Deg`,
  `wordTimingsFixture15Deg` or `storyboard.fixture`. `composition/index.tsx` uses a neutral
  preview scene instead of the fixture.
- `apps/render-worker/examples/custom-storyboard.json` is a real second storyboard (urban heat
  island, four scenes) with different params. `src/examples.spec.ts` validates it, resolves every
  scene and asserts that its params differ from the fixture.
- The manifest written by the CLI contains kind, input, runId, styleId, scene component/source,
  params diagnostics, durations, size and render time.

### Determinism (measured 2026-11-10, dev machine)

- The six-scene fixture rendered in **143.3 s**; the four-scene custom storyboard in **75.0 s**.
  The custom clips are 6/8/8/6 s; FFmpeg concat produced a 28.0 s, 1 935 695-byte file with
  BT.709 metadata and no audio.
- Scene 0 of the custom storyboard rendered in the full run, alone, and after scene 1 in the same
  process produced **identical SHA-256** files (and identical `framemd5` decoded frames).
- Changing only `buildingsSeed` (2026 → 2027) changed the file hash and the building layout while
  the lamp, text and framing stayed in place.
- The Docker image renders the same custom scene with the same target metadata. Cross-platform
  pixel parity between Windows and Linux was not established (font/Chrome rasterization), so it
  is not claimed.
- Unit tests still never launch Chrome or call `renderMedia`; rendering checks are a separate CLI
  step.

### Still outside M3.3

`camera.shot`, `camera.parallax`, `scene.transition`, `effects`, recipes, DeepSeek, the
`scene-render` queue, `scene_clip`, `ImageProvider` and the review UI are unchanged.

## M3.4 implementation

M3.4 adds recipes, layers and a local subject pack; the full contract is ADR-0016.

- `implementation.type = 'recipe'` (`recipeId`, `variant`, `slots`) is a new branch; `scene.objects`
  must be empty for recipe scenes, so a recipe has exactly one visual source.
- `packages/contracts/src/storyboard.recipes.ts` holds the catalog (5 recipes × 2 variants), slot
  specs, layer plans, camera hints and the 12-key `STARTER_ASSET_KEYS` pack. Slots are validated at
  the storyboard boundary; unknown ids, required slots and starter keys fail with a JSON path.
- `apps/render-worker/src/recipes.ts` binds slots to the selected variant once; `mapping.ts`
  returns `{ componentId, params, source, recipe, slotDiagnostics, diagnostics }`.
- `SceneObjects` is now a thin dispatcher over `components/layers/*` (`text`, `pill`, `hud-chip`,
  `subject`/`image`, `chart`, `particles`, `light`, `overlay`, `character`). `image`/`subject`
  renders local SVG through `resolveAssetKey()` + `assetUrl()`; unknown kinds throw.
- `camera.ts` owns `shot`/`movement`/`speed`/`parallax`; `ParallaxCity` and `KineticTypography`
  consume it. `shot` maps to a base scale, `parallax` defaults to
  `[0.15, 0.35, 0.6, 0.8, 1]` sampled by depth.
- `kinetic-typography` gains `preset: 'backdrop'` for recipe backgrounds, and
  `sceneObjectKindSchema` gains `subject`. Both are additive.
- `examples/recipe-showcase.json` mixes all five recipes and is rendered by the existing CLI;
  the M3.3 fixture and `custom-storyboard.json` still render with their original scene data.

## Contract details

- Schema version: `peertoreel.storyboard.v1`. No compatibility with the pre-rename
  `kadence.storyboard.v1`; no such data exists.
- `style` is global (palette, typography, effects) and every component takes its colours and
  fonts from it. `characters[]` is the registry of reusable subjects; `scene.refs` and
  `implementation.refIds` contain **character ids**, and `characters[].refImageKey` resolves
  the actual image. This is a deliberate clarification of research §E.1 (where `refs` was
  described as image keys): one registry, one resolution path. The fixture keeps
  `refImageKey: null`, so image/AI-video scenes are expected to fall back until M3.6 provides
  the asset.
- `transition` is the **outgoing** edge at the end of a scene, rendered inside its window. The
  last scene has no successor and must use `cut` with duration 0. `durationSec` must fit
  inside the scene. Scenes do not overlap; the sum of `durationSec` approximates
  `audio.durationSec`. Cross-scene `xfade` with handles is a later enhancement, not part of
  the v1 timeline.
- `syncToWord` is matched as a token, not a substring, so `кот` does not match `который`.
- Scene ids are unique; object ids are unique within a scene. M3.5 regeneration and the
  renderer's per-scene keys depend on this.
- Validation tolerances: 0.15 s for scene duration/object windows, 0.05 s for scene joins,
  1.0 s for the sum vs audio duration, 0.5 s lead-in for the first scene and 0.5 s tail after
  the last one.
- The first scene must be `hook` and the last must be `cta`.

## Scope of M3.1

M3.1 adds only `packages/contracts`: `json.ts`, `timings.ts`, `scene-part.ts`,
`storyboard.ts`, `storyboard.fixture.ts`, schema tests, artifact types and the web artifact
labels, plus this ADR. It also switches worker imports of `DerivedWord`/`derivedWordsSchema`
to contracts. It does **not** install Remotion, create `apps/render-worker`, add the
`scene-render` queue, write `storyboard_json` to S3 or change `visuals_json` / render / API /
DB / UI.

## Consequences

- Existing runs are unaffected: `storyboard_json` is optional, and the stock visuals path
  remains the fallback until M3.4/M3.5.
- `storyboardFixture15Deg` is the regression baseline for the render worker and component
  library. A second fixture on a different topic should be added after M3.3/M3.5 to guard
  against overfitting to the «−15°» example.
- Scene regeneration is keyed by `{ runId, sceneIdx }` and `version`; it rewrites the same
  object key and does not rebuild the whole video (M3.4/M3.8).
