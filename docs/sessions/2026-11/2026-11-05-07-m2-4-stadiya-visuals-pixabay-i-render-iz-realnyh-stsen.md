## 2026-11-05 — M2.4 Стадия `visuals` (Pixabay) и render из реальных сцен

**Цель:** закрыть M2.4: `VOICE_READY → VISUALS_READY`, Pixabay за портом `StockProvider`,
кеш 24 ч, реальные тайминги сцен, `visuals_json`, render из стоковых сцен и fallback на
`testsrc2` для старых run'ов.

**Сделано:**

- Контракты: `visuals` добавлен в очереди, `STAGE_REQUIRED_STATE`/`STAGE_PRODUCED_STATE`/
  `STAGE_OF_QUEUE`/`STAGE_FOR_STATE`; `stageQueueNameSchema` теперь выводится из
  `STAGE_QUEUES`; `VOICE_READY → visuals` даёт кнопку и гидрацию прогресса без изменений
  в web-архитектуре.
- Новый `packages/contracts/src/visuals.ts`: `StockProvider`, `StockAsset`,
  `StockSearchRequest`, `VisualScene`, `VisualsArtifact` и Zod-схемы сценария/манифеста.
  `ARTIFACT_TYPES` дополнен `visuals_json`, `visual_clip`, `visual_image`.
- `apps/worker/src/visuals/beat-timings.ts`: hook → beats → CTA по `word_timings`
  (нормализация регистра/пунктуации), непрерывные границы сцен; при расхождении —
  плановый fallback (hook 3 с, beat `durationSec`, CTA 3 с, масштаб на реальный конец
  аудио). Пустой alignment — ошибка стадии.
- `apps/worker/src/stock/`: Pixabay-провайдер, Redis-кеш поиска 24 ч, in-process
  sliding-window limiter 100/60 с, классификация ошибок, лимиты скачивания (видео 50 МБ,
  фото 15 МБ), проверка `content-type`, timeout/abort. `ioredis` добавлен прямой
  зависимостью worker'а.
- `apps/worker/src/stages/visuals.processor.ts`: сцены `beats + 2`, видео приоритетом, фото
  как fallback, только выбранный ассет в S3, детерминированные ключи
  `runs/<runId>/visuals/scene-<idx>`, `visuals_json`, удаление устаревших сцен, progress
  10 → 80 → 90 → 100. Повторный запуск идемпотентен.
- Worker `main.ts`: очередь `visuals` с `concurrency: 1`, Redis-кеш Pixabay, graceful
  shutdown кеша; общая обёртка превращает терминальные ошибки провайдеров
  (`retryable: false`) в `UnrecoverableError`; `handleFinalFailure` помечает run `FAILED`
  сразу на такой ошибке.
- `apps/worker/src/media/visual-track.ts`: беззвучные сегменты 1080×1920/30 fps, видео
  `-stream_loop -1` + `-t`, фото `-loop 1`, fallback `testsrc2`, concat demuxer.
  `render.processor.ts` передаёт `visuals.mp4` в `renderDraft`; без `visuals_json`
  сохраняется старый `testsrc2`. `meta.background` — `visuals` или `fallback_testsrc2`,
  плюс `visualSources`.
- Web: `stageTitle`/`stageHint` для visuals, подписи артефактов, store-тест
  `VOICE_READY → visuals` и гидрации. Новых страниц/сторов нет.
- Документация: `docs/adr/0008-visuals-stock-provider.md`, `AGENTS.md` §3/§4/§5/§6/§9,
  `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 61, worker 67, API 23
  (192 теста), build web/API/worker проходит.
- Живой e2e на существующем run `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47`
  («почему у собак мокрый нос»):
  - `REVIEW → VOICE_READY → VISUALS_READY`: 8 сцен, все 8 — Pixabay video; манифест 5839
    байт, `providerRequests=14`, `cacheHits=2`; 8 артефактов `visual_clip`.
  - Повторный запуск visuals: по-прежнему 8 `visual_clip` и 8 уникальных `object_key`,
    один `visuals_json` — дублей нет.
  - Render: job completed, run вернулся в `REVIEW`; `draft.mp4` 28 095 425 байт,
    `ffprobe`: 1080×1920, 30 fps, h264+aac, 51.7 с; в `artifacts.meta` —
    `background: visuals`, 8 `visualSources`.
  - Старый `draft_mp4` перезаписан по тому же ключу; лишних строк/объектов нет.
- `PIXABAY_API_KEY` был в локальном `.env`; реальные вызовы Pixabay выполнены, ключ не
  логировался и в артефакты не попадал.

**Ограничение ручной проверки:** живой click-through в браузере не выполнялся, чтобы не
передавать пароль/сессионную cookie через инструменты. Кнопка/гидрация покрыты
`run-detail-store.service.spec.ts`, web build/typecheck зелёные. Пользователь может
визуально проверить карточку `/runs/:id` при следующем заходе.

**Осталось:**

- Полный `provider_usage`/cost ledger — отдельный milestone, сейчас в `visuals_json` только
  реальные счётчики запросов и кеша.
- Таблица `scenes` — только когда review UI начнёт запрашивать отдельные сцены.
- Проверка качества подбора Pixabay на нескольких темах (сейчас проверена одна тема).
- SSE прогресса стадий вместо polling — по-прежнему M3-кандидат.

