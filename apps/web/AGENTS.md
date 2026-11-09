# apps/web — Angular dashboard

Applies to the Angular dashboard. The root `AGENTS.md` still applies (RU content, hard rules,
testing framework); this file adds dashboard-specific conventions. Global `AGENTS_ANGULAR.md`
conventions also apply.

- Global `AGENTS_ANGULAR.md` conventions apply (signals, `input()`/`output()`, `@if`/`@for`
  with `track`, no zone.js assumptions, typed reactive forms, lazy routes).
- Feature layout: `features/<feature>/{api,data-access,pages,ui}`; `core/` for
  config/http/auth/layout; `shared/` for reusable UI.

  ```text
  features/<feature>/
  ├── api/
  │   ├── <feature>-api.service.ts
  │   └── <feature>-api.service.spec.ts
  ├── data-access/
  │   ├── <feature>-store.service.ts
  │   ├── <feature>-store.service.spec.ts
  │   └── local helpers/types only when needed
  ├── pages/
  ├── ui/
  └── <feature>.routes.ts
  ```

- Run progress, publish states and cost views render from signal stores fed by SSE.

## Frontend data layer

- `api/<feature>-api.service.ts` (class `<Feature>ApiService`) extends `BaseApiService`
  (`core/api/base-api.service.ts`) and stays transport only: build the path, choose the HTTP
  method, pass parameters, map DTO → interface, validate the response schema through
  `get`/`post`/`postVoid`. It must not own state, cache, retry, `catchError`, user-facing
  messages, `firstValueFrom`/`lastValueFrom` or business decisions. A mapper that starts making
  business decisions belongs in the store/domain.
- `data-access/<feature>-store.service.ts` (class `<Feature>StoreService`) extends `BaseStore`
  (`core/state/base-store.ts`) and owns the feature state. Use `query(source)` for cancellable
  reads and `command(key, factory)` for one-shot mutations; `loading`, `pending` and `error` come
  from the base class. `query()` does not clear a previous error — call `clearError()` only at an
  explicit entry point (`load`, `setRelativeId`, `command`).
- Per-entity state is scoped by Angular DI: declare the store in the route `providers` (or a
  repeated component's `providers`), not `providedIn: 'root'`. Root stores are only for genuinely
  global state (session/auth, health, the system SSE job). Never keep a registry of per-entity
  store instances.
- A scoped detail store uses `setRelativeId(id)`; the component binds the route input once with
  `effect(() => store.setRelativeId(this.id()))`. Do not write `clear*()` methods or clean up a
  store from `ngOnDestroy`: leaving the route destroys the store.
- Progress of an in-flight job is rehydrated from the server when a scoped store is created (the
  BullMQ snapshot is the source of truth), not cached in a root singleton. This is what makes the
  progress bar survive navigation, F5 and a second tab.
- `data-access/` also holds domain helpers and local types tied to that store (e.g.
  `health.error.ts`). It is not a dumping ground for unrelated business logic, and a store or
  helper file must not exist without a current use.
- Use `switchMap` for cancellable reads. Use `BaseStore.command()` (an in-flight key) for
  submit/mutation flows so the same operation cannot be started twice; `exhaustMap`/`concatMap`
  remain fine inside a command when a stream itself needs serialization.
- `catchError` receives `unknown`; narrow it immediately to `HttpErrorResponse` or a domain
  error and normalize it through one shared mapper. `unknown` must not leak into public
  API/store signatures.
- A component may call `firstValueFrom` directly only for a trivial one-shot request with no
  shared state and no business logic. Otherwise the request belongs in a store.
- Cache and retry policies live in the store or a dedicated service, never in
  `<feature>-api.service.ts`.
- Tests sit next to the file they cover with a `.spec.ts` suffix; do not create a mirrored
  `tests/` tree. `api/<feature>-api.service.spec.ts` covers URL, method, mapping/validation
  with `HttpTestingController`; `data-access/<feature>-store.service.spec.ts` covers stores
  with fake Observables (`of`/`throwError`) and assertions on signals, error and loading state.
  `BaseStore` and `BaseApiService` have their own specs: counters, command deduplication,
  relative-id transitions, malformed payloads.
- Do not use the legacy `*.api.ts` / `*.store.ts` names for new web data services; no barrel
  files or path aliases were introduced with this layout.
