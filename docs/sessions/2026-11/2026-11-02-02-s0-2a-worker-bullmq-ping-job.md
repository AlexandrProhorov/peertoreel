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

