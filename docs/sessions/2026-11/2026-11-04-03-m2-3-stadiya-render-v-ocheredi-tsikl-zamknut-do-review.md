## 2026-11-04 — M2.3 Стадия `render` в очереди (цикл замкнут до REVIEW)

**Цель:** собрать черновик видео из уже готовых артефактов на воркере, а не руками.

**Сделано:**

- Контракты: очередь `render`, `STAGE_REQUIRED_STATE.render = VISUALS_READY`,
  `STAGE_PRODUCED_STATE.render = REVIEW`, `STAGE_FOR_STATE.VISUALS_READY = 'render'`.
- `apps/worker/src/stages/render.processor.ts`: читает `voiceover_mp3` и `word_timings` из S3,
  заново собирает ASS из таймингов (чтобы пересборка всегда совпадала со звуком), генерирует
  фоновый клип `testsrc2` по длине речи, зовёт `renderDraft` (1080×1920, 30 fps, loudnorm
  двумя проходами), грузит `draft.mp4` в S3, пишет артефакт и переводит
  `VISUALS_READY → RENDERING → REVIEW`. Временный каталог удаляется в `finally`.
- UI: кнопка «Сборка черновика» из состояния «Визуалы готовы»; карточка стадии остаётся
  видимой во время выполнения (новый сигнал `activeStage`) даже когда состояние уже
  `RENDERING`.

**Найдено и исправлено по ходу:**

1. **Повторный запуск возвращал старый job.** `jobId` детерминирован (`render-<runId>`),
   поэтому `Queue.add` с тем же id отдавал уже упавший job, и стадия не выполнялась.
   Исправление: `StagesQueue.enqueue` удаляет существующий job, если он в `completed`/`failed`.
2. **`resume_state` указывал на промежуточное состояние.** Стадия переводит run в
   `RENDERING` до рендера, поэтому падение (ENOENT FFmpeg) сохраняло `resume_state = RENDERING`,
   и «Повторить стадию» возвращало в состояние, из которого стадия не запускается.
   Исправление: `failRun` принимает `resumeState` и получает `STAGE_REQUIRED_STATE[stage]`.
3. **Воркер не видел FFmpeg.** У процесса не было его в `PATH`. Добавил в `.env`
   `FFMPEG_BIN`/`FFPROBE_BIN` абсолютными путями и переменные в `.env.example`.

**Проверено (run «Как работает вакцина», 59 с озвучки):**

- Первый запуск упал на `spawn ffmpeg ENOENT` → UI показал `FAILED` со стадией «Рендер» и
  причиной, `resume_state = VISUALS_READY` — путь ошибки отработал как задумано.
- После фиксов: «Повторить стадию» → `VISUALS_READY` → «Запустить» → прогресс 0 → 25 → 40 →
  `REVIEW`. Артефакт `draft_mp4` 51.5 МБ, `<video>` в карточке: `1080×1920`, `59.5 s`,
  `readyState 4`.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Осталось:**

- Визуалы (Pixabay) — сейчас фон синтетический `testsrc2`, отсюда и 51 МБ на минуту.
- `provider_usage` и SSE прогресса вместо опроса.
- Очистка объектов S3 при удалении run'а.

