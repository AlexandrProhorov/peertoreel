## 2026-11-01 — Angular feature structure: api/ + data-access/

**Цель:** сделать навигацию по web data layer явной и закрепить соглашение в документации.

**Сделано:**

- `features/health/data/**` разложен по папкам `api/` (транспорт) и `data-access/` (store и
  его domain helper).
- `HealthApi` → `HealthApiService`, `HealthStore` → `HealthStoreService`; файлы
  `health-api.service.ts` / `health-store.service.ts`, тесты — рядом (`*.spec.ts`).
- В `AGENTS.md` переписан раздел Frontend data layer (пути, имена классов, тесты рядом с
  исходниками). Для NestJS явно зафиксировано: модульные файлы остаются в одной папке, без
  `controllers/services/repositories`.
- Структура отражена в `apps/web/README.md`, `ARCHITECTURE.md` и `.opencode/agents/reviewer.md`.

**Проверено:**

- `pnpm check` — lint, typecheck, tests (contracts 3, API 3, web 8), build: успешно.
- Поведение и тестовые сценарии не менялись — только перемещение файлов и переименование классов.

