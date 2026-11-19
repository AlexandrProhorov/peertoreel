## 2026-11-11 - M3.5.1a: episode-режим — контракты, БД и выбор стадии

**Статус:** DONE (подслайс к тестам). Ветка `feat/m3-5-1a-episode-contracts-stages` от
`feat/m3-animated-factory`. План: `docs/workspace/plans/2026-11-11-m3-5-1a-episode-contracts-stages-session.md`.
Родительский план — `2026-11-11-m3-5-1-episode-in-ui-session.md`; воркер, API `/storyboard`
и UI-превью остаются за границей слайса.

### «Текущее → требуемое»

| Область | Было | Стало |
| --- | --- | --- |
| Режим run'а | Только pipeline; в `runs` нет режима | `RUN_MODES = ['pipeline','episode']`, `runModeSchema`, `runs.mode` (`run_mode`, default `'pipeline'`), `mode` в `Run`/`RunDetail`, `CreateRunRequestInput` с опциональным `mode` |
| Стадии | 8 pipeline-стадий | + `episode_plan` (`DRAFT → SCRIPT_READY`) и `episode_render` (`SCRIPT_READY → REVIEW`) в `RUN_STAGES`, очередях, required/produced state |
| State machine | Один набор рёбер на все run'ы | `EPISODE_TRANSITIONS`; mode-aware `allowedTransitions`/`canTransition`; pipeline не получает episode-рёбер и наоборот |
| `currentStage` | Всегда по pipeline-таблице | `stageForState(state, mode?)`; episode-состояния указывают на `episode_plan`/`episode_render`, публикация — на `publish` |
| Выбор стадии | `STAGE_FOR_STATE` в UI и store | `stageForRun(state, mode?)`; `stageForProgress(state, mode?)` возвращает `episode_render` на `RENDERING` |
| Запуск стадии | Проверялся только required state | `STAGE_MODES` guard: episode-стадия на pipeline-run (и наоборот) → 409 до постановки в очередь |
| API | `POST /runs` без режима, `RunRecord` без mode | `mode` в insert/select/response, `create` учитывает режим |
| Web | Store и метки знали только pipeline | Store читает `run.mode` в `stageToRun`, `allowed`, rehydration; метки/подсказки episode-стадий; stage-owned переходы скрыты |
| БД | `run_stage` из 8 значений | Миграция `0009`: enum `run_mode`, два `ADD VALUE`, `runs.mode NOT NULL DEFAULT 'pipeline'` |

### Проверено

- `pnpm check` — зелёный: lint, typecheck, build; 697 тестов во всех пакетах
  (contracts 161, db 18, api 71, web 126, worker 121, render-worker 103, assets 60,
  tiktok 28, storage 9). Новые тесты: episode-рёбра и default mode в contracts, parity
  `run_mode` в db, mode-guard и episode-переходы в API, episode-стадии в web-store.
- `pnpm db:migrate` применён на локальном Postgres; `psql` подтверждает `runs.mode`
  `NOT NULL DEFAULT 'pipeline'` и 10 значений `run_stage`.
- Pipeline-путь не изменился: старые тесты стадий, API и worker зелёные без правок логики.

### Не проверено

- Реальный episode-прогон: процессоров `episode_plan`/`episode_render` ещё нет, job
  останется в очереди. Chrome, Google TTS, Pixabay и DeepSeek не вызывались.
- UI-превью раскадровки, чекбокс режима и `/runs/:id/storyboard` — следующий слайс.
- E2E через живой API с авторизацией не запускался.

### Теория

- Режим — это свойство run'а, а не флаг в UI: один раз сохранили в БД, и API, воркер и
  страница читают один источник истины. Иначе UI и очередь расходятся после перезагрузки.
- Стадии — это не только имена очередей. `STAGE_REQUIRED_STATE` отвечает «можно ли»,
  `STAGE_PRODUCED_STATE` — «куда придём», `STAGE_MODES` — «чей это путь». Три разные
  проверки, и все три нужны до постановки job'а.
- `STAGE_FOR_STATE` описывает следующий шаг, `stageForProgress` — уже запущенный. Для этого
  они и разделены: `RENDERING` не стартовая точка, но именно в нём висит прогресс.
- Промежуточные состояния (`RENDERING`) остаются общими для обоих режимов; различается
  только то, какая стадия их создала и какую job'у опрашивать.
- Mode-aware функция с дефолтом `pipeline` — аддитивное расширение: старые вызовы
  компилируются и ведут себя как раньше, поэтому миграцию можно катить по частям.
- Enum-значения в Postgres добавляются, но не удаляются; `ADD VALUE` в drizzle-миграции
  безопасен, пока та же транзакция не использует новое значение.
- Тест на guard стадии ловит класс ошибок, который не виден типам: правильное состояние
  run'а при неправильном режиме всё равно отправило бы job в очередь без воркера.
- Default в Zod-схеме — это часть контракта API: клиент без `mode` остаётся на старом
  пути, а episode включается только явным запросом.

