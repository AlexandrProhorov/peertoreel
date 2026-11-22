## 2026-11-02 — Drizzle foundation

**Цель:** заменить самописный migration runner на Drizzle ORM + drizzle-kit до появления
первой бизнес-таблицы.

**Сделано:**

- Добавлены `drizzle-orm` и `drizzle-kit`.
- Создана схема `apps/api/src/db/schema.ts` с `app_meta`.
- `DatabaseService` создаёт `pg.Pool` и `NodePgDatabase`.
- Добавлен `drizzle.config.ts`.
- Сгенерирована миграция `0000_nifty_living_mummy.sql`; для существующей локальной БД
  сделана идемпотентной (`CREATE TABLE IF NOT EXISTS`).
- Custom-миграция `0001_drop_legacy_migrations.sql` удалила старую `schema_migrations`.
- Удалены `src/db/migrate.ts` и старый SQL-мигратор.
- `db:migrate` теперь применяет Drizzle-миграции; добавлены `db:generate` и `db:studio`.
- Решение зафиксировано в `docs/adr/0003-drizzle-orm.md`.

**Проверено:**

- `drizzle-kit migrate` применил 2 миграции.
- В БД остались `app_meta` и `drizzle.__drizzle_migrations`; `schema_migrations` удалена.
- `app_meta` сохранила `schema_version = 1`.
- `pnpm --filter @peertoreel/api typecheck` и `test` прошли.
- `pnpm check` — lint/typecheck/test/build зелёные.
- Health endpoint работает через Drizzle (`select 1`): `GET /api/v1/health/ready` → 200.
- Повторный `db:generate` пишет `No schema changes`.

