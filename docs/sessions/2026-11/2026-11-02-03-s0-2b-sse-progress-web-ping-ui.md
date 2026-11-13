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

- `pnpm --filter @peertoreel/web typecheck` и `test` — успешно.
- Web tests: 12 (включая SystemApiService и SystemStoreService).
- SSE вручную: `GET /api/v1/system/ping/demo-sse-4/events` отдал `active 90` и
  `completed 100` с result.
- Браузер: `/system` → «Запустить ping» → job завершился, UI показал 100%,
  request ID, время обработки и длительность; console errors нет.
- `pnpm check` — будет финально прогнан после документации.

**Следующая сессия:** S0.3 — auth + sessions + baseline schema.
