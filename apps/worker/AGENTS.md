# apps/worker — BullMQ pipeline worker

Applies to the plain Node.js worker process. The root `AGENTS.md` still applies (stage
contracts, run state machine, queues and limits, provider rules); this file adds worker-specific
conventions.

- `apps/worker` is a separate plain Node.js process, not a Nest application. Job payloads,
  results and queue names live in `packages/contracts`.
- Every job handler is **idempotent**: re-running a job must not duplicate artifacts,
  posts or charges. Use run/stage state as the idempotency guard; use a deterministic
  `jobId` where the queue supports it.
- Every processor also re-checks `STAGE_REQUIRED_STATE` before doing work; idempotency alone is
  not a state guard. `processScriptStage` currently lacks this check — fix it when that file is
  touched.
- Scene rendering is per-scene (M3.7): payload `{ runId, sceneIdx }`, `scene_clip` artifact,
  deterministic key; regenerating one scene must not rebuild the whole video.
- Classify provider errors: retryable vs terminal (see `AGENTS.md` §7). Max attempts + backoff
  are configured per queue, never hardcoded in handlers.
- FFmpeg arguments come from structured inputs only — never interpolate user text into
  shell strings. Shell out with argument arrays.
- **The director returns a draft, not timings.** The M3.5 director draft may choose
  recipes/variants/slots and narration text only; scene windows are derived from real TTS audio
  and a word-count mismatch fails instead of shifting scenes. The `--tts google` fallback is
  CLI-spike-only: the production `voiceover` stage stays on ElevenLabs and the provider is
  recorded in the manifest.
- **Assets come from the resolver, not from job code.** When a stage needs a subject asset, call
  `@peertoreel/assets` (`TieredAssetResolver`) with `allowProvider` set explicitly from config;
  never import Recraft/fal.ai SDKs in a processor. The resolver's typed errors are terminal for
  the asset, not for the run: use `fallbackKey`/Tier 0 instead of retrying a licence or unknown
  key (ADR-0017).
- **Record real provider usage.** `AssetResolution.usage` carries the provider's measured
  requests/cost (`costUsd: null` when not measured). Never replace it with an estimate; the
  cost ledger is M3.7.
