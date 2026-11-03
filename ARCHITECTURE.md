# ARCHITECTURE

## Текущий срез: M0

```text
┌─────────────┐      HTTP/JSON       ┌──────────────┐
│ Angular 22  │ ───────────────────► │ NestJS 12    │
│ :4200       │                      │ API :3000    │
└─────────────┘                      └──────┬───────┘
                                            │
                         ┌──────────────────┼──────────────────┐
                         │                  │                  │
                         ▼                  ▼                  ▼
                  ┌────────────┐     ┌────────────┐     ┌────────────┐
                  │ PostgreSQL │     │ Redis      │     │ S3         │
                  │ :5432      │     │ :6379      │     │ :8333      │
                  └────────────┘     └──────┬─────┘     └────────────┘
                                            │
                                            │ BullMQ
                                            ▼
                                     ┌────────────┐
                                     │ Worker     │
                                     │ apps/worker│
                                     └────────────┘
```

Redis используется как транспорт BullMQ. Worker — отдельный процесс, который забирает jobs
из очереди `system`. S3 пока поднят, но приложением не используется.

## System queue (S0.2a)

```text
POST /api/v1/system/ping
  → SystemQueue.enqueuePing()
  → Queue.add('ping', { requestId }, { jobId: requestId, attempts: 3 })
  → Redis
  → Worker processPing()
  → progress 10 → 50 → 90 → 100
  → result { requestId, processedAt, durationMs }

GET /api/v1/system/ping/:jobId
  → Queue.getJob()
  → job.getState()
  → status snapshot
```

- `jobId = requestId` — идемпотентность: повторный запрос с тем же `requestId` не создаёт
  второй job.
- `attempts: 3`, exponential backoff — transient-ошибки повторяются.
- `removeOnComplete/removeOnFail: 100` — Redis не растёт бесконечно.
- Worker закрывается по `SIGINT`/`SIGTERM` через `worker.close()`.
### SSE progress

```text
Worker job.updateProgress()
  → BullMQ QueueEvents
  → SystemEventsService.snapshots$
  → SSE GET /api/v1/system/ping/:jobId/events
  → Angular SystemStoreService
  → SystemPageComponent
```

- API сначала отдаёт текущий snapshot из `Queue.getJob`, затем live-события.
- Поток закрывается на `completed`/`failed`.
- Web использует `EventSource`; store отписывается при завершении и очищает соединение.
- `exhaustMap` не даёт запустить второй ping, пока первый активен.

## Auth (S0.3)

```text
POST /api/v1/auth/login { email, password }
  → AuthService.login()
  → UsersRepository.findByEmail()
  → PasswordService.verify() (Argon2id, @node-rs/argon2)
  → SessionsRepository.create({ tokenHash: sha256(token), expiresAt })
  → Set-Cookie kadence_session=<opaque token>; HttpOnly; SameSite=Lax; Path=/

Каждый защищённый запрос:
  SessionAuthGuard
  → readSessionToken(req) (cookie-parser)
  → AuthService.authenticate()
  → sessions ⨝ users where token_hash = sha256(token) and expires_at > now()
  → request.auth = { user, expiresAt }

POST /api/v1/auth/logout → удаляет строку sessions + чистит cookie
```

- Серверные сессии в Postgres, а не JWT: logout и отзыв устройства мгновенные, см.
  `docs/adr/0004-server-side-sessions.md`.
- В БД хранится только `sha256(token)` — дамп базы не даёт живых сессий.
- `last_seen_at` обновляется не чаще одного раза в 5 минут.
- При неизвестном email выполняется холостая проверка хеша, чтобы время ответа не выдавало
  существование аккаунта.
- Первый админ создаётся из `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, только пока
  таблица `users` пуста.
- `/system` защищён тем же guard'ом; web отправляет cookie через `withCredentials` и
  `EventSource(..., { withCredentials: true })`.

## Run state machine (S0.4a)

```text
POST /api/v1/runs { topic }
  → RunsService.create()
  → RunsRepository.createWithEvent()  (tx: insert run + run_events)
  → state DRAFT, current_stage topic_discovery

