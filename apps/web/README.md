# Web

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

### Workspace packages (`@peertoreel/contracts`)

The dev server must not prebundle workspace packages: the Vite dependency cache is keyed by the
lockfile, not by the package `dist`, so a new export could stay invisible until the cache is
deleted. `angular.json` therefore sets `serve.options.prebundle.exclude` for
`@peertoreel/contracts` — the package is bundled into the application chunks instead, and the
dev server rebuilds when `packages/contracts/dist` changes.

Any workspace package used by the web app needs the same two things: an entry in
`prebundle.exclude` and its runtime dependencies (for contracts that is `zod`) declared in this
`package.json`, otherwise Vite cannot resolve them from the app root. Run
`pnpm --filter @peertoreel/web clean` to drop the whole `.angular/cache` if the dependency cache
ever gets corrupted.

## Project structure

```text
src/app/
├── core/                       # cross-cutting: API base URL, error normalization, layout
│   ├── api/                    # BaseApiService: URL, credentials, response validation
│   └── state/                  # BaseStore: loading/pending, error, relative id
├── features/<feature>/
│   ├── api/                    # transport services: URL, HTTP method, DTO mapping/validation
│   ├── data-access/            # state services (store + its domain helpers): signals, cache, cancellation
│   ├── pages/                  # routed page components
│   ├── ui/                     # feature-local presentational components
│   └── <feature>.routes.ts     # feature route table, lazy-loaded from app.routes.ts
└── shared/                     # reusable UI and utilities (must not import feature code)
```

### Data layer

- `api/*.service.ts` extends `BaseApiService`; it only builds the path, chooses the method and
  validates the response with a schema. No state, cache or user-facing errors.
- `data-access/*.service.ts` extends `BaseStore`; `query()` wraps cancellable reads and
  `command()` wraps one-shot mutations. `loading`, `pending` and `error` come from the base.
- Per-entity stores (`runs` list/detail) are declared in route `providers` and destroyed with
  the route. The detail store binds its route id through `setRelativeId`.
- An in-flight stage progress is rehydrated from `GET /runs/:id/stages/:stage/job` when the
  page opens, so navigation, reload and a second tab do not lose the progress bar.
- Root stores are reserved for global state: auth/session, health, and the system SSE job.

See `docs/adr/0007-web-data-layer.md` for the full decision.

Unit tests live next to the file they cover (`*.spec.ts`), not in a mirrored `tests/` tree.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
