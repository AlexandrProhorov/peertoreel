# LEARNING

Статусы: `not started` · `seen` · `practiced` · `explained`.

| ID | Тема | Привязка | Статус | Заметки |
|---|---|---|---|---|
| L1 | Monorepo, pnpm workspaces, ESM-контракты | M0.1–M0.2 | seen | contracts собираются отдельно, API/web импортируют dist |
| L2 | NestJS DI, modules, lifecycle | M0.4 | practiced | ConfigModule, DatabaseModule, RedisModule, HealthModule |
| L3 | Health vs readiness | M0.4–M0.5 | practiced | liveness не трогает зависимости, readiness проверяет DB/Redis |
| L4 | Zod на границе | M0.2, M0.4 | practiced | env validation + response parsing на web |
| L5 | PostgreSQL pool и миграции | M0.4 | seen | `pg.Pool`, SQL-мигратор, `schema_migrations` |
| L6 | Redis lifecycle | M0.4 | seen | lazy connect, ping, graceful shutdown |
| L7 | Angular signals и stores | M0.5 | practiced | `signal`, `computed`, store + page; `Subject` + `switchMap` для refreshable-данных |
| L8 | Ошибки как `unknown` | M0.5 | practiced | `toErrorMessage`, narrowing `HttpErrorResponse`, Zod parse error body |

## Контрольный вопрос S0.1

Почему `/health/live` не должен проверять Postgres и Redis, а `/health/ready` должен?
Что произойдёт с контейнером API при ложном failing readiness?
