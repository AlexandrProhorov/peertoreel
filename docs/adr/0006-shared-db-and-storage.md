# ADR-0006 — Shared db and storage packages, artifacts in S3

**Status:** accepted · 2026-11-04

## Context

The worker was a BullMQ consumer that never touched Postgres: it only echoed ping jobs.
Stages that produce media (voiceover, render) must read the run, write artifacts and move
the run state — the same tables the API owns. Meanwhile rendered files lived in
`C:\Temp`, invisible to the product.

Two structural questions had to be answered:

1. Where does the Drizzle schema live, now that two processes need it?
2. Where do produced files live, and who is allowed to write artifact rows?

## Decision

- **`packages/db`** holds the schema, the `createDatabase()` factory and the shared types.
  The API wraps it in `DatabaseService` (Nest lifecycle); the worker uses it directly and
  calls `pool.end()` on shutdown. Migrations stay in `apps/api/drizzle` and are applied by
  `drizzle-kit` from the API package — the worker never migrates.
- **`packages/storage`** wraps an S3-compatible client (SeaweedFS locally, R2 in production)
  with `putObject`, `getObject`, `deleteObject`, `presignGet` and a key builder
  `runs/<runId>/<stage>/<name>`.
- **`artifacts` table** is the registry of every produced file: `run_id`, `stage`, `type`,
  `object_key`, `content_type`, `size_bytes`, `meta`. The object itself lives only in S3;
  local disk is a scratch area for FFmpeg.
- Artifact rows are written by whichever process produced the file (worker), in the same
  logical step as the upload; the API only reads and presigns (`GET /runs/:id/artifacts`).
- `object_key` is unique, so re-running a stage overwrites the object and keeps a single row
  — the first building block of stage idempotency.

## Alternatives considered

- **Keep the schema in the API and let the worker HTTP-call the API** — second write path,
  extra failure mode, and the API would have to expose internal endpoints just for the worker.
- **Duplicate the schema in the worker** — guaranteed drift; a migration would silently make
  the two processes disagree.
- **Serve artifacts from local disk / API static route** — breaks the moment the worker and
  API are different containers, and TikTok `PULL_FROM_URL` needs a real object URL later.
- **Postgres large objects / bytea** — bloats the database, backups and replication for
  files that are already content-addressed by key in S3.

## Consequences

- `AGENTS.md` §2/§3/§8 updated: schema path and package list.
- drizzle-kit points at `../../packages/db/src/schema.ts`; the enum-parity test moved to
  `packages/db`.
- Worker gained `@peertoreel/db`, `@peertoreel/storage`, `drizzle-orm` and `pg` dependencies.
- The API needs S3 credentials in env (defaults match the local compose stack).
- Deleting a run cascades to artifact rows; objects in S3 are not deleted automatically yet —
  a cleanup job will be needed before production.
- Presigned URLs expire after one hour and are the only way the UI reads files, so no bucket
  has to be public.
