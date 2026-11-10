# ADR-0016 — Scene recipe contract

**Status:** accepted · 2026-11-10

## Context

ADR-0014 (D2) and ADR-0015 (D6) put five data-driven recipes — `hook-hero`,
`fact-object`, `comparison`, `process`, `cta` — in M3.4, together with a local starter SVG pack
and a working `image`/`subject` layer. M3.5 then hands the catalog to the DeepSeek director, so
the recipe shape is a contract, not an internal renderer detail.

Three shapes were possible:

1. add `scene.recipe` next to `implementation.componentId`/`params`;
2. add a new `implementation.type = 'recipe'` branch;
3. keep recipes as renderer-only TypeScript.

Option 1 creates two sources of truth for background selection and leaves `recipe` ↔
`componentId` conflicts undefined. Option 3 makes M3.5 impossible: the director cannot produce
recipes as data. The brief therefore prefers option 2, with `programmatic` kept as the
low-level escape hatch. ADR-0015 already fixed subject-asset strategy and MVP formats, so the
recipe *shape* needs its own record.

## Decision

### D1 — `implementation.type = 'recipe'`

`sceneImplementationSchema` gains one branch:

```ts
{ type: 'recipe'; recipeId: StoryboardRecipeId; variant: string; slots: JsonObject }
```

`programmatic`, `image_animation`, `ai_video` and `hybrid` are unchanged. There is **no**
`scene.recipe` field, so `recipeId`/`variant`/`slots` cannot contradict
`implementation.componentId`/`params`. `programmatic` remains the escape hatch for custom
low-level scenes (`examples/custom-storyboard.json`, the «−15°» fixture) and for every
`scene.fallback`.

### D2 — The catalog is data in `packages/contracts`

`packages/contracts/src/storyboard.recipes.ts` owns:

- `STORYBOARD_RECIPE_IDS` and the recipe id type;
- per-recipe slot specs (name, kind, required, default, Zod schema);
- variants: a background `{ componentId, params }`, a camera hint and a layer plan
  (`kind` + layout + slot bindings + clip-local window fractions);
- `STARTER_ASSET_KEYS` / `STARTER_ASSET_CATALOG` for the local SVG pack.

A variant is data. No per-topic TSX and no branching on the topic is allowed. Backgrounds must
name components the M3.4 renderer implements (`parallax-city`, `kinetic-typography`); adding
`infographic-gauge`/`cta-card` to `IMPLEMENTED_COMPONENTS` is out of scope.

Two small additive changes support recipe backgrounds without duplicating text:
`kinetic-typography` gains `preset: 'backdrop'` (grid/glow only, no headline), and
`sceneObjectKindSchema` gains `subject` next to `image`. Both are contract additions; existing
scenes are unchanged and `backdrop` is never inferred from a missing preset.

### D3 — Slot validation semantics

`parseRecipeSlots(recipeId, variant, rawSlots)` returns `{ slots, diagnostics }` and mirrors
`parseComponentParams`:

- required slot missing → `InvalidRecipeSlotError` (`missing_required`, `path` = slot name);
- required slot invalid → `InvalidRecipeSlotError` (`invalid_value`, `received` = raw value);
- optional slot missing → catalog default (`null` today), no noisy warning;
- optional slot invalid → default + `invalid_value` diagnostic with `path`/`received`;
- unknown slot key → dropped + `unknown_key` diagnostic;
- unknown starter `assetKey`/`fallbackIcon` → hard error for required **and** optional subject
  slots (a typo must not silently drop the subject);
- unknown recipe / unknown variant → typed error.

`storyboardSchema` runs the same parser in `superRefine`, so an invalid recipe fails at the
JSON boundary with a path like
`scenes.1.implementation.slots.subject.assetKey`, not at render time.

### D4 — Subject slots are local starter keys

A subject slot is:

```ts
{ assetKey: StarterAssetKey; fallbackIcon?: StarterAssetKey }
```

`assetKey` is a logical key (`dog-snout`, `brick-wall`, …) validated against
`STARTER_ASSET_KEYS`; the catalog maps it to `assets/starter/<key>.svg`. The renderer resolves
it with the M3.3 `resolveAssetKey()` + `assetUrl()` mechanism. No prompts, URLs, S3 keys or
network fields belong in a slot; cloud generation and the Asset Library are M3.6. An unknown
key is a contract error, never an empty frame.

