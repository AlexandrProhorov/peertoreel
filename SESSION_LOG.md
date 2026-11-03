# SESSION LOG

## 2026-11-03 — S0.3 Auth + sessions + baseline schema

**Цель:** вход в систему на серверных сессиях, первые бизнес-таблицы `users`/`sessions`,
закрытый доступ к рабочему API и UI логина.

**Сделано:**

- `packages/contracts/src/auth.ts` — `userRole`, `authUser`, `loginRequest`, `authSession`
  (`login`/`me` response). Zod, единственный источник правды для API и web.
- Drizzle-схема: `user_role` enum (`admin` | `editor`), `users`
  (email unique, argon2 hash, `is_active`, timestamps), `sessions`
  (`token_hash` unique, `expires_at`, индексы по user и expiry, cascade на удаление юзера).
  Миграция `0002_fluffy_marvel_zombies.sql` сгенерирована и применена.
- API `auth/`: `AuthService`, `PasswordService` (`@node-rs/argon2`, Argon2id 19 MiB/t=2/p=1),
  `UsersRepository`, `SessionsRepository`, `SessionAuthGuard`, `CurrentUser`,
  `AdminBootstrapService`.
- Сессия: 32 случайных байта в `kadence_session` (httpOnly, SameSite=Lax, Secure в prod),
  в БД только `sha256(token)`, TTL `SESSION_TTL_HOURS` (168 ч), `last_seen_at` не чаще
  раза в 5 минут. Логин при неизвестном email тратит хеш на decoy-пароль.
- Endpoints: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`.
- `/system` закрыт `SessionAuthGuard`; web шлёт cookie (`withCredentials` + `EventSource`
  с `withCredentials`).
- `cookie-parser` подключён в `main.ts`; env получил `SESSION_TTL_HOURS`,
  `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.
- Web `features/auth/`: `AuthApiService`, `AuthStoreService` (signals, `exhaustMap` на логин,
  `restore()` с дедупликацией запроса), `authGuard`, страница `/login` с типизированной
  формой и состояниями loading/error. Shell показывает пользователя и «Выйти».
- Состояние сессии вынесено в `core/auth/session-state.service.ts`; guard и кнопка «Выйти»
  грузят auth-фичу динамическим `import()`, иначе `@kadence/contracts` с Zod попадал в
  initial bundle (809 kB → 320 kB).
- ADR-0004 (серверные сессии), обновлены `README.md`, `ARCHITECTURE.md`, `AGENTS.md` §5.

**Проверено:**

- `pnpm --filter @kadence/contracts build`, `api typecheck` — успешно.
- Тесты: contracts 12, API 13, worker 2, web 21.
- `pnpm check` — зелёный (lint/typecheck/test/build), initial bundle 320.21 kB при бюджете
  500 kB.
- `pnpm db:migrate` — миграция `0002` применена; в БД `users`, `sessions`, `user_role`.
- API вручную (curl):
  - неверный пароль → `401 UNAUTHORIZED`, тело в едином error envelope;
  - верный пароль → `200`, `Set-Cookie: kadence_session=…; HttpOnly; SameSite=Lax`;
  - `GET /auth/me` с cookie → `200`, без cookie → `401`;
  - `POST /system/ping` без cookie → `401`, с cookie → `202`;
  - SSE `/system/ping/:jobId/events` без cookie → `401`, с cookie → `event: job` + `completed`;
  - `POST /auth/logout` → `204`, после него `/auth/me` → `401`, строк в `sessions` — 0.
- В БД: `password_hash` = `$argon2id$v=19$m=19456…`, `token_hash` не совпадает с cookie
  (хранится sha256), `role=admin`.
- Браузер: `/health` без сессии → redirect на `/login`; вход `owner@kadence.local` →
  `/health` с «Owner»/«Выйти» в шапке; `/system` → ping прошёл (100%, 471 мс) без console
  errors; «Выйти» → `/login`, защищённые роуты снова редиректят.

