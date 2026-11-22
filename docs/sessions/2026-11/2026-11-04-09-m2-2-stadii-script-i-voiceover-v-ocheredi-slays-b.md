## 2026-11-04 — M2.2 Стадии `script` и `voiceover` в очереди (слайс B)

**Цель:** первые настоящие стадии пайплайна: не `tsx`, а job'ы в BullMQ, с артефактами
в S3, переходами run'а и классификацией ошибок.

**Сделано:**

- Контракты `stages.ts`: `STAGE_QUEUES`/`STAGE_JOB_NAMES` (`script`, `voiceover`),
  `STAGE_REQUIRED_STATE`/`STAGE_PRODUCED_STATE`, `stageJobId()`, схемы job data/result/
  snapshot и `stageQueueNameSchema`.
- Worker: `stages/transition.ts` (`loadRun`, `transitionRun` в транзакции с `run_events`,
  `failRun` с `resume_state`), `stages/save-artifact.ts` (upsert по `object_key`),
  процессоры `script.processor.ts` (LLM → `script_json` → `SCRIPT_READY`) и
  `voiceover.processor.ts` (TTS → mp3 + word timings + ASS → `VOICE_READY`).
- `main.ts`: три воркера (system, script ×2, voiceover ×1), общий `StageDeps` (db, storage,
  env, logger), помечание run'а `FAILED` только на последней попытке.
- Worker env: `DATABASE_URL`, `S3_*`, `FFMPEG_BIN`, ключи провайдеров (опциональны при
  старте — стадия падает с понятным сообщением, если ключа нет).
- API: `StagesQueue` (очередь на стадию), `StagesService` (проверка состояния перед
  запуском), `POST /runs/:id/stages/:stage` (202) и `GET /runs/:id/stages/:stage/job`
  (статус, прогресс, результат, причина падения).

**Проверено (живой прогон, run «Как работает вакцина»):**

- `POST /runs/:id/stages/script` → job `script-<runId>`, прогресс 10 → 100, результат
  `SCRIPT_READY` и артефакт `script_json` (2393 байта) в S3.
- `POST /runs/:id/stages/voiceover` → `VOICE_READY`, три артефакта: `voiceover_mp3`
  952 990 байт, `word_timings` 9211 байт, `subtitles_ass` 15 463 байта.
- `GET /runs/:id` — история: `DRAFT → RESEARCHING → SCRIPT_READY → VOICE_READY` с
  правильными стадиями; `GET /runs/:id/artifacts` — 4 артефакта, ссылка на mp3
  скачивается (200, 952 990 байт), `ffprobe`: 59.49 s, 128 kbps.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 32, db 2, storage 3 (103 теста).

**Найденные грабли:**

- BullMQ запрещает `:` в кастомном `jobId` — первый вариант `script:<runId>` дал 500;
  формат заменён на `script-<runId>`, тест это фиксирует.
- `tsx watch` и `nest start --watch` не перезапускаются при изменении `packages/contracts`
  в `dist` — после правки контрактов нужно тронуть файл в `src` приложения.

**Осталось:**

- `provider_usage` (стоимость вызовов) и SSE прогресса стадий для UI.
- Стадия `render` в очереди и кнопки запуска стадий в web.
- Очистка объектов S3 при удалении run'а.

