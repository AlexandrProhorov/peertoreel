# apps/worker — BullMQ pipeline worker

Applies to the plain Node.js worker process. The root `AGENTS.md` still applies (stage
contracts, run state machine, queues and limits, provider rules); this file adds worker-specific
conventions.

- `apps/worker` is a separate plain Node.js process, not a Nest application. Job payloads,
  results and queue names live in `packages/contracts`.
- Every job handler is **idempotent**: re-running a job must not duplicate artifacts,
  posts or charges. Use run/stage state as the idempotency guard; use a deterministic
  `jobId` where the queue supports it.
- Classify provider errors: retryable vs terminal (see `AGENTS.md` §7). Max attempts + backoff
  are configured per queue, never hardcoded in handlers.
- FFmpeg arguments come from structured inputs only — never interpolate user text into
  shell strings. Shell out with argument arrays.
