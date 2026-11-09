# apps/api — NestJS REST API

Applies to the NestJS modular monolith. The root `AGENTS.md` still applies (contracts, run state
machine, provider error classes, hard rules); this file adds API-specific conventions.

- Implemented modules: `auth`, `accounts` (TikTok token vault), `runs` (pipeline/stages),
  `publish`, `system`, `health`, `storage`, `database`, `redis`, `config`, `common`.
  `projects`, `templates`, `assets`, `renders`, `analytics` and `integrations` are planned;
  do not assume they exist until they are in `apps/api/src`.
- Controller → service → repository expresses dependency direction, not folder ceremony. A
  small module keeps `*.controller.ts`, `*.service.ts`, `*.module.ts` and its unit test in one
  folder (`health/`, `database/`, `redis/`, `config/`, `common/`); do not add
  `controllers/`, `services/`, `repositories/` or `modules/` subfolders per module.
- Business rules in services. No vendor SDK calls in controllers or stores.
- Data access uses Drizzle: schema in `packages/db/src/schema.ts`, `DatabaseService.db` is the
  `NodePgDatabase`, repositories receive that handle. No SQL in controllers or stores.
- Schema changes are `drizzle-kit generate` migrations committed with the code. Applied
  migrations are immutable; never edit them, generate a new one. Production uses
  `drizzle-kit migrate`, never `push`.
- Multi-row invariants (run state transition + audit row) run in one transaction.
