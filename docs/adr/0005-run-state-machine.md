# ADR-0005 — Run state machine with one FAILED state and a resume pointer

**Status:** accepted · 2026-11-03

## Context

S0.4 introduces the first business table with a lifecycle: a `run` moves through the
pipeline and can fail in any stage. The sketch in `AGENTS.md` wrote failures as
`FAILED_<STAGE>`, and said a failed stage restarts without restarting the run.

Two questions had to be answered before writing the schema:

1. Represent failure as 8 enum values (`FAILED_RESEARCH`, …) or as one `FAILED` state
   plus a stage column?
2. How does "restart only that stage" stay correct after the run has already moved on,
   and how do we keep an audit trail that the reviewer can read?

## Decision

- One `run_state` enum: `DRAFT, RESEARCHING, SCRIPT_READY, VOICE_READY, VISUALS_READY,
  RENDERING, REVIEW, SCHEDULED, PUBLISHING, PUBLISHED, FAILED`.
- `runs` carries `failed_stage` (`run_stage`), `failure_reason` (text) and
  `resume_state` (the state the run was in when it failed).
- `FAILED` is reachable from every unfinished state and leads **only** back to
  `resume_state`. That is the "restart only that stage" rule expressed as a single check.
- Entering `FAILED` without a reason is rejected (`400`); an illegal edge is `409`.
- Every transition, including run creation, writes a `run_events` row in the same
  transaction as the `runs` update: `from_state`, `to_state`, `stage`, `reason`.
- Allowed edges are declared once in `packages/contracts/src/run.ts`
  (`allowedTransitions`, `canTransition`, `stageForState`), so the API enforces them and
  the UI can render only valid actions from the same source.

## Alternatives considered

- **`FAILED_<STAGE>` enum values** — makes the transition table 19×19, duplicates the stage
  in a string, and every consumer has to parse the suffix to learn which stage failed.
  Rejected: a column expresses the same fact without parsing.
- **Recompute the resume state from `failed_stage`** — a stage does not map 1:1 to a state
  (the script stage ends in `SCRIPT_READY`, which is a gate, not a running state). An explicit
  pointer is cheaper than a reverse mapping that will drift.
- **Wire the audit into `jobs_audit`** — that table describes BullMQ jobs (attempts, queue
  errors). Run history is a product artefact; keeping them apart avoids fake queue rows.
- **`run_stages` table now** — would hold per-stage status today with no stage executor to
  write it. `runs` + `run_events` is enough for the skeleton; the table arrives with S1
  stage execution, together with `artifacts`.

## Consequences

- One nullable column pair (`failed_stage`, `resume_state`) instead of an enum explosion;
  `runs.state` stays a small closed set for indexes and UI badges.
- Retry is a normal transition (`FAILED → resume_state`), so it is audited like everything else.
- The DB enum is duplicated in `apps/api/src/db/schema.ts` because drizzle-kit loads the
  schema through CJS and cannot import the ESM-only contracts package; `schema.spec.ts`
  fails if the two lists drift.
- Deletion of a run cascades to its events; events are append-only and never updated.