`fallbackIcon` is a second starter key used when a future asset generator cannot produce the
primary asset; it is only data in M3.4 and does not trigger generation.

### D5 — Recipe scenes have one visual source

For `implementation.type = 'recipe'`, `scene.objects` must be empty. Visuals come from the
resolved background plus the recipe layer plan. This prevents a recipe scene from silently
mixing two layouts. `storyboardSchema` rejects non-empty `objects` on recipe scenes. Non-recipe
scenes keep using `scene.objects` exactly as in M3.3.

### D6 — One resolved value feeds the renderer

`mapping.ts` returns:

```ts
{
  componentId, params,
  source: 'implementation' | 'fallback',
  recipe: { id, variant, layers } | null,
  diagnostics
}
```

For a recipe scene, the background component and params come from the selected variant; the
layer plan is already slot-bound. The renderer receives only `componentId`/`params`/`recipe`
through Remotion input props. `source`, `diagnostics` and slot diagnostics stay log/manifest
metadata. `SceneComposition` never selects a recipe or a component again.

### D7 — Layers are a closed set; unknown kinds throw

Recipe layer kinds are a closed enum (`text`, `pill`, `hud-chip`, `subject`, `image`, `chart`,
`particles`, `light`, `overlay`, `character`). Each maps to one reusable component under
`components/layers/`. `SceneObjects` becomes a thin dispatcher over the same layer components,
so legacy scenes keep their behaviour. An unknown layer kind or an unimplemented chart variant
throws a typed `UnsupportedRecipeLayerError`; there is no generic fallback.

### D8 — Camera is one module; recipe camera is a hint

`apps/render-worker/src/camera.ts` owns `shot`, `movement`, `speed` and `parallax` math.
`ParallaxCity` and `KineticTypography` consume it instead of duplicating transforms. `shot`
maps to a base scale (`extreme_wide` 0.92 … `extreme_close` 1.2); `movement`/`speed` produce
translate/scale; `parallax` coefficients select per-depth offsets.

When `camera.parallax` is absent the default is
`[0.15, 0.35, 0.6, 0.8, 1]`, sampled by depth index; depth 0 is the farthest layer. Defaults are
part of the contract, so a missing array still produces deterministic framing rather than a
no-op.

A recipe variant may carry a camera hint for the future director, but `scene.camera` remains
the rendered value. The hint never overrides scene data and never branches on the topic.

### D9 — Recipe failures are not masked by `scene.fallback`

`scene.fallback` exists for AI producers (`image_animation`, `ai_video`, `hybrid`). A recipe
resolution error (unknown recipe/variant/slot/layer/asset) throws a typed error from
`mapping.ts`; it is not converted into a generic `kinetic-typography` scene. The catalog only
references implemented backgrounds, so a valid recipe always resolves in M3.4.

## Consequences

- The M3.5 director consumes `STORYBOARD_RECIPE_IDS`, each recipe's slot specs and
  `STARTER_ASSET_KEYS`; it cannot invent asset paths or recipe ids.
- `sceneImplementationSchema` grows additively. Existing fixture and
  `examples/custom-storyboard.json` stay `programmatic` and render unchanged.
- `resolvedScenePropsSchema` gains a nullable `recipe` field; `source`/diagnostics remain
  outside Remotion props.
- The renderer gains no cloud API, queue, DB or Asset Library code. `image`/`subject` renders
  only local `public/assets/starter/` keys.
- Slot defaults are explicit data. Changing a default is a contract change and must update the
  catalog tests.
- New recipes or variants are additive catalog entries plus a diversity test; no renderer
  switch on the topic is required.

## References

- `docs/ignore/plans/2026-11-10-m3-4-scene-recipes-session.md`
- `docs/adr/0012-storyboard-and-scene-render.md`
- `docs/adr/0014-m3-renderer-first-roadmap.md` (D2, D6)
- `docs/adr/0015-subject-assets-and-mvp-formats.md` (D1–D6)
- `docs/ignore/research/2026-11-10-asset-pipeline-and-format-research.md` (§2, §6, §10.1)
