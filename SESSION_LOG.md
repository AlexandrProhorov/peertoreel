# SESSION LOG

## 2026-10-30 — S0.1 Bootstrap & health vertical slice

**Цель:** запускаемый монорепо, в котором web видит здоровье API, а API проверяет Postgres и Redis.

**Сделано:**

- Создан pnpm workspace, корневые tsconfig/prettier/editorconfig.
- Создан `@kadence/contracts` с Zod-схемами health и error.
- Создан `apps/api` на NestJS 12: config, Postgres, Redis, health, error filter, миграции.
- Создан `apps/web` на Angular 22: shell, health page, API client, store, Material 3.
- Поднят `infra/docker-compose.yml`: PostgreSQL 18, Redis 8, SeaweedFS S3.
- Применена миграция `0001_init.sql`.
- Добавлен CI workflow.
- MinIO заменён на SeaweedFS из-за удаления community-образов; решение записано в ADR-0002.
- Frontend data layer приведён к правилу: `*.api.ts` — только транспорт, `*.store.ts` — состояние.
  `HealthApi` возвращает `Observable<ReadinessResponse>` без `firstValueFrom`/`catchError`;
  `HealthStore` использует `Subject` + `switchMap` + `catchError` + `takeUntilDestroyed`.
  503 readiness обрабатывается в store как degraded domain data.
- Правила frontend data layer зафиксированы в `AGENTS.md`.

**Проверено:**

- `pnpm db:migrate` — applied 0001_init.sql.
- `pnpm --filter @kadence/contracts build` — успешно.
- `pnpm --filter @kadence/api typecheck` — успешно.
- `pnpm --filter @kadence/api test` — 3 теста.
- `pnpm --filter @kadence/web typecheck` — успешно.
- `pnpm --filter @kadence/web build` — успешно.
- `docker compose ... up -d --wait` — Postgres, Redis, storage healthy.

- `GET /api/v1/health/live` → 200, `status: ok`.
- `GET /api/v1/health/ready` → 200, `database: up`, `redis: up`.
- При остановленном Redis readiness → 503, `status: degraded`, `redis: down`.
- После старта Redis readiness снова → 200.
- Web в браузере: health page отображает API/PostgreSQL/Redis и uptime.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — успешно.
- `pnpm test`: contracts 3, API 3, web 8.
- API/store tests: URL/method/mapping, 503 degraded, normalized error, switchMap cancellation.

**Осталось проверить:**

- CI на GitHub после первого push.
- `git init` и remote (делает пользователь).

**Следующая сессия:** S0.2 — worker + BullMQ + SSE ping.
