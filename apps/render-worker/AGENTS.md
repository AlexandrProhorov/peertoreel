# apps/render-worker — Remotion scene renderer

Applies to the isolated Remotion renderer. The root `AGENTS.md` still applies (contracts,
determinism, hard rules); this file adds renderer-specific conventions. Roadmap and milestone
details live in `ROADMAP.md`; architectural decisions in ADR-0012 and ADR-0014.

- **Data-driven only.** The renderer accepts a valid `peertoreel.storyboard.v1` scene or
  storyboard. Fixtures and topic-specific examples live in `packages/contracts` or CLI input,
  never as branches in the core render path (`render.ts`, `composition/`, components). Only the
  CLI shortcut `render-fixture` may import a fixture from contracts.
- **Prove independence, don't assume it.** Keep `examples/custom-storyboard.json` as a real file
  that is not generated from a fixture. `render-storyboard --input examples/custom-storyboard.json`
  must work, and a boundary test must fail if `render.ts`, `composition/` or components import
  fixture symbols. Changing the fixture JSON is not proof.
- **Params are the contract; invalid input is not silent.** Every `componentId` has a Zod
  params schema with defaults in `packages/contracts`. Resolution rules:
  params absent → defaults; optional field absent → default; invalid value → default for the
  affected field **and** a diagnostic warning with `path`, `reason` and the received value;
  unknown `componentId` → error. `parseComponentParams` returns `{ params, diagnostics }`;
  diagnostics are logged/recorded, never dropped. A successfully rendered frame with invalid
  input must still leave a trace.
- **Resolved scene boundary.** `mapping.ts` returns one resolved value:
  `{ componentId, params, source, diagnostics }`. Components receive only `componentId`/`params`;
  `source` (`implementation`/`fallback`) is for logs and tests, never a rendering decision. The
  core renderer must not re-resolve or branch on `implementation`/`fallback`.
- **No silent component substitution.** `mapping.ts` may use an explicitly declared `fallback`.
  If neither the implementation nor the fallback is implemented, throw a typed error. Never
  substitute a generic `kinetic-typography` scene (root hard rule 9).
- **One camera layer.** `shot`, `movement`, `speed` and `parallax` are implemented once in the
  shared camera module. Scene components do not reimplement camera math.
- **Assets are inputs, not network calls.** Local assets use `public/` + `staticFile` (M3.3),
  including the curated text-free SVG starter pack under `public/assets/starter/` (M3.4/M3.5,
  ADR-0015); future assets arrive as keys/presigned URLs in input props from the asset resolver
  (M3.6). The renderer must not call fal.ai/Recraft/S3 directly, and scene code must not fetch
  from the network.
- **Style is data.** Colors come from `style.palette` (today) and `style.assetPalette` when the
  asset/style preset lands in M3.6; typography from `style.typography`. Do not hardcode topic
  colors. Real photos and AI-generated diagrams with baked-in text are not allowed in flat 2D
  scenes; use illustrations, normalized SVGs or procedural primitives, and render all labels/
  callouts in Remotion (ADR-0015).
- **Determinism.** Use Remotion `random(seed)`, never `Math.random()`, `Date.now()` or wall
  clock inside scene code. Same scene + seed + assets must produce the same frames. A different
  seed must change only the elements it controls, and rendering a scene after another scene must
  not change its frames (no global mutable state or render-order dependence).
- **Timing.** `word_timings` is the source of truth. Object windows are clip-local; duration in
  frames is derived from `scene.durationSec` in `calculateMetadata`, never guessed in a
  component.
- **Output is a spec, adapters map it.** Contracts define the target format (1080×1920, 30 fps,
  H.264, `yuv420p`, BT.709, no audio). Remotion and FFmpeg each translate that spec into their
  own options; do not share one options object or blindly copy color flags between them. Verify
  color metadata with `ffprobe` before changing it.
- **Audio and subtitles stay outside.** Voiceover, ASS karaoke and final assembly belong to
  `apps/worker` and FFmpeg. Remotion renders silent scene clips only.
- **Recipes are data, not layouts.** A recipe describes how to explain an idea: required slots,
  camera/motion, allowed primitives and 2–3 composition variants. Do not add a per-topic TSX
  branch. New recipes need a test that renders a different topic.
- **Tests.** Unit tests must not launch Chrome or call `renderMedia`. Cover params defaults,
  invalid-value diagnostics, mapping/resolved scene, unknown-component failure, timing, asset
  key resolution and duration in frames. Render verification is a separate CLI/CI step with
  `ffprobe`, a custom storyboard, seed variation and a render-order independence check.
- **Scope discipline.** Before code, read the current contracts, `mapping.ts`,
  `composition/SceneComposition.tsx`, `render.ts`, `props.ts` and the FFmpeg target; write a short
  table “current behavior → required change”. Do not refactor module structure or public
  interfaces outside the M3.3 scope without explicit approval.
