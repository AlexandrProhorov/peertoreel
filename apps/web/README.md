# Web

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Project structure

```text
src/app/
├── core/                       # cross-cutting: API base URL, error normalization, layout
├── features/<feature>/
│   ├── api/                    # transport services: URL, HTTP method, DTO mapping/validation
│   ├── data-access/            # state services (store + its domain helpers): signals, cache, cancellation
│   ├── pages/                  # routed page components
│   ├── ui/                     # feature-local presentational components
│   └── <feature>.routes.ts     # feature route table, lazy-loaded from app.routes.ts
└── shared/                     # reusable UI and utilities (must not import feature code)
```

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