POST /api/v1/runs/:id/transitions { to, reason? }
  → allowedTransitions(from, resume_state) из @kadence/contracts
  → нет перехода → 409 CONFLICT
  → to = FAILED без reason → 400
  → tx: update runs + insert run_events
```

Разрешённые рёбра (`packages/contracts/src/run.ts`):

```text
DRAFT → RESEARCHING
RESEARCHING → SCRIPT_READY
SCRIPT_READY → VOICE_READY | RESEARCHING
VOICE_READY → VISUALS_READY | SCRIPT_READY
VISUALS_READY → RENDERING | VOICE_READY
RENDERING → REVIEW | VISUALS_READY
REVIEW → SCHEDULED | SCRIPT_READY | VOICE_READY | VISUALS_READY | RENDERING
SCHEDULED → PUBLISHING | REVIEW
PUBLISHING → PUBLISHED
любое незавершённое → FAILED (с reason)
FAILED → resume_state (только туда)
```

- Один `FAILED`, а не `FAILED_<STAGE>`: стадия живёт в `failed_stage`, точка возврата — в
  `resume_state`, см. `docs/adr/0005-run-state-machine.md`.
- Правый вектор (`REVIEW → SCRIPT_READY`, `… → VOICE_READY`) — это regeneration с выбранной
  стадии после отказа ревьюера.
- Создание run и каждый переход пишут `run_events` в той же транзакции, что и обновление
  `runs`: история не может разойтись с состоянием.
- `GET /runs` (последние 50), `GET /runs/:id` (+ история), всё под `SessionAuthGuard`.

## Packages

### `packages/contracts`

Единственный источник правды для схем, которые пересекают границы процессов:

- `health.ts` — liveness/readiness response;
- `auth.ts` — login request, session payload, user/role;
- `errors.ts` — единый error envelope;
- `system.ts` — ping job, status snapshot, enqueue request/response;
- `queues.ts` — имена очередей и jobs.

Схемы описаны Zod. API, web и worker импортируют один и тот же пакет. Пакет собирается в ESM
(`dist/index.js` + `dist/index.d.ts`), потому что NestJS 12 и Angular 22 работают в ESM.

### `apps/api`

Слои:

- `config/` — Zod-валидация env, ConfigModule;
- `auth/` — login/logout/me, `SessionAuthGuard`, Argon2id, сессии и пользователи;
- `runs/` — состояние run, переходы, история (`run_events`);
- `database/` — `pg.Pool`, Drizzle client, ping, lifecycle;
- `redis/` — `ioredis`, lazy connect, ping;
- `health/` — liveness/readiness;
- `common/` — exception filter и единый формат ошибок;
- `db/schema.ts` — Drizzle-схема;
- `drizzle/` — сгенерированные SQL-миграции и journal.

Принцип: controller → service → infrastructure. Бизнес-логики пока нет.

### `apps/worker`

- отдельный Node.js-процесс, не Nest-приложение;
- `config/env.ts` — Zod-валидация env;
- `redis-connection.ts` — BullMQ connection options из `REDIS_URL`;
- `processors/ping.processor.ts` — чистая функция обработки job;
- `main.ts` — Worker, логирование, graceful shutdown.

Worker не ходит в БД напрямую; в будущем stage-процессоры будут использовать
`DatabaseService`/repository через отдельный composition layer.

### `apps/web`

- `core/` — API base URL, нормализация ошибок;
- `features/auth/` — `api/` (login/me/logout), `data-access/` (session store),
  `pages/login-page/`, `authGuard`;
- `features/runs/` — список прогонов, карточка run'а, гейты и история переходов;
- `features/health/` — `api/` (transport), `data-access/` (store + domain helper),
  `pages/` (route page);
- `features/system/` — ping UI, SSE stream, progress store;
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

1. S1: TikTok OAuth + token vault + один приватный publish.
2. Provider ports (`LlmProvider`, `TtsProvider`, …) и cost ledger.
3. Стадийные исполнители (research/script/tts) в worker.
