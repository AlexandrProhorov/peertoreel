# SESSION LOG

## 2026-11-04 — M2.1b Артефакты в UI

**Цель:** увидеть произведённые файлы там же, где состояние run'а, без curl и docker.

**Сделано:**

- `RunsApiService.artifacts(id)` — `GET /runs/:id/artifacts` с Zod-валидацией.
- `RunsStoreService`: сигнал `artifacts`, загрузка через `forkJoin(run, artifacts)` внутри
  существующего `detailRequests`; ошибка списка артефактов не ломает карточку run'а
  (`catchError → []`), после перехода список обновляется вместе с run'ом.
- `data-access/artifact-labels.ts`: русские названия типов, `formatBytes`, `isVideo`,
  `isAudio`, сортировка по порядку стадий.
- Карточка run'а: блок «Артефакты (N)» — тип, стадия, размер, дата, ссылка «Открыть»;
  для `video/*` — встроенный плеер, для `audio/*` — аудиоплеер.

**Проверено в браузере:**

- Run «Как работает вакцина» (`VOICE_READY`): 4 артефакта — Сценарий (2.3 КБ), Субтитры
  (15.1 КБ), Тайминги слов (9.0 КБ), Озвучка (930.7 КБ), аудиоплеер присутствует.
- Run «Как строились пирамиды»: «Черновик видео» 32.6 МБ, `<video>` подхватил объект из S3 —
  `readyState 4`, `duration 37.5 s`, `1080×1920`.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 35, db 2, storage 3 (106 тестов).

**Наблюдения:**

