# ADR-0007 — Web data layer: base classes and route-scoped run state

**Status:** accepted · 2026-11-04

## Context

By M0 the web app had four stores (`runs`, `health`, `system`, `auth`) that each repeated the
same infrastructure: `DestroyRef` + `takeUntilDestroyed`, request `Subject`s, three boolean
signals (`loading`/`pending`/`error`), `finalize`, and `catchError` → `toErrorMessage`.

`RunsStoreService` was a root singleton that owned four independent concerns: the run list,
one run's detail, creation/transitions, and stage polling. As a result:

- a list error could appear on a run page, and list/detail requests shared one `loading`;
- leaving a run page required `ngOnDestroy` + `clearStageJob()` to hide the stage card, while
  the root store kept polling in the background;
- returning to a run after a reload lost the stage progress bar, even when the BullMQ job was
  still running;
- a run in `RENDERING` had no `STAGE_FOR_STATE` mapping, so its progress disappeared as soon as
  the detail was refreshed.

The same session also needed a convention for per-entity state that scales to the M2 review
screen and the future publish card, without a global store or a registry of stores.

## Decision

### Base classes

- `core/api/base-api.service.ts` — `BaseApiService` owns the base URL, `withCredentials`, and
  response validation through a structural `ResponseSchema<T>` (no dependency on `zod`).
  Subclasses only build the path and choose the method.
- `core/state/base-store.ts` — `BaseStore` owns `loading`/`pending` counters, error
  normalization, `query()` and `command()`:
  - `query(source)` is an **operator**: it increments/decrements a loading counter and
    normalizes errors. Cancellation stays with the caller (`switchMap`), and it does not clear
    a previous error, so a background refresh cannot hide a message the user still needs.
  - `command(key, factory)` is a **one-shot Promise**: it deduplicates by key, tracks `pending`,
    normalizes errors and never rejects (`null` means failure or cancellation). It uses
    `lastValueFrom`, so it also works for SSE streams that end with a final snapshot.
- `BaseStore.setRelativeId(id | null)` is an optional mode: the same id is a no-op, a new id
  resets the scoped state via `onRelativeIdChanged`, and `null` returns to root mode. There is
  no `ScopedStore`, registry or refcount.

### Store scope

Per-entity state lives in a **route-scoped** store (`providers` on the route), not in
`providedIn: 'root'`:

```ts
{ path: ':id', providers: [RunDetailStoreService], loadComponent: ... }
```

Angular creates the store on entering the route and destroys it on leaving. `RunsListStoreService`
and `RunDetailStoreService` are both scoped this way. Root stores remain only for genuinely global
state: `SessionStateService`, `AuthStoreService`, `HealthStoreService`, and `SystemStoreService`
(an SSE job that should survive navigation).

### Progress rehydration

The server is the source of truth for in-flight work. When a detail store is created, it loads
the run and asks `stageForProgress(run.state)` for the job worth observing, then calls
`GET /runs/:id/stages/:stage/job`:

- `queued`/`active` → continue polling with `timer`;
- `completed`/`failed` → refresh the run once and stop;
- `404` → no job, not an error.

`stageForProgress` is a new contract helper next to `STAGE_FOR_STATE`. It adds
`RENDERING → render`, because the render stage is started from `VISUALS_READY` but the run moves
to `RENDERING` while FFmpeg is still working.

This is why the store does not need `clear*()` methods or `ngOnDestroy` cleanup in pages: the
DI scope owns the lifetime, and a fresh store rehydrates from the server after a reload, a
navigation or a second tab.

## Alternatives considered

- **Keep one root `RunsStoreService` and add `clear*` methods.** It already produced the progress
  bug: the polling continued while the UI state was cleared, and cross-page `loading`/`error`
  leaked. Rejected.
- **Keep a registry of per-run stores alive.** It preserves client state without a reload, but
  it leaks memory, does not survive an F5 or a second tab, and requires manual refcounting.
  Server rehydration solves all three with one HTTP call. Rejected.
- **`ScopedStore` + `ScopedStoreRegistry`.** Extra layer with no current use; Angular DI already
  provides the lifetime. Rejected.
- **Adopt `rxResource`/`httpResource` for the detail read now.** They would give `value`,
  `isLoading`, `error` and `reload`, but the store already needs a stream for stage polling and a
  command model for transitions. Two state models in one store would be harder to reason about.
  Deferred to M3, when the detail shape stabilizes.
- **Return `{ job: null }` (or 204) instead of 404 from the job endpoint.** Semantically cleaner,
  but it changes the API and its tests for a case the client can handle in one predicate.
  Rejected for now.

## Consequences

- New stores are small: feature state + a `query`/`command` call; the lifecycle lives in
  `BaseStore`.
- `RunsStoreService` is deleted and replaced by `RunsListStoreService` and
  `RunDetailStoreService`; `RunsStoreService`'s specs are replaced by two store specs.
- Pages no longer call `clearCreated()`/`clearStageJob()` and no longer implement `OnDestroy`
  for store cleanup. `RunPageComponent` keeps one `effect` that binds the route id through
  `setRelativeId`; `RunsPageComponent` navigates in the `.then` of `create()`.
- The stage card distinguishes `stageToRun` (what can be started) from `watchingStage` (what is
  already in flight), which fixes the `RENDERING` case.
- `GET /runs/:id/stages/:stage/job` is called once when a run page is opened for a state that
  can have a job. A `404` is expected on gates and is not shown as an error.
- `BaseStore.command` uses a deterministic in-flight key instead of a per-method `Subject` +
  `exhaustMap`; the effect is the same, with less code.
- The web `tsconfig.json` now enables `strict` and `noUncheckedIndexedAccess` (the app and specs
  already compiled cleanly with both flags).
