# ADR-0012 — Storyboard contract and scene render architecture

**Status:** accepted · 2026-11-09

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
