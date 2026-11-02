# ARCHITECTURE

## Текущий срез: M0

```text
┌─────────────┐       HTTP/JSON        ┌──────────────┐
│ Angular 22  │ ─────────────────────► │ NestJS 12    │
│ :4200       │                        │ :3000        │
└─────────────┘                        └──────┬───────┘
                                              │
                         ┌────────────────────┼────────────────────┐
                         │                    │                    │
                         ▼                    ▼                    ▼
                  ┌────────────┐       ┌────────────┐       ┌────────────┐
                  │ PostgreSQL │       │ Redis      │       │ S3         │
                  │ :5432      │       │ :6379      │       │ :8333      │
                  └────────────┘       └────────────┘       └────────────┘
```

Пока worker'а нет. Redis подключён и проверяется readiness-чеком, но ещё не используется
приложением. S3 поднят для следующего milestone.

## Packages

### `packages/contracts`

Единственный источник правды для схем, которые пересекают границы процессов:

- `health.ts` — liveness/readiness response;
- `errors.ts` — единый error envelope.

Схемы описаны Zod. API, web и worker импортируют один и тот же пакет. Пакет собирается в ESM
(`dist/index.js` + `dist/index.d.ts`), потому что NestJS 12 и Angular 22 работают в ESM.

### `apps/api`

Слои:

- `config/` — Zod-валидация env, ConfigModule;
- `database/` — `pg.Pool`, Drizzle client, ping, lifecycle;
- `redis/` — `ioredis`, lazy connect, ping;
- `health/` — liveness/readiness;
- `common/` — exception filter и единый формат ошибок;
- `db/schema.ts` — Drizzle-схема;
- `drizzle/` — сгенерированные SQL-миграции и journal.

Принцип: controller → service → infrastructure. Бизнес-логики пока нет.

### `apps/web`

- `core/` — API base URL, нормализация ошибок;
- `features/health/` — `api/` (transport), `data-access/` (store + domain helper),
  `pages/` (route page);
- `shared/` — появится позже.

Правила:

- `api/<feature>-api.service.ts` (`<Feature>ApiService`) только транспорт;
- `data-access/<feature>-store.service.ts` (`<Feature>StoreService`) владеет состоянием;
- unit-тесты лежат рядом с исходниками (`*.spec.ts`);
- компоненты рендерят и делегируют;
- ошибки нормализуются в `core/http/error-message.ts`.

## Health: почему два endpoint'а

- `GET /api/v1/health/live` — процесс жив. Не проверяет зависимости. Если проверять БД,
  временный сбой Postgres вызовет рестарт API, хотя сам API исправен.
- `GET /api/v1/health/ready` — API готов принимать трафик. Проверяет Postgres и Redis.
  При недоступности зависимости возвращает `503` и `status: degraded`.

Web показывает readiness и умеет отобразить degraded-состояние, потому что API парсит тело
ответа даже при `503`.

## Ошибки

Формат:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "…",
    "requestId": "…"
  }
}
```

`ApiExceptionFilter` перехватывает `unknown`, маппит HTTP-статус в `ApiErrorCode` и не отдаёт
внутренние детали наружу. Для 5xx пишет structured log через Nest Logger.

## Data access

```text
Service → Repository → DatabaseService.db (Drizzle) → pg.Pool → PostgreSQL
```

- `schema.ts` — источник правды для таблиц.
- Миграции генерируются `drizzle-kit generate`, применяются `drizzle-kit migrate`.
- Сгенерированный SQL коммитится и читается перед применением.
- Применённые миграции immutable.
- `drizzle-kit push` — только локальные эксперименты, не production.

## Локальная инфраструктура

- PostgreSQL 18: volume монтируется в `/var/lib/postgresql` — требование образа 18+.
- Redis 8: AOF.
- SeaweedFS: S3 API на `:8333`, bucket `kadence` создаётся init-контейнером.
- Production storage: Cloudflare R2 через S3 API.

## Следующие архитектурные шаги

1. Worker + BullMQ + SSE.
2. Auth + sessions.
3. Run state machine + `run_stages` + `run_events`.
4. Provider ports и cost ledger.
