## 2026-11-04 — Рефакторинг web data layer (ADR-0007)

**Цель:** убрать дублирование в сторах и api-сервисах, разделить состояние списка и одного
run'а, починить потерю прогресса стадии при навигации.

**Сделано:**

- `core/api/base-api.service.ts`: `BaseApiService` — base URL, `withCredentials`, валидация
  ответа через структурный `ResponseSchema<T>` (без зависимости web от `zod`).
- `core/state/base-store.ts`: `BaseStore` — счётчики `loading`/`pending`, нормализация
  ошибок, `query(source)` для отменяемых чтений и `command(key, factory)` для одноразовых
  мутаций с дедупликацией. Relative id встроен в тот же класс (`setRelativeId`).
- Все api-сервисы переведены на `BaseApiService`; `startStage` теперь валидирует ответ через
  `enqueueStageResponseSchema`.
- `health` → `system` → `auth` переведены на `BaseStore`. `AuthStore.login` использует
  `pending` (login-страница обновлена), `restore()` получил `shareReplay`, чтобы guard и
  страница действительно делили один `/auth/me`.
- `RunsStoreService` удалён. Вместо него:
  - `RunsListStoreService` — scoped на роут `''`, создание run возвращает `Promise<Run | null>`;
  - `RunDetailStoreService` — scoped на роут `:id`, `setRelativeId`, detail + artifacts,
    переходы и наблюдение за стадией.
- Прогресс стадии восстанавливается с сервера при открытии run'а: `stageForProgress(run.state)`
  → `GET /runs/:id/stages/:stage/job`, `queued/active` продолжают polling, `404` — это «job'ы
  нет», `completed/failed` обновляют run один раз без повторной гидрации.
- Удалены `clearCreated()`, `clearStageJob()`, `created`-сигнал, `OnDestroy` и `loadedId`
  из страниц. Остался один `effect` в `RunPageComponent` — привязка route id к `setRelativeId`.
- В `packages/contracts` добавлен `stageForProgress` (+ тест): `RENDERING → render`, потому
  что render переводит run в `RENDERING` до завершения FFmpeg.
- `apps/web/tsconfig.json`: включены `strict` и `noUncheckedIndexedAccess`.
- `toErrorMessage`: `ZodError` больше не показывает в UI простыню JSON; добавлен
  `isHttpStatus` для ожидаемого 404.
- `/health/ready` проверяет не только Postgres/Redis, но и наличие BullMQ worker'а:
  `SystemQueue.getWorkersCount()` → `checks.worker: 'up' | 'down'`. Нет worker'а — readiness
  возвращает 503 и `status: degraded`. На странице «Состояние системы» появилась карточка
  Worker (`Подключён` / `Недоступен`).
- Документация: `docs/adr/0007-web-data-layer.md`, §8/§9 `AGENTS.md`, `apps/web/README.md`.

**Найдено и исправлено по ходу:**

1. Разделения сторов было недостаточно: root-store продолжал поллить стадию, пока страница
   чистила UI через `ngOnDestroy`. Решение — scoped store + гидрация с сервера, а не кэш
   инстансов.
2. `STAGE_FOR_STATE` не покрывает `RENDERING`, поэтому после F5 прогресс рендера исчезал.
   Добавлен отдельный контрактный helper, не смешивающий «что можно запустить» и «что уже
   выполняется».
3. Терминальный снапшот может прийти раньше, чем воркер запишет `FAILED`/следующее состояние.
   Стор делает один `reload()` без повторного наблюдения и сохраняет причину падения в `error`.
4. `defaultIfEmpty` должен стоять после `takeUntilDestroyed`, иначе отмена команды при
   уничтожении стора превращалась в `EmptyError`; добавлен тест.
5. `RunsStoreService.created` был причиной редирект-петли; теперь навигация живёт в `.then`
   промиса `create()`, а не в эффекте на глобальном сигнале.

**Проверено:**

- `pnpm --filter @peertoreel/contracts build` + `test` — 29 тестов.
- `pnpm --filter @peertoreel/api test` — 21 тест (включая readiness с worker down).
- `pnpm --filter @peertoreel/web typecheck` — без ошибок.
- `pnpm --filter @peertoreel/web test` — 12 файлов, 60 тестов.
- `pnpm --filter @peertoreel/web lint` и `build` — без ошибок; initial bundle 323.34 kB raw /
  ~90.6 kB transfer (production build).
- `GET /api/v1/health/ready` при живом worker'е — 200,
  `checks: { database: 'up', redis: 'up', worker: 'up' }`.
- `pnpm check` — зелёный: contracts 29, storage 3, db 2, web 60, worker 19, API 21 (134 теста).

**По ходу ручной проверки (после рефакторинга):**

- Ping завис в `queued`, SSE отдавал `queued 0`, потому что dev-воркер (`tsx watch`) остался
  без дочернего процесса — вероятно, после пересборки `@peertoreel/contracts`. В Redis
  `bull:system:wait` было 3 job'а, `bull:system:active` — 0.
- После перезапуска watcher'а (`touch apps/worker/src/main.ts` или рестарт `pnpm dev`) воркер
  забрал очередь; ping прошёл `10 → 50 → 90 → 100 → completed`, SSE отдал те же снапшоты.
- Это не дефект web-слоя: `queued 0` — корректный начальный снапшот, пока job никто не
  потребляет. После `pnpm check`/пересборки contracts нужно проверять, что worker жив.

**Осталось:**

- SSE для прогресса run'а вместо polling (M2), `rxResource` для detail-экрана — кандидат M3.
- M2.4 — стадия `visuals` (Pixabay) вместо синтетического фона.