**Осталось / осознанно не сделано:**

- Нет rate limit и lockout на логин, нет аудита неудачных попыток, нет MFA.
- Нет cron-очистки истёкших сессий (только на старте приложения).
- Клиент доверяет локальному сигналу пользователя: истечение сессии обнаруживается ответом
  `401` на реальном запросе, без фонового refresh.
- В dev-сервере Angular пришлось очистить `.angular/cache` — Vite пре-бандлил старый
  `@kadence/contracts` без `loginResponseSchema`.

**Следующая сессия:** S0.4 — state machine skeleton + reviewer gate.

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
- `pnpm --filter @kadence/api typecheck` и `test` прошли.
- `pnpm check` — lint/typecheck/test/build зелёные.
- Health endpoint работает через Drizzle (`select 1`): `GET /api/v1/health/ready` → 200.
- Повторный `db:generate` пишет `No schema changes`.

## 2026-11-02 — S0.2a Worker + BullMQ + ping job

**Цель:** отдельный worker, очередь `system` и end-to-end ping через Redis.

**Сделано:**

- Создан `apps/worker` (ESM, TS): config/env, Redis connection options, ping processor, main.
- В contracts добавлены `SYSTEM_QUEUE`, `PING_JOB`, ping schemas и status snapshot.
- В API добавлен `SystemModule`: `POST /api/v1/system/ping`, `GET /api/v1/system/ping/:jobId`.
- Добавлен `ZodValidationPipe` для валидации body на границе.
- `Queue.add` использует `jobId = requestId`, `attempts: 3`, exponential backoff,
  `removeOnComplete/removeOnFail: 100`.
- Worker обновляет progress 10 → 50 → 90 → 100, возвращает типизированный результат.
- Worker закрывается по `SIGINT`/`SIGTERM`.
- Root `pnpm dev` запускает api + web + worker.

**Проверено:**

- `pnpm check` — lint/typecheck/test/build зелёные.
- Tests: contracts 7, API 3, worker 2, web 8.
- `POST /api/v1/system/ping` с `requestId=demo-1` дважды → оба ответа `jobId=demo-1`.
- `GET /api/v1/system/ping/demo-1` → `status: completed`, `progress: 100`,
  result содержит `requestId`, `processedAt`, `durationMs`.
- В Redis существует один job hash `bull:system:demo-1`; дубль не создан.
- Worker обработал job и залогировал `job completed`.

## 2026-11-02 — S0.2b SSE progress + web ping UI

**Цель:** показать прогресс job в реальном времени и дать пользователю кнопку запуска.

**Сделано:**

- API: `SystemEventsService` на BullMQ `QueueEvents`; SSE endpoint
  `GET /api/v1/system/ping/:jobId/events`.
- SSE отправляет начальный snapshot, затем live-события `waiting/active/progress/completed/failed`
  и завершает поток на `completed`/`failed`.
- Web: feature `features/system/` по структуре `api/` + `data-access/` + `pages/`.
- `SystemApiService`: POST enqueue, GET snapshot, SSE через `EventSource`.
- `SystemStoreService`: `exhaustMap` на запуск, `switchMap` на SSE, сигналы
  `jobId/status/progress/result/error/running/history`.
- Страница `/system`: кнопка запуска, progress bar, job ID, результат, история событий.
- Навигация в shell: «Очередь».

**Проверено:**

- `pnpm --filter @kadence/web typecheck` и `test` — успешно.
- Web tests: 12 (включая SystemApiService и SystemStoreService).
- SSE вручную: `GET /api/v1/system/ping/demo-sse-4/events` отдал `active 90` и
  `completed 100` с result.
- Браузер: `/system` → «Запустить ping» → job завершился, UI показал 100%,
  request ID, время обработки и длительность; console errors нет.
- `pnpm check` — будет финально прогнан после документации.

**Следующая сессия:** S0.3 — auth + sessions + baseline schema.