- Подписанные ссылки отдаются только авторизованным (сам эндпоинт под guard'ом), живут 1 час.
- `readyState 0` сразу после рендера — нормально: метаданные подгружаются асинхронно.
- Для JSON-артефактов пока только ссылка «Открыть»; встроенный просмотр добавим, если
  понадобится (CORS у бакета сейчас не настроен, `fetch` из браузера не пройдёт).

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

## 2026-11-04 — M2.1 Storage + artifacts (слайс A)

**Цель:** превратить спайки в инфраструктуру: общий доступ к БД, S3-хранилище и реестр
артефактов, чтобы worker мог писать результаты стадий, а UI — их читать.

**Сделано:**

- Новый пакет `packages/db`: схема Drizzle переехала из `apps/api/src/db/`, добавлен
  `createDatabase(url)` (pool + drizzle), тест паритета enum'ов перенесён туда же.
- Таблица `artifacts` (`run_id`, `stage`, `type`, `object_key`, `content_type`, `size_bytes`,
  `meta`), уникальный `object_key`, индекс `(run_id, stage)`. Миграция `0004` применена.
- Новый пакет `packages/storage`: `ObjectStorage` (`put/get/delete/presignGet`) поверх
  SeaweedFS/R2 и `buildArtifactKey(runId, stage, name)`.
- API: `StorageModule` (глобальный), `ArtifactsRepository`, `RunsService.artifactsFor()`,
  `GET /api/v1/runs/:id/artifacts` — список с подписанными ссылками (1 час).
  Env получил `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY/FORCE_PATH_STYLE`.
- Worker: зависимости `@kadence/db`, `@kadence/storage`, `drizzle-orm`, `pg`; скрипт
  `src/storage-spike.ts` — загрузка файла, запись артефакта, проверка подписанной ссылки и
  roundtrip.
- ADR-0006, обновлены `AGENTS.md` (§2, §3, §8) и `ARCHITECTURE.md`.

**Проверено:**

- `storage-spike`: файл 34 216 005 байт загружен в SeaweedFS по ключу
  `runs/655c3b06…/render/draft.mp4`, строка `artifacts` записана, `presignGet` вернул
  ссылку, скачивание по ней — 200 и тот же размер, `getObject` — roundtrip ok.
- Повторный запуск: «уже записан (тот же id), объект перезаписан»; в БД по-прежнему одна
  строка и 34 216 005 байт — идемпотентность на уровне `object_key`.
- `GET /runs/:id/artifacts` с cookie: 200, один артефакт `draft_mp4`/`render`, ссылка
  отдаёт ровно 34 216 005 байт.
- `pnpm check` — зелёный: contracts 23, API 20, worker 19, web 32, db 2, storage 3 (99 тестов).

**Решения:**

- Миграции остались в `apps/api/drizzle`; worker их не применяет (см. ADR-0006).
- Артефакты пишет тот, кто произвёл файл; API только читает и подписывает ссылки.
- Локальный диск — scratch для FFmpeg, не место хранения.

**Осталось (слайс B):**

- Стадия `voiceover` в очереди: job по переходу `SCRIPT_READY → VOICE_READY`, запись
  `voiceover.mp3` + `word_timings.json` как артефактов, `provider_usage`, SSE прогресса run'а.
- Очистка объектов S3 при удалении run'а (сейчас каскад чистит только строки).

## 2026-11-04 — S0.6 Script generation (R2b): тема → скрипт → видео

**Цель:** закрыть последнее звено «под ключ» — из строки темы получить готовый MP4, без ручного
текста.

**Сделано:**

- `packages/contracts/src/script.ts`: `scriptBeat` (text, visualDirection, durationSec),
  `script` (title, hook, beats 2–12, cta), `scriptSpeechText()` (hook → beats → cta одной
  строкой для TTS), `scriptPlannedDurationSec()` (плановые оценки, не тайминги).
- `apps/worker/src/llm/deepseek.ts`: OpenAI-совместимый клиент `generateJson(schema, …)`.
  `response_format: json_object`, `thinking: disabled` (иначе модель тратит весь лимит на
  `reasoning_content` и возвращает пустой `content`), Zod-валидация, до 3 попыток на
  невалидный JSON, `LlmError` с классификацией retryable (429/5xx) и без ретраев на 401/403/402.
- `apps/worker/src/script/prompt.ts`: системный и пользовательский промпты (RU-сценарий,
  5–8 beat'ов, английские ключевые слова для стокового поиска, без кликбейта).
- `apps/worker/src/script/script-spike.ts`: тема → скрипт → озвучка (`with-timestamps`) →
  ASS-караоке → рендер.

**Проверено (реальный прогон на теме «Почему небо синее»):**

- Скрипт: 7 beat'ов, 494 символа, 399/400 токенов, 2.9 s; заголовок «Почему небо синее:
  простое объяснение», хук «Солнечный свет кажется белым, но это не так», осмысленные
  `visualDirection` (`prism splitting light into rainbow`, `sunset red orange sky`, …).
- Озвучка: 600 KB за 2.6 s, 78 слов, речь заканчивается на 37.48 s.
- Рендер: 6.4 s, MP4 1080×1920/30 fps, h264+aac, 37.5 s, 34 MB (тестовая таблица почти
  не сжимается — на реальном стоке будет кратно меньше).
- Кадр на 18.0 s: «Поэтому синий цвет как» с подсветкой «цвет» — синхрон с озвучкой.
- Громкость итогового файла: −14.62 LUFS, true peak −1.19 dBTP.
- `pnpm check` — зелёный: контракты 23, API 22, worker 19, web 32.

**Решения и наблюдения:**

- `durationSec` от LLM — только план (46 s против реальных 37.5 s). Таймлайн строится по
  character alignment от TTS, а не по оценке модели.
- Модель `deepseek-flash` — reasoning-модель: без `thinking: disabled` ответ приходит с пустым
  `content` и `finish_reason: length`. Это зафиксировано в клиенте.
- Стоимость: токены пишутся из `usage` (399/400), денег DeepSeek в ответе не отдаёт —
  в `provider_usage` будем хранить токены и считать цену по прайсу на момент вызова.

**Осталось:**

- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Визуалы: пока синтетический `testsrc2`; реальный Pixabay — стадия `visuals`.

## 2026-11-03 — S0.5 Render + TTS spike (R1 / R2a)

**Цель:** снять два главных риска — «соберём ли мы вообще вертикальное видео» и «получим ли
осмысленную озвучку с таймингами» — до начала работ по M2.

**Сделано:**

- `apps/worker/src/media/karaoke.ts` — ASS-караоке из пословных таймингов: фразы по 4 слова,
  активное слово жёлтым (`\c&H00FFFF&\b1`), холст 1080×1920, `MarginV=320` под UI платформы,
  экранирование `{}` и `\`, тайм-коды в сантисекундах.
- `apps/worker/src/media/loudnorm.ts` — двухпроходный loudnorm: разбор JSON-замера FFmpeg,
  фильтр второго прохода с `measured_*` и `linear=true`.
- `apps/worker/src/media/ffmpeg.ts` — сборка видео: `scale`+`crop` до 1080×1920, `fps=30`,
  `ass`, loudnorm, libx264/CRF 21, AAC 128k/48 kHz, `+faststart`, `-shortest`. Запуск через
  `spawn` с массивом аргументов (`shell: false`), таймаут и `FfmpegError` со stderr.
- `apps/worker/src/tts/elevenlabs.ts` — `POST /v1/text-to-speech/{voice_id}/with-timestamps`,
  Zod-валидация ответа, `TtsError` с `retryable` (429/5xx — да, 401/403/404 — нет).
- `apps/worker/src/tts/word-timings.ts` — слова из character alignment.
- Спайк-скрипты `media/render-spike.ts` (синтетические входы) и `tts/tts-spike.ts`
  (реальная озвучка → ASS → MP4 → ffprobe); запуск через `tsx`.

**Проверено:**

- R1 (синтетика): MP4 1080×1920, 30 fps, h264+aac 48 kHz, 2.70 s, 902 KB;
  −14.0 LUFS; кадр на 1.0 s — «караоке» подсвечено жёлтым, кириллица рендерится.
- R2a (ElevenLabs, `eleven_multilingual_v2` + premade-голос `Xb7hH8MSUJpSbSDYk0k2`):
  озвучка 89 KB за 791 ms, 11 слов, последнее слово кончается на 5.53 s;
  итог 1080×1920, 30 fps, 5.60 s, 1.84 MB; кадр на 2.10 s — жёлтым «воздуха», точно по
  таймингу 2.02–2.44.
- Двухпроходный loudnorm: −14.44 LUFS, true peak −1.43 dBTP (однопроходный давал −15.4).
- `pnpm check` — зелёный: контракты 18, API 22, worker 14, web 32.

**Найденные ограничения провайдера:**

- Бесплатный план ElevenLabs не даёт использовать library-голоса через API
  (`402 paid_plan_required`); premade-голоса работают. `voices_read` у ключа должен быть
  включён, иначе список голосов не читается.
- Free tier — некоммерческая лицензия, а default-голоса удаляются 31.12.2026. Для
  публикуемого контента нужен минимум Starter ($5–6/мес, 30k кредитов ≈ 30 мин TTS).
- Ключ DeepSeek в `.env` пока заглушка (401) — R2b не начат.

**Осталось:**

- R2b: генерация скрипта через DeepSeek (нужен рабочий ключ).
- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Перенести спайки в стадийные job'ы worker'а и `artifacts` — после R3.

## 2026-11-03 — S0.4b Reviewer gate UI

**Цель:** довести машину состояний до пользователя: список прогонов, карточка run'а, гейты
`SCRIPT_READY`/`REVIEW`, история переходов.

**Сделано:**

- Web `features/runs/`: `RunsApiService` (list/detail/create/transition, `withCredentials`),
  `RunsStoreService` (`switchMap` на чтение, `exhaustMap` на создание и переход, сигналы
  `runs/selected/allowed/loading/pending/error/created`), `run-labels.ts`
  (подписи состояний, стадий, действий перехода).
- `allowed` считается той же функцией `allowedTransitions` из контрактов, что и на сервере:
  UI физически не может предложить запрещённое ребро.
- Страницы: `/runs` — форма создания + список с бейджами; `/runs/:id` — состояние, стадия,
  карточка ошибки (`failed_stage` + причина + подсказка про повтор), кнопки переходов,
  обязательный комментарий для `FAILED`, история `run_events`.
- Роут `runs` под `authGuard`, ссылка «Прогоны» в shell.
- Найдено и исправлено на ревью: форма создания была без `[formGroup]`, поэтому `(ngSubmit)`
  не срабатывал и браузер делал нативный submit (перезагрузка страницы, run не создавался).
  Форма переведена на `NonNullableFormBuilder` + `formGroup`/`formControlName`.

**Проверено:**

- `pnpm --filter @kadence/web typecheck` и `test` — успешно, web 32 теста (было 21).
- Браузер, авторизованной сессией:
  - `/runs` показывает список (включая созданные через API) и форму;
  - создание из UI → `201`, редирект на `/runs/:id`;
  - `Начать исследование` → Исследование, `Принять бриф` → Сценарий готов,
    `Утвердить сценарий` → Озвучка готова (гейт работает);
  - `Остановить с ошибкой` без комментария → сообщение «укажите причину», запроса нет;
  - с комментарием `ElevenLabs 429` → FAILED, карточка «Стадия Озвучка остановлена»,
    доступна только кнопка «Повторить стадию»;
  - «Повторить стадию» → Озвучка готова, история 6 записей, console errors — 0.
- `pnpm check` — зелёный: контракты 18, API 22, worker 2, web 32; initial bundle 320 kB.

**Осталось:**

- Vite-прекеш: после добавления новых экспортов в `@kadence/contracts` дев-сервер web нужно
  перезапускать с очисткой `apps/web/.angular/cache`, иначе `does not provide an export named …`.
- Нет пагинации/фильтров, нет автоперезагрузки списка, нет optimistic-обновления.

**Следующая сессия:** S1 — publish risk spike (TikTok private publish + manual export).

## 2026-11-03 — S0.4a Run state machine (API)

**Цель:** первые бизнес-таблицы после auth и серверно-проверяемая машина состояний run'а
с историей переходов.

**Сделано:**

- `packages/contracts/src/run.ts`: стадии (8), состояния (11), таблица разрешённых переходов,
  `canTransition`, `stageForState`, схемы `run`, `runDetail`, `runEvent`, `createRun`,
  `transitionRun`. Таблица переходов — единственный источник правды и для API, и для будущего UI.
- Drizzle: enum `run_state`, `run_stage`; `runs` (`created_by` → users, topic, state,
  current/failed stage, failure_reason, resume_state) и `run_events`
  (from/to, stage, reason, append-only). Миграция `0003_nostalgic_korvac.sql` применена.
- API `runs/`: `RunsRepository` (создание и каждый переход — одна транзакция с записью
  события), `RunsService` (валидация перехода, `409` на запрещённое ребро, `400` на
  `FAILED` без причины), `RunsController` под `SessionAuthGuard`.
- Endpoints: `POST /runs`, `GET /runs` (50 последних), `GET /runs/:id` (+ история),
  `POST /runs/:id/transitions`.
- `FAILED` один на все стадии: `failed_stage` + `failure_reason` + `resume_state`;
  retry — обычный переход `FAILED → resume_state`. ADR-0005, `AGENTS.md` §4/§5/§9 обновлены.
- Enum'ы в `schema.ts` продублированы литералами (drizzle-kit грузит схему через CJS и не
  видит ESM-only contracts); `schema.spec.ts` падает при расхождении со схемами контрактов.

**Проверено:**

- Тесты: контракты 18 (было 12), API 22 (было 13), worker 2, web 21; `pnpm check` зелёный.
- `pnpm db:migrate` применил `0003`; в БД появились `runs`, `run_events`, enum'ы.
- curl-сценарий на живом API (с cookie):
  - `POST /runs` → `201`, `state: DRAFT`, `currentStage: topic_discovery`;
  - `DRAFT → RESEARCHING` → `200`, `currentStage: research`;
  - `RESEARCHING → REVIEW` → `409 CONFLICT`;
  - `RESEARCHING → FAILED` без причины → `400`;
  - `RESEARCHING → FAILED` с причиной → `failedStage: research`, `resumeState: RESEARCHING`;
  - `FAILED → DRAFT` → `409`; `FAILED → RESEARCHING` → `200`, поля ошибки очищены;
  - `GET /runs` без cookie → `401`; `GET /runs/not-a-uuid` → `400`.
- В БД: `run_events` содержит создание (`null → DRAFT`), оба перехода и retry; тема сохранена
  как 17 символов (UTF-8 без искажений).

**Осталось (S0.4b):**

- Web: список run'ов, карточка с историей, кнопки разрешённых переходов, гейты
  `SCRIPT_READY` и `REVIEW` с комментарием.
- Нет `run_stages`/`artifacts` — появятся со стадийными исполнителями (S1).
- Нет пагинации и фильтров по состоянию: 50 последних достаточно для M0.

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
