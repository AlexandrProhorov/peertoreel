# SESSION LOG

## 2026-11-12 — fix: `The chunk size is invalid` на TikTok `video/init`

**Статус:** DONE. Причина: `planChunks()` для файлов 10–20 МБ объявлял
`chunk_size = 10 000 000`, но `total_chunk_count = 1`; TikTok отклоняет такой init, даже
если последний чанк формально может быть больше `chunk_size`. Наш `draft.mp4` 13 320 534
байт попадал ровно в этот диапазон.

**Изменение:** при `total_chunk_count === 1` план теперь отдаёт `chunk_size = video_size`
и один чанк на весь файл. Многoчанковые загрузки >20 МБ не изменились. Причина и правило
зафиксированы в `packages/tiktok/AGENTS.md`.

**Проверено:** `packages/tiktok` 30 тестов (регрессия на 13 320 534 байт и границу
20 МБ), worker 145 тестов; `pnpm check` — зелёный. Живой повторный publish не выполнялся:
исправление проверено на плане чанков, без реального поста.

## 2026-11-11 — M3.5.1c: episode в UI — превью, режим при создании и ревью

**Статус:** DONE. Ветка `feat/m3-5-1` (M3.5.1a/b уже в ней), подветок нет. План:
`docs/workspace/plans/2026-11-11-m3-5-1c-episode-ui-session.md`.

### «Текущее → требуемое»

| Область | Было | Стало |
| --- | --- | --- |
| Контракты | `storyboardSchema`, `episodeVisualsArtifactSchema`, `episodeManifestSchema` по отдельности | `runStoryboardResponseSchema`/`RunStoryboardResponse` — один типизированный ответ превью |
| API | Нет способа прочитать план эпизода | `GET /runs/:id/storyboard` → `{ storyboard, visuals, manifest }`; нет плана → 404 |
| Publish card | Заголовок только из `script_json` | Episode-run берёт `episode_manifest.title`, pipeline остаётся на `script_json` |
| Worker: subjects | Один запрос на слот: теги или описание | Упорядоченные запросы на слот: теги стартового ключа → `scene.description` (`lang: ru`) |
| Worker: visuals | Первый пустой ответ = Tier 0 | Пробует запросы по порядку, учитывает каждый вызов, Tier 0 только если все пусты/не скачались |
| Web API | `create(topic)`, нет storyboard | `create(topic, mode)`, `storyboard(id)` через `runStoryboardResponseSchema` |
| Web stores | Только run detail/list | Scoped `EpisodeStore`: `setRelativeId`, `storyboard`, `loading`, `error`, `reload` |
| Runs page | Только тема | Чекбокс «Дешёвый эпизод», бейдж «Эпизод» в списке |
| Run page, DRAFT episode | Общая карточка стадии | Карточка «Эпизод» с кнопкой «Сгенерировать эпизод» и прогрессом `episode_plan` |
| Run page, SCRIPT_READY episode | Превью не было | Сцены: текст, часть, рецепт/вариант, миниатюра Pixabay или бейдж «Tier 0»; ошибка превью не блокирует рендер |
| Run page, REVIEW episode | «Одобрить» требовал `qc_report` | Одобрение без QC + бейдж «QC не запускался»; «Вернуться к сценарию» доступна |
| Pipeline | QC-гейт и кнопки | Не меняются: без QC одобрение по-прежнему недоступно |

### Проверено

- `pnpm check` — зелёный (lint, typecheck, test, build); 743 теста: contracts 164, db 18,
  storage 9, api 74, worker 145, render-worker 105, assets 60, tiktok 28, web 140. Новые
  тесты: `runStoryboardResponseSchema`, `/runs/:id/storyboard` (200/404), заголовок
  publish-card из манифеста, Pixabay «теги → описание» и лимит двух запросов, `EpisodeStore`
  (успех/ошибка/смена id/reload/stale), `create(topic, mode)`, QC-гейт episode vs pipeline,
  подписи рецептов.
- Живой episode-прогон через API на локальном стеке (run `15369af6-1918-4963-9c28-c29be859a1ba`,
  тема «Почему у собак мокрый нос?»): `episode_plan` → `SCRIPT_READY`; 6 сцен, 5 картинок
  Pixabay, `skipped: 0`, `providerRequests: 6`, `cacheHits: 0` (все слоты нашлись по тегам
  стартового ключа, fallback по описанию не понадобился). `GET /runs/:id/storyboard` вернул
  `{ storyboard, visuals, manifest }` с заголовком манифеста.
- `episode_render` → `REVIEW`; `draft_mp4` 13 320 534 байт. `ffprobe`: h264, 1080×1920,
  `yuv420p`, `bt709` (space/primaries/transfer), 30/1, AAC. Loudnorm: `input_i = -14.20`,
  `input_tp = -1.46`.
- `GET /runs/:id/qc` на episode-run → 404; `REVIEW → SCHEDULED` прошёл без `qc_report`;
  publish card создан с заголовком из `episode_manifest` (совпал строкой с манифестом),
  хэштеги из темы; `SCHEDULED → REVIEW` вернул run на ревью.
- Web build без предупреждения о бюджете стилей: превью вынесено в отдельный
  `EpisodePreviewComponent`, у run-page и превью свои 5 kB-бюджеты.

### Не проверено

- Живой fallback «теги пусты → `scene.description` (`lang: ru`)»: в прогоне все subject-слоты
  закрылись по тегам; сценарий покрыт unit-тестами с fake `StockProvider`.
- Ручной клик по UI в браузере: проверены API-пути, `ng build`, typecheck и unit-тесты;
  dev-сервер запущен, но визуальный проход по чекбоксу/превью/кнопкам не выполнялся.
- Визуальное качество картинок и озвучки (релевантность Pixabay, Google TTS) — не оценивалось.
- Живой pipeline-прогон после изменений: QC-гейт pipeline проверен unit-тестом
  `canApproveReview`, полный pipeline-run в этой сессии не запускался.
- Повторный запуск `episode_plan` при уже готовых артефактах в состоянии `DRAFT` (retry после
  сбоя перехода) — только unit-тест идемпотентности, живого retry не было.

### Теория

- Один API-ответ лучше трёх запросов к S3: `runStoryboardResponseSchema` делает контракт
  превью явным и не даёт UI молча проглотить отсутствие `visuals`/`manifest`.
- Два слоя картинок должны оставаться раздельными: Pixabay-картинка живёт data URI в
  `episode_visuals_json`, а renderer получает её через `--assets`; библиотека ассетов сюда не
  протекает.
- Fallback-запрос — это политика, а не провайдер: «теги → описание» живёт в `subjects.ts`,
  а `visuals.ts` только перебирает готовый список, поэтому лимит в два запроса проверяется
  без сети.
- Счётчики `providerRequests`/`cacheHits` нужно увеличивать до проверки результата: неудачный
  download — тоже реальный вызов, иначе манифест занижает расход.
- QC-исключение живёт в одном предикате (`canApproveReview`), а не в шаблоне: иначе pipeline
  и episode легко разъедутся, когда гейт снова изменится.
- Scoped-стор для превью — это ещё и управление памятью: data URI на несколько мегабайт
  умирают вместе с маршрутом, а не висят в root-синглтоне.
- Превью и рендер — независимые пути: ошибка загрузки storyboard не должна блокировать
  кнопку стадии, иначе один сломанный GET останавливает весь эпизод.
- Режим run'а должен читаться везде, где принимается решение: бейдж, подпись кнопки, гейт
  ревью и выбор стадии — иначе episode-прогон выглядит как сломанный pipeline.
- Idempotency на уровне состояния дешевле повторной проверки артефактов: `REVIEW` уже
  доказывает, что рендер завершён, а `SCRIPT_READY` — что план готов.

## 2026-11-11 — M3.5.1b: episode-режим в воркере и `--assets` в рендерере

**Статус:** DONE. Ветка `feat/m3-5-1b-episode-worker` от `feat/m3-5-1` (M3.5.1a). План:
`docs/workspace/plans/2026-11-11-m3-5-1b-episode-worker-session.md`. Parent:
`2026-11-11-m3-5-1-episode-in-ui-session.md`; API `/storyboard` и UI-превью — M3.5.1c.

### «Текущее → требуемое»

| Область | Было | Стало |
| --- | --- | --- |
| Контракты | Episode-стадии без артефактов | `episodeVisualsArtifactSchema`, `episodeManifestSchema`, типы `episode_visuals_json`/`episode_manifest` |
| Очереди | Стадии `episode_plan`/`episode_render` без воркеров | Оба processor'а зарегистрированы в `main.ts` (concurrency 1), финальные ошибки → `FAILED` |
| Планирование | Только CLI-спайк | `episode/plan.processor.ts`: DeepSeek → Google TTS → `buildStoryboardFromDraft` → Pixabay subject-слоты → 6 артефактов → `SCRIPT_READY` |
| Рендер | Только pipeline `render` | `episode/render.processor.ts`: subprocess `render-storyboard`, concat, loudnorm + ASS, `draft_mp4`, инвалидация QC, `REVIEW` |
| `transitionRun` | `currentStage` всегда по pipeline-таблице | Читает `runs.mode` и использует mode-aware `canTransition`/`stageForState` |
| Renderer CLI | Ассеты только через resolver | `--assets <map.json>`: валидирует `ResolvedAssetMap`, инжектированные URL побеждают Tier 0, в манифесте `assets.injected` |
| TTS-ошибки | `GoogleTtsError` без классификации | `retryable` по статусу: 401/403/200-битый ответ → `UnrecoverableError`, 429/5xx → retry |
| Идемпотентность | Не было | Manifest + все артефакты с тем же topic → только переход в `SCRIPT_READY`, без LLM/TTS/Pixabay |

### Проверено

- `pnpm check` — зелёный; 721 тест (contracts 163, db 18, api 71, web 126, worker 141,
  render-worker 105, assets 60, tiktok 28, storage 9). Новые тесты: схемы episode-артефактов,
  сбор subject-слотов, Pixabay (кэш/ошибки/размер), оба процессора (план, идемпотентность,
  ключи, режим, рендер, Chrome, QC-invalidation), инъекция `--assets`.
- Реальный CLI-смоук: `render-storyboard --scene 0 --assets <map>` на `recipe-showcase.json`
  отрендерил сцену за 20.3 с; манифест: `assets.injected: 1`, `assets.resolutions` содержит
  только неинжектированный `scent-wave(starter)`. Карта валидируется, BOM-файл отвергается.
- Unit-тесты не запускают Chrome и не ходят в сеть: LLM/TTS/Pixabay/Render CLI замоканы.

### Не проверено

- Полный episode-прогон через API/UI: создание episode-run и кнопки появятся в M3.5.1c;
  живой DeepSeek/Google TTS/Pixabay-вызов из процессора не выполнялся.
- Сборка полного эпизода (все сцены + concat + loudnorm) через `episode_render` — только
  unit-тесты с моками; реальный CLI проверен на одной сцене.
- Google TTS 429/403 на реальном лимите; профиль Chrome в Docker.

### Теория

- Episode-план — это оркестратор, а не новый пайплайн: он переиспользует `generateJson`,
  `synthesizeWithGoogleTts` и `buildStoryboardFromDraft`, добавляя только subject-картинки.
- Pixabay остаётся вне Asset Library: картинка живёт как data URI в артефакте, а renderer
  получает её через тот же `ResolvedAssetMap`, что и resolver, — граница «рендерер видит URL»
  сохраняется без новых типов.
- Инъекция на уровне CLI, а не компонентов: `SubjectLayer` не знает про Pixabay, поэтому
  тест «карта подменяет starter» проверяет ровно стык, где возможна регрессия.
- Идемпотентность строится на артефакте-манифесте: наличие файлов + совпадение topic —
  доказательство, что вход не менялся; без этого повторный job платил бы дважды.
- `transitionRun` обязан читать mode: одно и то же состояние `SCRIPT_READY` принадлежит
  разным стадиям в двух режимах, и `currentStage`/`failedStage` иначе врут в истории.
- Классификация ошибок TTS — часть контракта: 403 не лечится ретраем, 429 лечится; без
  `retryable` BullMQ потратит все попытки на терминальную ошибку.
- Долгий рендер держим в subprocess: Chrome/RAM и сборка Remotion не попадают в процесс
  очередей, а падение CLI не роняет воркер.
- Инъекция данных (data URI) ограничена размером input props; превышение — не ошибка стадии,
  а осознанный откат на Tier 0.

## 2026-11-11 — Research: DeepSeek SVG вместо fal.ai / Recraft

**Статус:** DONE (research-only). Код/зависимости/миграции не изменялись; платные вызовы —
6 генераций DeepSeek на $0.002 (изолированный PoC в `C:\Temp\opencode\`). Бриф: «Replacing
fal.ai / Recraft with Direct DeepSeek SVG Generation».

**Метод:** карта фактического кода пайплайна (контракты, resolver, fake-provider, CLI-мост,
Remotion, DeepSeek-клиент) → официальные тарифы/доки DeepSeek и ToS → реальный PoC: 3 объекта
× 2 попытки через `deepseek-flash` (JSON mode) → проверка каждым настоящим `normalizeSvg`.

**Что сделано:** отчёт `docs/workspace/research/2026-11-11-deepseek-svg-assets-research.md`
(текущая архитектура, возможности DeepSeek, совместимость, варианты A/B/C, стоимость,
риски, PoC, план миграции, вердикт).

**Проверено:** fal.ai/Recraft в коде отсутствуют (только fake `ImageProvider`; ключей нет) —
«отказ» = не строить M3.6b-адаптеры, а не переписывать; PoC 6/6 валидных SVG с первого раза,
`maxColorDistance = 0`, текста/запрещённых элементов нет, фон `<rect>` снимается нашим
нормализатором; цена $0.00033/ассет (off-peak) против $0.021–0.070 у fal/Recraft; ToS DeepSeek
§4.2 — права на выходы уступаются пользователю, коммерция разрешена.

**Не проверено:** визуальное качество (нужен человеческий гейт), латентность, стабильность
стиля на сериях, органика vs диффузия (гипотеза: ниже).

**Теория:**
- «Замена провайдера» иногда оказывается не миграцией, а выбором: если интеграция существует
  только в документах, отказ от неё бесплатен — проверяй код, а не планы.
- LLM-генерация кода (TSX) ненадёжна в рантайме (0–12.7% проходов), но LLM-генерация *данных*
  (SVG) с жёстким валидатором надёжна: 6/6 с первого раза, потому что результат проверяется
  машинно, а не «на глаз».
- Точная палитра хексами в системном промпте даёт `maxColorDistance = 0` — сильные ограничения
  в промпте важнее «креативности» модели.
- Кэш превращает недетерминированный генератор в детерминированный сервис: ассет генерируется
  один раз, проверяется один раз и живёт в библиотеке навсегда.
- Экономия в 100× на микро-статье бюджета даёт мало денег, но убирает целый вендорский контур
  (оплата из РФ, ключи, лимиты) — иногда это ценнее самих денег.

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

## 2026-11-11 — Research: fal.ai vs Recraft для slop-фабрики (экономика AI-ассетов)

**Статус:** DONE (research-only). Ветка любая; код/контракты/статусы ROADMAP не менялись,
платных вызовов нет. План: `docs/workspace/plans/2026-11-11-asset-providers-fal-vs-recraft-research.md`.

**Метод:** локальные документы (ADR-0015/0017, research E5–E6 и 2026-11-08, ROADMAP) → профиль
спроса по фактам M3.5/`recipe-showcase.json`/каталогу рецептов → официальные прайсы и лицензии в
первоисточниках (ключевые цифры сверены лично: Recraft pricing, fal llms.txt для
klein/BiRefNet/Bria, HF model card API для лицензий весов) → cost model → scorecard 10 альтернатив.

**Что сделано:** отчёт `docs/workspace/research/2026-11-11-fal-vs-recraft-for-slop-factory.md`
(executive summary, таблица цен, cost model ассет→ролик→100/1 000/10 000 при cold/warm кэше,
scorecard, карта use case→Tier, ответы RQ A–F, вердикты H1–H6, план M3.6b, risk register,
«не проверено»); research-раздел в `ROADMAP.md` (статусы M3.6a/b не тронуты).

**Проверено первоисточниками (2026-11-11):** Recraft `$1 = 1 000 units`, V4 Styles Vector $0.05,
V4.1 Vector $0.08, Vectorize $0.01, style $0.005, лимиты 100/min и 5 req/s, «You own all Assets»,
без обучения на API-данных; fal: klein $0.005/MP (подешевел с $0.009), pro $0.03+$0.015/MP,
BiRefNet v2 в листинге $0/compute-s, Bria $0.018/$0.03, queue+webhooks, ретраи ×10, 5xx не
тарифицируются, concurrency 2→40; лицензии весов: FLUX.2-klein-4B Apache-2.0, FLUX.2-dev
flux-non-commercial-license, Bria RMBG-2.0 CC BY-NC 4.0 (HF API metadata); TikTok `is_aigc` в
Content Posting API и политика AIGC effective 2026-09-24; РФ отсутствует в supported countries
OpenAI/Google.

**Не проверено (главное):** фактическое списание BiRefNet (листинг $0 vs исторические
~$0.002/img); accept rate/доля брака обоих путей (r=1.4 — оценка E6); структура SVG-выхлопа
Recraft (viewBox/path/`<text>`); SLA обоих; free tier/минимальные покупки; детерминизм seed;
доступ recraft.ai из РФ (противоречивые данные). Всё помечено в отчёте, платных вызовов нет.

**Теория (практическая):**
- Единица тарифа — не «цена картинки», а «цена принятого результата»: `cost_accepted = price × r`,
  где r (ретраи+брак) — единственный неизвестный параметр; всё остальное уже стоит центы.
- Ошибки в старых прайсах были систематическими (склейка «$0.05»+«50 units»): единица измерения
  и конверсия валюты тарифа должны сверяться в первоисточнике, а не в маркетинговом сниппете.
- При центах за ассет оптимизатор — не скидки провайдера, а reuse: разница cold/warm кэша на
  10 000 роликов ($392→$157 у дешёвого пути) уже равна «скидке» ~2.5×.
- Break-even self-host считается просто: GPU-час ÷ стоимость того же объёма на API
  ($0.34/ч ÷ $0.005 = ~68 генераций/ч ≈ 290 роликов/день) — и только потом добавляется инженерия.
- Лицензия весов и лицензия вывода — разные вещи: Bria CC BY-NC запрещает self-host, но платный
  API легален; FLUX.2 [dev] — «outputs commercial, weights no». В license guard хранить обе.
- У Recraft V4/V4.1 нет `no_text` (был у V3): инвариант «в картинке нет текста» нельзя делегировать
  провайдеру — он обеспечивается пост-проверкой в нашем нормализаторе (D5).
- Гарантия «same seed → same image» — маркетинг отдельных моделей, а не свойство API; детерминизм
  фабрики должен держаться на content-hash кэше, а не на воспроизводимости генерации.
- Главный риск фабрики подтверждён с платформенной стороны: TikTok маркировку AIGC мы уже соблюдаем,
  а вот серийные однотипные ролики грозят потерей FYF — вариативность рецептов важнее цены ассетов.


## 2026-11-11 — M3.6a.1: Asset Library persistence (Drizzle repository + blob store)

**Статус:** DONE (M3.6b остаётся TODO). Ветка `feat/m3-animated-factory`; изменения не
закоммичены.

**Цель:** сделать библиотеку настоящей: строки в Postgres, байты в S3-совместимом хранилище,
повторный резолв из кэша без провайдера. Реальные Recraft/fal.ai/BiRefNet по-прежнему не
подключаются (M3.6b), ключи не нужны.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.6a) | Требуемое изменение (M3.6a.1) |
| --- | --- | --- |
| `AssetRepository` | Только `InMemoryAssetRepository`; данные живут в процессе | `DrizzleAssetRepository` в `packages/db`: `findByKey`/`findByContentHash`/`listByStyle`/`save` поверх `assets`+`asset_variants`, маппинг в обе стороны, ошибки БД не глотаются |
| `save` | Hash-хит возвращает запись; upsert по `(key, styleId)` не реализован | Транзакция: hash-хит → существующая запись; иначе upsert по `(key, style_id)`, upsert вариантов по `(asset_id, variant_id)`, удаление исчезнувших вариантов; повторный вызов не меняет число строк |
| `id` записи | `buildAssetId` в памяти/резолвере | Тот же `buildAssetId(source, key)` при чтении из БД (в таблице нет колонки `id` записи) |
| Хранилище байтов | Нет: файлы только в `public/assets/starter/`, resolver не делает I/O | Порт `AssetBlobStore` (`put`/`urlFor`/`get`) в `packages/assets`, `InMemoryAssetBlobStore` для тестов, `S3AssetBlobStore` в `packages/storage` поверх `ObjectStorage` |
| Сохранение | Нет | `AssetLibraryService.persist(resolution, bytes, mimeType)`: hash-хит → без `put`/`save`; иначе `put` в content-addressed ключ → `save`; URL варианта — presigned |
| Объектный ключ варианта | Starter: локальный `assets/starter/<file>.svg`; provider: content-addressed | При persist ключ варианта переписывается на `buildAssetObjectKey(contentHash, ext)`, байты и строка не расходятся; `Content-Type` — из `mimeType` |
| Засев Tier 0 | Вручную ничего: starter-записи строятся в памяти на каждый запуск | `assets:import` в `apps/worker`: `--public <dir>` (default `apps/render-worker/public`), идемпотентная запись 12 стартовых SVG в БД + S3, сводка added/existing/hash |
| Renderer CLI | `--resolve-assets [--provider=fake]` → data URI в props | + `--persist` (только с `--resolve-assets`): repository + blob store из env, Tier 0 — байты из `public/`, provider — из data URI; в props идёт presigned URL; манифест `assets.persisted` |
| Env | Renderer не знает про БД/S3 | `--persist` требует `DATABASE_URL` и `S3_*`; неполный env → понятная ошибка и exit 1, без тихого in-memory отката |
| Без `--persist` | M3.6a поведение | Не меняется: тот же in-memory резолв и data URI |
| Тесты | In-memory resolver, без БД/сети | Unit: маппинг/merge без БД, blob-store проксирование, library-service идемпотентен; integration (Testcontainers Postgres) — round-trip, idempotent save, hash-hit, `listByStyle`, удаление варианта |
| Документы | README/ROADMAP/ADR-0017 без persistence | README (import/persist/env), ROADMAP M3.6a.1 DONE + alias key→hash как предусловие M3.6b, ADR-0017 D10, SESSION_LOG |

### Что изменено

- `packages/db/src/assets-repository.ts` — `DrizzleAssetRepository`: `findByKey`,
  `findByContentHash`, `listByStyle`, транзакционный `save` (upsert `assets` по
  `(key, style_id)`, upsert вариантов по `(asset_id, variant_id)`, удаление исчезнувших
  вариантов). Чистые `assetRowValues`/`assetVariantRowValues`/`toAssetRecord`; `id`
  восстанавливается через `buildAssetId(source, key)`; невалидная строка или нарушение
  constraint'а падают с ключом ассета, а не деградируют в fallback. Импорт порта — только
  `import type` из `@peertoreel/assets`; `@peertoreel/contracts` переведён в `dependencies`.
- `packages/db/src/assets-repository.spec.ts` — маппинг/merge без БД (license, attribution,
  порядок вариантов, invalid row, пустой variants).
- `packages/db/src/assets-repository.integration.spec.ts` — Testcontainers Postgres
  (`postgres:18-alpine`) + `drizzle-kit` migrator: round-trip, идемпотентный save, hash-hit,
  `listByStyle`, удаление устаревшего варианта, unique `content_hash`, check `commercial_use`.
  Без Docker `describe.skipIf` пропускает файл.
- `packages/assets/src/blob-store.ts` — порт `AssetBlobStore` (`put`/`urlFor`/`get`/`exists`) и
  `InMemoryAssetBlobStore` (`putCount`, `objectKeys`).
- `packages/assets/src/library-service.ts` — `AssetLibraryService`: `persist` (проверка hash
  байтов, нормализация ключей вариантов в `buildAssetObjectKey`, hash-hit без `put`/`save`,
  presigned URL в `variants[*].url`), `withUrls` (проверяет ключ и наличие объекта у каждого
  варианта), `resolveAndPersist(request, readBytes)`. Строка под неконтент-адресуемым ключом —
  явная ошибка.
- `packages/assets/src/resolver.ts` — провайдерская ветка возвращает только что сгенерированную
  запись (с data URI), а не echo из репозитория: в БД нет колонки `url`, и байты иначе терялись.
- `packages/assets/src/library-service.spec.ts` — один `put` на hash, идемпотентность, URL из
  blob store, provider → cache без второго вызова провайдера, отказ при несовпадении байтов.
- `packages/storage/src/storage.ts` — аддитивный `ObjectStorage.objectExists` (HEAD; 404 →
  `false`, остальные ошибки пробрасываются).
- `packages/storage/src/asset-blob-store.ts` — `S3AssetBlobStore` поверх
  `putObject`/`presignGet`/`getObject`/`objectExists`; TTL по умолчанию 1 ч.
- `packages/storage/src/asset-persistence-env.ts` — одна Zod-схема env (`DATABASE_URL` + `S3_*`)
  и `parseAssetPersistenceEnv` для `assets:import` и `--persist`.
- `apps/worker/src/assets/import-runner.ts` — `runAssetImport` (правила засева без env/файлов) и
  его unit-тест; `apps/worker/src/assets/import.ts` + script `assets:import` — чтение
  `apps/render-worker/public` (`--public <dir>` от корня репо), сводка added/existing/hash.
  `DATABASE_URL`/`S3_*` обязательны, иначе ошибка.
- `apps/render-worker/src/asset-persistence.ts` — env-схема (Zod) и сборка
  `DrizzleAssetRepository` + `S3AssetBlobStore` + `AssetLibraryService`; `close()` закрывает pool.
- `apps/render-worker/src/asset-resolution.ts` — необязательный `persistence`:
  Tier 0 читает байты из `public/`, provider — из data URI, кэш — проверяет объект через
  `exists`; в props уходит presigned URL, в результате `persisted: boolean`.
- `apps/render-worker/src/cli.ts` — `--persist` (только с `--resolve-assets`), загрузка `.env`
  из корня, `finally` с закрытием pool, манифест `assets.persisted`.
- Зависимости: `packages/db` → `@peertoreel/contracts` (runtime), `@peertoreel/assets` (dev,
  type-only) и `testcontainers`/`@testcontainers/postgresql`; `packages/storage` →
  `@peertoreel/assets` (dev, type-only) и `zod`; `apps/worker` → `@peertoreel/assets`;
  `apps/render-worker` → `@peertoreel/db`, `@peertoreel/storage`, `dotenv`.
- Документы: README (раздел Persistence), ROADMAP (M3.6a.1 DONE + итог), ADR-0017 (D10,
  уточнён D9/Consequences), `apps/worker/AGENTS.md` (засев только через библиотеку),
  `apps/render-worker/AGENTS.md` (persistence — только на CLI-границе).

### Проверено

- `pnpm check` — зелёный (exit 0): contracts **154**, assets **60**, db **17** (включая 6
  Testcontainers-тестов), storage **9**, render-worker **103**, worker **121**, api 64, tiktok 28,
  web 124 — всего **680** тестов (+31 к M3.6a). Unit-тесты не поднимают Chrome, не ходят в
  сеть; integration-файл использует Testcontainers и пропускается без Docker.
- **Инфраструктура поднята:** Docker 29.9.2, Postgres/Redis/SeaweedFS healthy, миграции
  применены (схема `0008` уже содержала `assets`/`asset_variants`, новая миграция не понадобилась).
- `assets:import` первый прогон: **12 добавлено**, 12 `assets` / 12 `asset_variants` в БД, все
  `object_key` — `assets/<hh>/<hash>/<hash>.svg`, `mime_type image/svg+xml`, 256×256.
  Второй прогон: `добавлено 0, уже было 12` — ни строк, ни повторных загрузок.
- Presigned URL (dog-snout): HTTP **200**, `Content-Type: image/svg+xml`, 965 байт, SHA-256
  скачанных байтов **совпадает** с `content_hash`; `objectExists` → `true` для существующего
  ключа и `false` для отсутствующего (HEAD, без 500).
- `render-storyboard --resolve-assets --persist` (showcase): 5 сцен за **80.0 с**, резолв
  `dog-snout`/`scent-wave` → `tier: starter`, манифест `assets.persisted: true`,
  `objectKey` content-addressed. `ffprobe` всех клипов: h264, 1080×1920, 30/1, `yuv420p`,
  `bt709`/`bt709`/`bt709` — формат не изменился.
- **Provider + `--persist` (после фикса блокера):** отдельный storyboard из 3 сцен с
  `subject/robot` (ключа нет в Tier 0) прогнан через настоящий CLI с `--provider=fake --persist`.
  Первый прогон: `tier: provider`, `providerRequests: 1`, `costUsd: 0`, манифест
  `persisted: true`; скачанные по presigned URL байты — 283 байта SVG, SHA-256 совпадает с
  `content_hash` (раньше здесь загружался пустой объект). Второй прогон того же входа:
  `tier: cache`, `cacheHit: true`, `providerRequests: 0`, `costUsd: null` — провайдер не вызван.
  Тестовая строка и объект удалены, в БД снова 12 записей.
- Ошибки CLI: `--persist` без `--resolve-assets` → сообщение и exit 1. Неполный env
  валидируется `parseAssetPersistenceEnv` (unit-тест перечисляет отсутствующие переменные);
  тихого in-memory отката нет.

### Не проверено / ограничения

- **Живой R2 не проверялся** — только локальный SeaweedFS. Прод-бакет и его CORS/домен —
  отдельная проверка.
- **Реальные платные провайдеры** (Recraft/FLUX.2/BiRefNet) по-прежнему не вызывались: ключей
  нет, это M3.6b. Persistence проверен на Tier 0 и fake provider.
- **Data-URI fallback при исчерпанном presigned TTL не реализован:** TTL 1 ч, рендер шёл 80 с.
  Если рендер когда-нибудь превысит TTL, URL нужно перевыпускать до старта, а не полагаться на
  data URI; это осознанное решение, не дефолт.
- **Content-Type для PNG/WebP** не проверялся живым объектом (растр — M3.6b); живой SVG отдаёт
  `image/svg+xml`.
- **Alias key→hash** остаётся не реализованным: hash-хит возвращает запись-владельца, новый
  ключ не становится адресуемым. Это предусловие M3.6b до подключения платного провайдера.
- **Hash-хит не обновляет metadata.** Повторный `assets:import` после правки тегов/лицензии в
  каталоге вернёт существующую строку как есть (по плану hash-хит = dedup, а не upsert
  метаданных). Изменённые теги применятся только после удаления строки; отдельный
  metadata-refresh можно добавить в M3.6b.
- **Persist рассчитан на один набор байтов на запись:** варианты должны делить hash записи.
  Отдельные байты для `outline`-варианта требуют явного API (M3.6b), сейчас это ошибка.
- **Docker-образ render-worker** не пересобирался (код образа не менялся).
- **Стоимость:** реальных расходов нет (`costUsd: null` у Tier 0; fake provider — 0).

### Review-фиксы (после read-only reviewer-прохода)

- **Блокер: провайдерские байты терялись.** Резолвер писал строку в БД и возвращал её echo без
  `url` (в таблице нет колонки URL), поэтому `--persist --provider=fake` не мог достать data URI,
  падал на `exists` и оставлял «отравленную» строку; `AssetLibraryService` при этом мог загрузить
  пустой объект (не было проверки хэша). Исправлено: резолвер возвращает только что
  сгенерированную запись (data URI сохраняется), `ensureBytes` проверяет SHA-256 присланных
  байтов до `put`, добавлен тест с репозиторием, который отбрасывает URL (как Drizzle), и живой
  прогон CLI `--provider=fake --persist`.
- **`withUrls` больше не подписывает непроверенное:** каждый вариант должен иметь
  контент-адресуемый ключ и существующий объект, иначе явная ошибка (ADR D10).
- **DB-адаптер:** `save` отвергает неканонический `id` и пустой список вариантов; сообщения об
  ошибках — на английском, как в остальном пакете.
- **`ObjectStorage.objectExists`:** `isNotFoundError` экспортирован и покрыт тестом (404/
  `NotFound`/`NoSuchKey` → `false`, 403/сеть → проброс).
- **Интеграционный тест:** `beforeEach` очищает `assets` (варианты каскадом), поэтому кейсы не
  зависят от порядка и не проверяют глобальные счётчики.
- **`assets:import` стал тестируемым:** правила вынесены в `runAssetImport`
  (`apps/worker/src/assets/import-runner.ts`), CLI отвечает только за env/файлы/stdout.
  Unit-тест: первый прогон 12 added и 12 `put`, второй — 0 added, 12 existing, `putCount` не растёт.
- **Один env-контракт:** `parseAssetPersistenceEnv` (+ Zod-схема) переехал в
  `packages/storage`; `assets:import` и `--persist` валидируют одинаково.
- **Границы:** boundary-тест render-worker теперь запрещает в core path также
  `@peertoreel/db`/`@peertoreel/storage`; тест второго прогона считает `save` через
  `CountingRepository`, а не только `putCount`.
- **Утечка pool:** `--persist` строит `ObjectStorage` до `createDatabase`, поэтому падение
  конструктора хранилища не оставляет открытый pool.
- **ADR/теория поправлены:** резолвер действительно пишет строку провайдера до загрузки байтов;
  persist это чинит (`exists` → `put`), а не «всегда пишет байты первыми».

### Теория сессии

- **Порядок записи зависит от того, кто владеет решением.** Import пишет байты первым, а
  провайдерская ветка резолвера — сначала строку (это часть контракта M3.6a). Поэтому
  persistence обязан «долечить» отсутствующий объект, а рендер — отказаться подписывать строку
  без байтов; иначе порядок превращается в скрытый 404.
- **Эфемерные поля не переживают round-trip.** `url` — не данные: адаптер его не возвращает.
  Код, который рассчитывает получить data URI обратно из репозитория, ломается только на
  настоящей БД и только на провайдерской ветке; поэтому fake, отбрасывающий URL, полезнее fake,
  который его сохраняет.
- **Хэш — единственный идентификатор загрузки.** `findByContentHash` + `exists` превращают
  повторный импорт в чтение: ни второго объекта, ни второй строки. Логический ключ — это
  метаданные, а не адрес файла.
- **Content-addressed ключ делает аплоад идемпотентным.** Тот же хэш всегда даёт тот же ключ,
  поэтому повторный `put` физически не создаёт копию; `exists` нужен только чтобы не платить за
  лишний запрос.
- **Транзакция — граница согласованности строк, но не объектов.** Postgres гарантирует
  атомарность `assets`+`asset_variants`; S3 — только идемпотентность content-addressed ключа.
  Согласованность между ними даёт не порядок «объект→строка» сам по себе, а проверка
  `exists` + хэш на каждом persist и явная ошибка на рендере.
- **Два unique-констрейнта — две разные политики.** `(key, style_id)` — «одна логическая
  запись на стиль», `content_hash` — «одни байты живут один раз». Hash-хит имеет приоритет;
  конфликт между ними (новый ключ с чужим хэшем) должен падать, а не перезаписывать владельца.
- **Presigned URL — производное значение, а не данные.** В БД нет колонки `url`: TTL-ссылка
  живёт в props/манифесте, а хранится только ключ. Поэтому «второй resolve» дёшев — это
  переподпись, а не повторный резолв.
- **Порт отделяет библиотеку от S3.** `packages/assets` знает только `put/urlFor/get/exists`;
  Drizzle и AWS SDK остаются в `db`/`storage`, а `import type` не тянет рантайм-зависимость.
- **Тестовая инфраструктура — часть проверки.** Unit-тесты на in-memory fake доказывают логику,
  но уникальные индексы и check-constraint'ы существуют только в Postgres, поэтому интеграционный
  тест идёт через Testcontainers, а не через «поверим в миграцию».
- **Идемпотентность проверяется счётчиками, а не глазами.** «Добавлено 12 → 0», 12 строк в БД,
  один `put` на hash и неизменное число `save` — это наблюдаемые числа, которые можно сравнить
  между прогонами.

### Следующая сессия

M3.6b — реальные `ImageProvider`-адаптеры (Recraft Vector, FLUX.2 `[klein]`/`[pro]` + BiRefNet
v2) поверх уже работающей библиотеки, alias key→hash до первого платного вызова, raster-cutout
нормализация с PNG decode, `cartoon-character`, третья тема и полный acceptance M3.6.

## 2026-11-11 — M3.6a: Asset Library core, Resolver и style preset

**Статус:** DONE (M3.6b остаётся TODO). Ветка `feat/m3-animated-factory`; изменения не
закоммичены.

**Цель:** сделать стартовый пак одним из источников библиотеки, а не единственным: metadata и
content hash, DB-схема, детерминированный `AssetResolver` (Tier 0 → кэш → fake provider →
fallback → typed error), лицензионный guard, чистая SVG-нормализация с OKLab-квантованием
палитры, `studio_flat_2d_v1` и передача resolved asset URL в renderer через input props.
Реальные Recraft/fal.ai/BiRefNet-вызовы в этой сессии не выполняются (нет ключей) — это M3.6b.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.5) | Требуемое изменение (M3.6a) |
| --- | --- | --- |
| Модель ассета | 12 SVG + `STARTER_ASSET_CATALOG` (path/tags/license `'authored'`) в contracts | `AssetRecord`/`AssetVariant`/`AssetLicense`/`AssetSource`/`AssetKind` в `contracts/src/assets.ts`; starter — один из `AssetSource`, а не единственный источник |
| Хранение | Ничего: только файлы в `public/assets/starter/` | Таблицы `assets`/`asset_variants` (unique content hash, `commercial_use` check), миграция, content-addressed ключ `assets/<hash[0..1]>/<hash>/<name>` |
| Resolver | `SubjectLayer` берёт путь из каталога напрямую | `TieredAssetResolver`: starter → cache (key/tags) → provider (только `allowProvider`) → `fallbackKey` → typed error; одинаковый запрос → одинаковый результат |
| Дедупликация | По логическому ключу каталога | SHA-256 байтов; одинаковые байты → один record/variant, `cacheHit: true` |
| Лицензии | Поле `'authored'` в каталоге, проверок нет | `commercialUse: true` обязателен (DB check + `AssetLicenseError`); starter проходит |
| Нормализация SVG | Нет: внешний SVG рендерился бы как есть | `svgo` cleanup, удаление full-bleed `<rect>`, padding viewBox 8%, OKLab-квантование fill/stroke/stop-color в `assetPalette`; чистая функция без DOM |
| Растр | Нет | Чистые `alphaOccupancy`/`alphaBounds` над RGBA; декодирование PNG/trim/стикер — M3.6b (явный `UnsupportedAssetKindError`) |
| Провайдер | Нет | Порт `ImageProvider` в contracts + `createFakeImageProvider` (локальные SVG, usage, нулевые реальные расходы) |
| Стиль | `style.palette` в каждом JSON, `assetPalette` отсутствует | `STYLE_PRESETS`/`studio_flat_2d_v1` (palette + assetPalette + typography + effects); optional `assetPalette` в `storyboardStyleSchema`; showcase на пресете |
| Input props renderer | `{ scene, style, resolved, wordTimings? }` | + `assets?: Record<string, { url: string }>`; компонент не ходит в сеть |
| `SubjectLayer` | Всегда `resolveAssetKey(assetKey)` + `assetUrl` | Сначала `assets[assetKey].url`, иначе прежний локальный путь; неизвестный ключ без injection — ошибка |
| CLI | `render-storyboard --input/--scene/--out` | + `--resolve-assets [--provider=fake]`: resolver → data URI в input props; манифест фиксирует tier/usage |
| Манифест | componentId/source/recipe/param+slot diagnostics | + сводка resolved assets (key, tier, cacheHit, contentHash) и usage |
| Storage | `buildArtifactKey` | + `buildAssetObjectKey` (аддитивно, тот же формат, что у resolver/DB) |
| Тесты | starter SVG existence/text-free, assets key classifier | + hash/dedup, порядок resolver, license guard, fallback, no-network, OKLab на фиксированных цветах, SVG-нормализация, style preset, `assets` input props |
| Документы | ADR-0012…0016, ROADMAP M3.6 TODO | ADR-0017; ROADMAP M3.6a DONE / M3.6b TODO; README asset library |

### Что изменено

- `docs/adr/0017-asset-library-and-resolver.md` — D1–D9: контракт/порты в contracts,
  реализация в `packages/assets`, метаданные и таблицы, content hash как идентичность байтов,
  фиксированный порядок resolver, обязательная нормализация, input props renderer-а, preset как
  данные, лицензионная политика, граница M3.6a/M3.6b.
- `packages/contracts/src/assets.ts` — `AssetKind`/`AssetSource`/`AssetLicense`/`AssetVariant`/
  `AssetRecord`/`AssetRequest`/`AssetResolution`/`AssetUsage`, `AssetResolver` и `ImageProvider`,
  typed-ошибки, `parseAssetRequest`, `buildAssetObjectKey`.
- `packages/contracts/src/style.ts` — `STYLE_PRESETS` + `studio_flat_2d_v1` (palette,
  `assetPalette`, typography, effects); `STORYBOARD_STYLE_IDS` расширен аддитивно;
  `storyboardStyleSchema` получил optional `assetPalette`.
- `packages/db/src/schema.ts` — `assets`/`asset_variants` (unique `(key, style_id)`, unique
  `content_hash`, check `commercial_use = true`, GIN по тегам) + миграция
  `apps/api/drizzle/0008_outstanding_toro.sql`, сгенерированная drizzle-kit.
- `packages/storage/src/storage.ts` — `buildAssetObjectKey` (тонкая обёртка над контрактом, без
  изменения существующего API).
- `packages/assets` (новый пакет, svgo 4.1.0):
  - `content-hash.ts` — SHA-256 строк/байтов (идентичность нормализованных байтов);
  - `repository.ts` — `AssetRepository` + `InMemoryAssetRepository` (dedup по hash, clone);
  - `starter.ts` — Tier 0 строится из `STARTER_ASSET_CATALOG` и реальных байтов;
  - `resolver.ts` — `TieredAssetResolver`: starter → cache (key/tags) → provider (только
    `allowProvider`) → fallback → typed error; фильтрация по `kind`; лицензионный guard;
  - `normalize-svg.ts` — svgo, удаление full-bleed `<rect>` до оптимизации (svgo превращает
    rect в path), padding viewBox 8%, OKLab-квантование fill/stroke/stop-color;
  - `oklab.ts` — sRGB↔OKLab, ближайший слот палитры, детерминированный tie-break;
  - `normalize-raster.ts` — чистые `alphaOccupancy`/`alphaBounds`/`validateCutoutAlpha`;
  - `provider-fake.ts` — offline `ImageProvider` с детерминированным synthetic SVG и usage;
  - `style.ts` — `buildStoryboardStyle`/`applyStylePreset`/`assetPaletteFor`.
- `apps/render-worker`:
  - `props.ts` — `assets?: Record<string, { url }>` в input props;
  - `assets.ts` — `subjectAssetSource`: injected URL → локальный ключ → typed error;
  - `SubjectLayer`/`RecipeLayers`/`SceneObjects`/`SceneComposition`/`render.ts` — прокидывают
    `assets`, компоненты не ходят в сеть;
  - `asset-resolution.ts` — CLI-мост resolver → data URI; `cli.ts` — `--resolve-assets`,
    `--provider=fake|none`, манифест `assets.resolutions`/`assets.usage`;
  - `examples/recipe-showcase.json` переведён на `studio_flat_2d_v1` + `assetPalette`.
- README (раздел Asset Library), ROADMAP (M3.6a DONE, M3.6b TODO, acceptance),
  ADR-0012 (раздел M3.6a), `apps/render-worker/AGENTS.md`, `apps/worker/AGENTS.md`, корневой
  `AGENTS.md` (§3 ADR-0017, §5 таблицы, §9 тесты), `SESSION_LOG.md`.

### Проверено

- `pnpm check` — зелёный (exit 0): contracts **154** теста, assets **50**,
  render-worker **102**, worker 119, web 124, api 64, storage 3, db 5, tiktok 28 (всего **649**).
  Тесты не запускают Chrome, `renderMedia` и не ходят в сеть.
- Showcase с `--resolve-assets`: 5 сцен за **79.5 с**; резолвлены `dog-snout` и `scent-wave`
  как `tier: starter`, `cacheHit: false`, SHA-256 совпадает с реальными файлами; usage
  `provider: null, providerRequests: 0, cacheHits: 0, costUsd: null`. В манифесте появился блок
  `assets`. После review-фиксов сцена 0 повторно отрендерена (**20.6 с**) с тем же резолвом.
- `ffprobe` всех 5 клипов showcase: `h264`, 1080×1920, 30/1, `yuv420p`, `bt709`/`bt709`/`bt709` —
  формат не изменился.
- Регрессия входов: fixture (6 сцен, **137.1 с**) и `examples/custom-storyboard.json`
  (4 сцены, **78.2 с**) рендерятся без `--resolve-assets`, как раньше.
- Resolver: starter hit, tag match, cache hit, provider generation + нормализация + dedup,
  fallback, no-network при `allowProvider: false`, отказ `commercialUse: false` (starter и
  provider), `UnsupportedAssetKindError` для png, детерминизм одинаковых запросов.
- M3.5 storyboards резолвятся: `dog-nose` (7 сцен) — `dog-snout`, `scent-wave`, `thermometer`;
  `brick-house` (6 сцен) — `brick-wall`, `brick`; все `tier: starter`, без сети.
- Нормализация: удалён full-bleed rect, геометрия (`cx/cy/r`) не изменилась, viewBox
  `0 0 100 100` → `-8 -8 116 116`, все fill/stroke попадают в `assetPalette`,
  `maxColorDistance < 0.01` на тестовых цветах.
- **Инфраструктура поднялась** (вопреки ожиданию): `docker info` доступен, Postgres/Redis/
  SeaweedFS healthy. `pnpm db:migrate` применил `0008`; живыми INSERT'ами проверены unique
  `assets_content_hash_unique` и check `assets_commercial_use_true` (оба отклонили плохие
  строки), тестовые строки удалены.

### Review-фиксы (после read-only reviewer-прохода)

- **Resolver:** неподдерживаемый `kind` теперь skip, а не abort — `fallbackKey` всё ещё
  применяется; в typed-ошибки добавлен `InvalidAssetError`, чтобы `InvalidSvgError` от
  провайдера не утекал после оплаченного вызова; tie-break по тегам и сортировка замен
  переведены на code-unit сравнение (без `localeCompare`); `request.assetPalette` теперь
  реально используется; `AssetRecord.id` строится через `buildAssetId(source, key)`.
- **Object key:** `buildAssetObjectKey(hash, ext)` — имя файла снова чистая функция хэша
  (`<hash>.<ext>`), один blob не может получить два ключа.
- **Нормализация:** full-bleed rect больше не удаляется внутри
  `<defs>/<clipPath>/<mask>/<pattern>/<symbol>/<marker>`; полностью прозрачные `#RRGGBB00`
  не квантуются (иначе скрытая геометрия становилась видимой); `readSvgViewBox` отдаёт реальные
  размеры, поэтому `asset_variants.width/height` стартовых SVG — 256, а не выдуманные 1024.
- **Renderer CLI:** `--provider` валидируется всегда; `tier` типизирован
  `AssetResolutionTier`; `costUsd` не превращается в 0, если хотя бы один резолв не измерен;
  boundary-тест запрещает импорт `@peertoreel/assets`/`asset-resolution` из core render path.
- **Данные:** Tier 0 явно объявлен единственным исключением «нормализация перед хранением»
  (author-файлы хранятся как есть); выравнивание их палитры под `studio_flat_2d_v1` вынесено в
  M3.6b.
- **Осознанно не меняли:** alias-строки key→hash (hash-хит возвращает запись-владельца;
  документировано в ADR-0017 D3 и вынесено в M3.6b до подключения платного провайдера);
  unique `content_hash` оставлен глобальным (нормализация палитро-зависима, поэтому
  межстилевые коллизии возможны только у style-independent байтов); `mime_type` остаётся
  `text` (read-path валидирует контракт); named/rgb-цвета не конвертируются — нормализатор
  ограничен hex-выходом наших провайдеров, это записано в ADR.

### Не проверено / ограничения

- **Реальные платные вызовы не выполнялись:** `RECRAFT_API_KEY`/`FAL_KEY` отсутствуют.
  Recraft V4/V4.1, FLUX.2 и BiRefNet — только контракт `ImageProvider` и fake; выдавать их за
  проверенные нельзя.
- **Raster-cutout:** декодирование PNG, trim/центрирование и стикер-контур не реализованы;
  M3.6a даёт только чистые alpha-функции и `UnsupportedAssetKindError` для `raster-cutout`.
- **`cartoon-character`, третья тема** и полный acceptance M3.6 — M3.6b.
- **R2/Postgres adapter:** таблицы и миграция есть, БД-проверки выполнены, но `AssetRepository`
  в M3.6a только in-memory; запись в R2 и чтение из БД — M3.6b.
- **Docker-образ render-worker** не пересобирался (код образа не менялся).
- **Пиксельный паритет** старого showcase с новым пресетом не сравнивался: смена палитры —
  осознанное изменение кадров; проверены формат, длительности и отсутствие регрессии входов.
- **Стоимость:** реальных расходов нет (fake provider, `costUsd: 0`); ledger — M3.7.

### Теория сессии

- **Библиотека начинается с идентичности байтов.** SHA-256 нормализованных байтов — это и ключ
  дедупликации, и путь в объектном хранилище; «одинаковый ассет под двумя именами» физически не
  создаёт вторую копию.
- **Порядок resolver — это политика стоимости.** Сначала бесплатный Tier 0, потом кэш, и только
  при явном `allowProvider` — провайдер. Флаг по умолчанию `false` превращает «забыли выключить
  генерацию» из счёта в ноль.
- **Fallback — данные, а не catch-блок.** `fallbackKey` проверяется тем же кодом, что и основной
  ключ, поэтому лицензия и kind проверяются и на запасном пути.
- **Лицензия — инвариант, а не поле.** `commercialUse: false` отклоняется resolver-ом и
  check-constraint'ом БД: два независимых барьера на одну ошибку.
- **Нормализация — чистая функция.** svgo + OKLab не знают про React, файлы и сеть; поэтому
  палитру можно проверить на фиксированных цветах обычным unit-тестом.
- **OKLab важнее RGB.** Евклидово расстояние в RGB врёт на тёмных и жёлтых оттенках; OKLab даёт
  «ближайший слот, который выбрал бы иллюстратор».
- **Порядок шагов SVG-нормализации значим.** Full-bleed rect удаляется до svgo, потому что
  оптимизатор превращает `<rect>` в `<path>` и фон становится неотличим от геометрии.
- **Renderer не резолвит.** Он получает `assets: Record<key, { url }>`; резолвер, БД и S3
  остаются снаружи, а локальный ключ — только совместимый fallback для M3.3–M3.5.
- **Style preset — данные.** `studio_flat_2d_v1` даёт palette/assetPalette/typography, поэтому
  showcase и будущие темы не копируют цвета по файлам.
- **Честная граница milestone.** Инфраструктура и контракты без реальных провайдеров — это
  M3.6a; «M3.6 DONE» без Recraft/fal.ai/BiRefNet было бы ложью.

### Следующая сессия

M3.6b — реальные `ImageProvider`-адаптеры (Recraft Vector, FLUX.2 `[klein]`/`[pro]` + BiRefNet
v2), raster-cutout нормализация с PNG decode, `Variant`-версии в БД/R2, `cartoon-character` rig,
третья тема и полный acceptance M3.6.

---

## 2026-11-10 — M3.5: End-to-end animation spike на двух темах

**Статус:** DONE. Ветка `feat/m3-animated-factory`.

**Цель:** проверить путь topic → DeepSeek draft → TTS → `storyboard.v1` → Remotion-сцены →
FFmpeg-ролик на темах «Почему у собак мокрый нос?» и «Почему дома строят из кирпича?», без
API/БД/очередей и облачных AI-ассетов.

### Что изменено

- `packages/contracts/src/storyboard.director.ts` — `storyboardDraftSchema`: 5–8 сцен,
  60–110 слов, первый hook, последний cta, последовательные beats, валидация recipe/variant/
  slots через `parseRecipeSlots`. Таймингов в драфте нет.
- `apps/worker/src/storyboard/`:
  - `prompt.ts` — системный и пользовательский промпты, каталог и starter-ключи собираются из
    contracts, без дублирования;
  - `build.ts` — `buildStoryboardFromDraft`: окна сцен из реальных word timings, камера из
    camera hint варианта, пустые objects, kinetic fallback, финальная валидация
    `storyboardSchema`;
  - `tts-fallback.ts` — spike-only Google Translate TTS: по-сценная озвучка, точные
    длительности из ffprobe, пропорциональные word timings;
  - `episode-spike.ts` — CLI `storyboard:episode`: DeepSeek → TTS → storyboard → render-worker
    CLI → concat → loudnorm/ASS → manifest;
  - `style.ts` — фиксированный flat 2D стиль M3.5.
- `apps/worker/package.json` — скрипт `storyboard:episode`.
- Визуальный review M3.4 выявил две layout-проблемы: `fact-object/stage` (caption/metric
  пересекались) и боковые subject-слои с неопределённой шириной. Исправлено в каталоге и
  `recipe-layout.tsx` (данные, без per-topic кода).
- README, ROADMAP (M3.5 → DONE), ADR-0012 (раздел M3.5), `apps/worker/AGENTS.md`.

### Таблица «текущее поведение → требуемое изменение»

| Область | Было (M3.4) | Стало (M3.5) |
| --- | --- | --- |
| Раскадровка | Только вручную написанный JSON | DeepSeek-драфт + детерминированная сборка `storyboard.v1` |
| Тайминги | Заданы в JSON/фикстуре | Выведены из реальной озвучки; LLM их не назначает |
| Рецепты | Проверены showcase-файлом | Режиссёр выбирает рецепты/варианты/слоты под две темы |
| Subject-слой | Работает в showcase | Используется в обоих роликах из `STARTER_ASSET_KEYS` |
| Сборка | Только сцены | Ролик с озвучкой, loudnorm −14, ASS-субтитрами |
| TTS | ElevenLabs | ElevenLabs по умолчанию + явный `--tts google` для спайка |
| Манифест | Сцены и диагностика | + LLM usage, TTS provider, длительности, ffprobe ролика |
| Тесты | Contracts/render-worker | + draft schema, prompt, build/timing, fallback helpers в worker |

### Проверено

- `pnpm check` — зелёный; contracts **148 тестов**, worker **119**; тесты без сети, Chrome и
  `renderMedia`.
- «Собака»: 7 сцен, 50.4 с, 86 слов, 5 разных recipeId; DeepSeek 2511/916 токенов, 1 попытка;
  озвучка Google 50.42 с; сцены 146 с, concat 3.2 с, финал 6.4 с.
- «Кирпичи»: 6 сцен, 46.0 с, 75 слов, 5 разных recipeId; DeepSeek 2512/795 токенов, 1 попытка;
  озвучка Google 46.01 с; сцены 137 с, concat 3.3 с, финал 5.5 с.
- `ffprobe` обоих роликов: h264 1080×1920, 30 fps, `yuv420p`, BT.709 + AAC-аудио; длительности
  50.40 и 46.03 с.
- Визуальный review кадров: истории связные, рецепты разные (hero, факт, сравнение, процесс,
  CTA), предметные SVG читаемы, ASS-субтитры на месте; коллизии layout после правки нет.
- Тайминги сцен contiguous и суммарно равны длительности аудио; `storyboardSchema` валиден для
  обоих эпизодов.
- Ошибки LLM/слотов дают Zod-путь и retry, а не пустой кадр (unit-тесты драфта).

### Не проверено / ограничения

- **ElevenLabs:** квота аккаунта исчерпана (осталось 290 кредитов; на один полный текст нужно
  ~295). Поэтому оба спайка озвучены `--tts google`. Это CLI-only fallback: production-стадия
  voiceover не менялась. Word timings в fallback — пропорциональная оценка по длине слов, а не
  character alignment; recipe-слои от них не зависят, ASS-караоке приблизительное.
- **Качество Google-голоса** не оценивалось как production; это проверка пайплайна.
- **Docker:** образ M3.5 не собирался (Docker daemon не запущен).
- **Очередь и артефакты:** `scene_clip`/`scene-render` не добавлялись — это M3.7.
- **Стоимость:** использованы реальные токены DeepSeek и длительность TTS; денег не считали
  (ledger — M3.7/M4.3).
- **Кросс-платформенный паритет** рендера не проверялся.

### Теория сессии

- **LLM предлагает структуру, код решает время.** Драфт содержит только текст и слоты; окна
  сцен считаются по реальным word timings. Это защищает от «LLM придумал 7 секунд».
- **Два контракта вместо одного.** `storyboardDraftSchema` — вход режиссёра, `storyboardSchema`
  — вход рендерера. Между ними детерминированный `buildStoryboardFromDraft`, где живут камера,
  fallback, transition и beatIndex.
- **Слово — единица синхронизации.** Число слов в драфте сверяется с TTS; расхождение — ошибка,
  а не тихий сдвиг сцен.
- **Один непрерывный TTS лучше склейки.** ElevenLabs поёт/говорит с интонацией через границы
  сцен; fallback вынужден делать по-сценно из-за отсутствия alignment, и это записано в manifest.
- **Провайдер — явный флаг, не скрытая подмена.** `--tts google` включается осознанно, а
  production-путь остаётся ElevenLabs; manifest фиксирует, чем озвучен ролик.
- **Переиспользование сильнее нового кода.** `buildVisualConcatArgs`, `renderDraft`, `probeMedia`
  и render-worker CLI не менялись — спайк собрал ролик из существующих кирпичей.
- **Визуальный review — часть теста.** Коллизии caption/metric и ширина боковых слоёв были
  найдены только на кадрах; исправление ушло в данные каталога и layout, а не в ветку по теме.
- **Детерминизм сцены остаётся базой.** M3.5 не добавляет глобального состояния; per-scene
  очередь M3.7 сможет переиспользовать resolution M3.4.

### Следующая сессия

M3.6 — Asset Library + Asset Resolver (Tier 0–2), `ImageProvider` (Recraft Vector / FLUX.2 +
BiRefNet), OKLab-нормализация, `cartoon-character`, style preset `studio_flat_2d_v1`.

---

## 2026-11-10 — M3.4: Scene Recipes v1, слои и локальный starter SVG

**Статус:** DONE. Ветка `feat/m3-animated-factory`.

**Цель:** превратить рецепты сцен в данные (5 × 2–3 варианта), разделить `SceneObjects` на
переиспользуемые слои, включить локальный `image`/`subject`-слой и добавить стартовый SVG-пак
без запечённого текста; форму контракта зафиксировать в ADR-0016 до кода.

### Что изменено

- `docs/adr/0016-scene-recipe-contract.md` — D1–D9: ветка `implementation.type = 'recipe'`,
  каталог как данные, семантика слотов, starter-ключи, один visual source, один resolved value,
  закрытый набор слоёв, единый `camera.ts`, запрет маскировать ошибку рецепта через fallback.
- `packages/contracts/src/storyboard.recipes.ts` — 5 рецептов × 2 варианта, `RecipeSlotSpec`,
  layer plan, camera hint, `STARTER_ASSET_KEYS`/`STARTER_ASSET_CATALOG`, `parseRecipeSlots`,
  `recipeImplementationSchema`, typed-ошибки. В `storyboard.ts` добавлены ветка `recipe`,
  `subject` kind и валидация сцен; в `kinetic-typography` — `preset: 'backdrop'`.
- `apps/render-worker/src/recipes.ts` — единственный resolution рецепта в background + layers;
  `camera.ts` — shot/movement/speed/parallax; `components/layers/*` — text/pill/hud-chip,
  particles, light, overlay, character, chart (battery + comparison/process), subject/image;
  `SceneObjects` — тонкий диспетчер; `mapping.ts`/`props.ts`/`render.ts`/`SceneComposition.tsx`/
  `cli.ts` несут `recipe` и slot diagnostics.
- `apps/render-worker/public/assets/starter/` — 12 authored SVG (`dog-snout`, `water-drop`,
  `thermometer`, `scent-wave`, `brick`, `brick-wall`, `house`, `flame`, `shield`, `key-switch`,
  `clock`, `lightning`), без `<text>`/`<tspan>`.
- `examples/recipe-showcase.json` — 5 сцен: hook-hero, fact-object, comparison, process, cta.
- README, ROADMAP (M3.4 → DONE), ADR-0012 (раздел M3.4), `apps/render-worker/AGENTS.md`.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.3) | Требуемое изменение (M3.4) |
| --- | --- | --- |
| Контракт сцены | `implementation` = `programmatic` / `image_animation` / `ai_video` / `hybrid` | Добавить ветку `{ type: 'recipe', recipeId, variant, slots }`; `programmatic` остаётся escape hatch (ADR-0016 D1) |
| Каталог рецептов | Нет | `packages/contracts/src/storyboard.recipes.ts`: 5 id × 2–3 варианта, slot specs, background+params, layer plan, camera hint — только данные (ADR-0016 D2) |
| Слоты | Нет | `parseRecipeSlots` с семантикой `parseComponentParams`: required missing/invalid → typed error, optional invalid → default + diagnostic, unknown key → `unknown_key` (ADR-0016 D3) |
| Валидация storyboard | Проверяет окна, id, refs, transitions | Дополнительно валидирует recipeId/variant/slots и запрещает непустой `scene.objects` у recipe-сцены (ADR-0016 D3/D5) |
| Subject-ассеты | `kind: 'image'`/`'shape'` в `SceneObjects` возвращают `null` | Локальный `image`/`subject` слой рендерит `assets/starter/*.svg` через `resolveAssetKey` + `assetUrl`; неизвестный ключ → ошибка (ADR-0016 D4) |
| Стартовый пак | Только `public/assets/test-scene.svg` | 12 чистых плоских SVG без `<text>` в `public/assets/starter/` + каталог ключей/тегов/лицензий |
| Резолвинг сцены | `mapping.ts` → `{ componentId, params, source, diagnostics }` | + `recipe: { id, variant, layers } \| null`; неизвестный рецепт/вариант/layer → typed error, без generic-подмены (ADR-0016 D6/D9) |
| `SceneObjects` | Один файл: switch по kind, часть веток возвращает `null` | Тонкий диспетчер над `components/layers/*`; поведение legacy-сцен сохраняется; неизвестный kind падает явно (ADR-0016 D7) |
| Камера | `ParallaxCity` и `KineticTypography` считают движение сами; `shot`/`parallax` не влияют | `src/camera.ts` — единственный модуль; `shot`/`movement`/`speed`/`parallax` влияют на кадр; дефолт parallax `[0.15, 0.35, 0.6, 0.8, 1]` (ADR-0016 D8) |
| Input props Remotion | `{ scene, style, resolved: { componentId, params }, wordTimings? }` | + nullable `recipe`; source/diagnostics остаются вне Remotion |
| CLI/манифест | Манифест: componentId/source/params diagnostics | + `recipeId`, `variant`, slot diagnostics; интерфейс CLI не меняется |
| Примеры | `custom-storyboard.json`, fixture «−15°» | + `examples/recipe-showcase.json` (5 рецептов, предметные SVG); оба старых входа рендерятся как раньше |
| Тесты | Params/mapping/timing/assets/boundary | + каталог, слоты, resolution/diversity, слои, камера, starter SVG (существование и отсутствие `<text>`), showcase JSON |

### Проверено

- `pnpm check` — зелёный (lint, typecheck, tests, build; см. итоговые числа ниже).
- Контракты: 14 файлов / **137 тестов**; render-worker: 11 файлов / **84 теста**. Тесты не
  запускают Chrome и не вызывают `renderMedia`.
- Рендер showcase (5 сцен): **78.5 с**; fixture (6 сцен): **135.9 с**; custom (4 сцены):
  **77.7 с**. Все клипы — `h264`, 1080×1920, 30 fps, `yuv420p`, `bt709`/`bt709`/`bt709`, без
  аудиодорожки; длительности 6/6/6/5/5 с совпадают со входом.
- Детерминизм showcase: SHA-256 `scene-0` одинакова в полном прогоне, одиночном рендере и при
  рендере после CTA в одном процессе (`out/order-check`). `scene-4` также совпала с полным
  прогоном.
- Смена варианта (`hook-hero/subject-lead` → `ghost-question`) меняет background и SHA-256 кадра.
- Невалидные входы: неизвестный `recipeId` → Zod enum; неизвестный `variant` → путь
  `scenes.0.implementation.variant`; отсутствующий required slot → путь к слоту; неизвестный
  `assetKey` → путь `...slots.subject.assetKey`; все завершаются exit 1 до рендера.
- Невалидный optional slot (`cta.subtitle = 42`) → рендер успешен, в логе и `manifest.json`
  есть `slotDiagnostics[{path:'subtitle',reason:'invalid_value',received:42}]`.
- Визуально: 5 рецептов дают разные экраны (сюжетный subject, факт-пилюля, bar-сравнение,
  process-steps, CTA-плитка); предметные SVG читаемы; текстовых узлов внутри SVG нет.
- Fixture и `custom-storyboard.json` рендерятся, fallback/implementation выбираются как раньше.

### Не проверено / ограничения

- Полная сборка showcase с озвучкой, ASS-субтитрами и FFmpeg concat не выполнялась — это M3.5.
- Камера M3.4 меняет кадры legacy-сцен: `shot` и `parallax` теперь реально влияют на кадр
  (требование M3.4). Длительности, состав сцен и тайминги не изменились, но пиксельного
  совпадения с M3.3 нет — это осознанное изменение поведения камеры.
- Кросс-платформенный пиксельный паритет Windows/Linux не проверялся (шрифты/Chrome).
- `chart`-примитивы покрывают сравнение и шаги; сложные диаграммы/выноски — M3.5/M3.6.
- `character` по-прежнему поддерживает только `car`; параметрический rig — M3.6.
- Docker-образ M3.4 не собран: Docker daemon (`dockerDesktopLinuxEngine`) не запущен на машине
  сессии; `docker build` завершился ошибкой подключения к API. Dockerfile не менялся.

### Теория сессии

- **Рецепт — это данные, а не компонент.** `StoryboardRecipe`/`RecipeVariant` в
  `storyboard.recipes.ts` описывают слоты, фон, камеру и layer plan; renderer не знает тему и не
  содержит `DogNose.tsx`. DeepSeek в M3.5 сможет выбрать `recipeId` и заполнить слоты, не
  трогая код.
- **Один resolved value.** `parseRecipeSlots` → `resolveRecipeScene` → `mapping.ts` дают
  `{ componentId, params, recipe }`; `SceneComposition` не выбирает рецепт повторно. Это то же
  правило, что `source`/`diagnostics` в M3.3: лог-поля не влияют на кадр.
- **Слоты — контракт с диагностикой.** Required slot отсутствует → typed error; optional
  некорректен → default + `invalid_value` с `path`/`received`; лишний ключ → `unknown_key`.
  Ошибка не исчезает: CLI пишет её в лог и манифест.
- **Неизвестный assetKey — ошибка схемы.** Subject-слот принимает только `STARTER_ASSET_KEYS`;
  это защищает от «пустого кадра» и от галлюцинаций путей будущим режиссёром.
- **Слои — закрытый набор.** `sceneObjectRenderer`/`recipeRenderer` в `layer-kind.ts` дают
  явную таблицу kind → renderer; default бросает. `SceneObjects` стал диспетчером, а не местом
  для визуального языка.
- **Камера — чистая математика.** `camera.ts` не использует React/Remotion/wall clock:
  `shotScale`, `movementMotion`, `parallaxCoefficient`, `cameraTransform`. Поэтому её можно
  тестировать без Chrome, а компоненты только применяют CSS-трансформ.
- **Parallax — это глубина, а не украшение.** Коэффициент 0 — дальний план, 1 — ближний;
  отсутствие массива использует документированный default, поэтому кадр детерминирован.
- **Единственный visual source.** Recipe-сцена обязана иметь пустой `scene.objects`; иначе два
  layout-а боролись бы за кадр. Legacy-сцены наоборот рисуются только из `scene.objects`.
- **SVG без текста.** Стартовый пак содержит только геометрию; русские подписи, числа и
  выноски рисует Remotion (`RecipeTextLayer`, `RecipeChartLayer`). Это Hard Rule 10 и заодно
  страховка от кривых подписей внутри картинки.
- **Детерминизм проверяется хешем.** Одинаковые recipe+variant+seed дают одинаковый SHA-256;
  порядок сцен не влияет на кадр; вариант меняет кадр. Это дешёвая проверка, которую можно
  повторять в CI без визуального review.

### Следующая сессия

M3.5 — End-to-end animation spike: DeepSeek-режиссёр получает каталог M3.4 и `STARTER_ASSET_KEYS`,
выдаёт `storyboard.v1` для тем «Почему у собак мокрый нос?» и «Почему дома строят из кирпича?»;
render worker рендерит сцены, FFmpeg собирает ролик.

---

## 2026-11-10 — Research: subject assets, нормализация и форматы роликов (ADR-0015)

**Цель:** выполнить исследовательский бриф
`docs/workspace/research/2026-11-10-asset-pipeline-and-format-research-plan.md` (E0–E8, гейты
G1–G5) и зафиксировать решения по subject-слою, форматам MVP и границе M3.4/M3.5/M3.6.

**Сделано (только документы, код не менялся):**

- `docs/workspace/research/2026-11-10-asset-pipeline-and-format-research.md` — полный отчёт:
  аудит E0 (20 тем / 120 сцен), прототипы форматов E1, bake-off ассетов E2, консистентность
  персонажей E3, точность диаграмм E4, схема библиотеки и нормализации E5, unit economics E6,
  ответы на 10 research questions и прохождение гейтов G1–G5.
- `docs/adr/0015-subject-assets-and-mvp-formats.md` — D1–D6: три формата MVP
  (`hud-data-explainer`, `subject-cutout-explainer`, `cartoon-hud-story`), трёхуровневая
  воронка ассетов (Tier 0 стартовый SVG-пак → Tier 1 Recraft Vector / FLUX.2 Klein + Vectorize
  → Tier 2 FLUX.2 + BiRefNet), обязательная нормализация палитры, параметрический
  `cartoon-character`, запрет AI-схем с запечённым текстом, уточнение границы M3.4/M3.5/M3.6.
- `docs/adr/0014-m3-renderer-first-roadmap.md` — статус дополнен ссылкой на ADR-0015; D2–D4
  уточнены (стартовый SVG-пак и `subject`-слой в M3.4/M3.5, состав `ImageProvider` в M3.6).
- `ROADMAP.md` — M3.4–M3.6 переписаны под ADR-0015: M3.4 включает `image`/`subject` слой и
  `public/assets/starter/`; M3.5 использует стартовый пак вместо облачной генерации; M3.6
  описывает воронку Tier 0–2, OKLab-нормализацию, `cartoon-character` и `studio_flat_2d_v1`.
  Строка «Следующие сессии» без изменений по порядку (M3.4 → M3.7).
- `AGENTS.md` — строка стека `Images / Vectors` расширена (Recraft Vector + fal.ai FLUX.2 /
  BiRefNet, коммерческие ограничения `[dev]` и self-host `Bria RMBG 2.0`) и добавлено hard
  rule 10: AI не рисует технические диаграммы с подписями/стрелками.
- `apps/render-worker/AGENTS.md` — правила ассетов и стиля уточнены: стартовый SVG-пак
  `public/assets/starter/`, запрет реальных фото и AI-схем с запечённым текстом, все подписи и
  выноски рисует Remotion.
- `docs/workspace/plans/2026-11-10-m3-4-scene-recipes-session.md` — бриф M3.4 обновлён: добавлены
  `subject`-слот и валидация `assetKey` по списку стартовых ключей, слой `image`/`subject`
  (больше не `null`), стартовый пак 10–16 SVG без `<text>`, обязательный ADR-0016 для формы
  контракта рецепта, тесты на существование/валидность ассетов, обновлённые риски и
  deliverables.

**Ключевые выводы (что изменилось по сравнению с исходным планом):**

- Покрытие M3.3 без subject-ассетов — ~15% тем (32.5% сцен); после M3.4 — ~35–40% тем
  (~57% сцен). Оставшиеся темы упираются в предметный слой, не в движок.
- Цена SVG в Recraft оказалась в 3.5–6 раз ниже baseline: V4 Vector $0.055, V4.1 Vector $0.088
  (а не до $0.30 за Pro). Связка `FLUX.2 Klein ($0.009) + Recraft Vectorize ($0.011) = $0.020`
  за SVG — самый дешёвый путь к вектору.
- `FLUX.2 [klein] 4B` (Apache 2.0) и `BiRefNet v2` (MIT) — коммерчески чистые; self-host
  `Bria RMBG 2.0` (CC BY-NC 4.0) и `FLUX [dev]` — нет.
- Технические диаграммы нельзя генерировать нейросетью: только процедурные слои или
  проверенный SVG без текста с выносками в Remotion.
- Порядок M3.4 → M3.5 → M3.6 сохранён; конфликт G5 решён переносом **локального** стартового
  SVG-пака в M3.4–M3.5, а облачной генерации/библиотеки — в M3.6.

**Проверено:** только чтение репозитория и веб-прайсов провайдеров (Recraft, fal.ai, BFL,
BiRefNet/Bria, Remotion docs, Pixabay API, Open Peeps/DiceBear); `pnpm check` не запускался,
код не менялся. Числа себестоимости — расчётная модель, не замер `provider_usage`; проверка на
реальных прогонах остаётся за E6.

**Следующая сессия:** M3.4 — Scene Recipes v1 по обновлённому промпту
`docs/workspace/plans/2026-11-10-m3-4-scene-recipes-session.md`.

### Теория сессии

- **Потолок продукта задаёт словарь компонентов, а не движок.** Remotion умеет всё, что
  выражается React/SVG на кадре N; ограничение — какие primitive'ы и ассеты мы разрешаем в
  рецепте.
- **Subject-слой — это контракт данных, а не папка с картинками.** `assetKey` в рецепте +
  `resolveAssetKey`/`assetUrl` дают детерминизм и отсутствие сети в рендере; библиотека и
  генератор подключаются позже за тем же ключом.
- **Стоимость масштабируется по воронке, а не по модели.** Tier 0 ($0, локально) закрывает
  большинство иконок; платить стоит только за уникальный предмет, и то по цене вектора
  ($0.055–0.088), а не за «премиум-модель».
- **Стиль держится на нормализации, а не на промптах.** Квантование палитры в `style.assetPalette`
  делает сторонний SVG похожим на авторский; без него любой микс источников выглядит как разные
  ролики.
- **Идентичность персонажа в 2D дешевле получить ригом, чем генерацией.** 5 состояний лица и
  аксессуары дают 100% консистентность за $0 и без липсинка.
- **AI ошибается предсказуемо:** структура и подписи диаграмм — худший кейс; поэтому схема
  разделяется на геометрию (SVG/Remotion) и текст (JSON), а генерация отвечает только за
  изолированный объект без надписей.
- **Инфраструктура после доказательства языка.** Сначала рецепт + локальный ассет + сквозной
  ролик, потом очередь, БД-библиотека и платные API — иначе оптимизируем то, чего ещё нет.

## 2026-11-10 — M3.3: renderer foundation (data-driven Remotion)

**Ветка:** `feat/m3-3-renderer-foundation` (от `main`).

**Цель:** Remotion рендерит произвольный валидный `storyboard.v1` через CLI, params доходят до
компонентов с диагностикой, неизвестный компонент падает явно, video target вынесен в
контракты, локальные ассеты имеют механизм.

**Таблица «текущее → требуемое» (составлена до правок):**

| Область | Текущее поведение | Требуемое изменение |
|---|---|---|
| Params | `implementation.params`/`fallback.params` — JSON, который никто не читает | Zod-схема + defaults для каждого `componentId`; `parseComponentParams()` → `{ params, diagnostics }` |
| Диагностика | нет; ошибка входа не видна | `params_missing` / `invalid_value` (path, received) / `unknown_key`; default только проблемного поля (`$` — для всего объекта) |
| Mapping | `{ componentId, source }`, generic-ветка `kinetic-typography` | `{ componentId, params, source, diagnostics }`; generic-ветки нет; нет ни implementation, ни реализованного fallback → typed error |
| Компоненты | `ParallaxCity`/`KineticTypography` читают только `scene`/`style` | Читают `params`: `buildingsSeed`, `lamp`, `snowDensity`, `focus`, `roadGlow`; `text`, `accentWords`, `preset`, `align`, `underline` |
| Composition | Сам вызывает `resolveSceneComponent(scene)` | Получает resolved `componentId`/`params` в input props; `source`/`diagnostics` не передаются в компонент |
| Fixture CTA | `fallback.componentId: 'cta-card'` (не реализован) | Fallback в данных → `kinetic-typography`; фикстура продолжает рендериться без generic-подмены |
| Video target | `SCENE_*` в render-worker и `RENDER_TARGET` в worker живут отдельно | `VIDEO_TARGET` в contracts; Remotion и FFmpeg мапят его каждый по-своему; цветовые флаги FFmpeg не добавляются без `ffprobe` |
| CLI | только `render-fixture`, fixture импортируется в composition | `render-storyboard --input <json> [--scene] [--out]`; fixture импортируется только в CLI; `composition/` и `components/` не знают фикстуру |
| Пример | нет | `apps/render-worker/examples/custom-storyboard.json` — другая тема, только реализованные компоненты, другие params |
| Ассеты | нет | `public/assets/`, `bundle({ publicDir })`, `staticFile` + чистый resolver (local/http/data) с тестом |
| Манифест | fixture/runId/сцены, без params | kind, input, runId, styleId, scene component/source/params diagnostics, размеры/время |
| Тесты | mapping без params, нет boundary test | params defaults/invalid/missing/unknown, mapping fallback/error, custom JSON, boundary test, video-target adapters |

**Сделано:**

- `packages/contracts/src/storyboard.components.ts` — Zod-схемы и defaults для всех шести
  `componentId`; `parseComponentParams()` возвращает `{ params, diagnostics }` с
  `params_missing` / `invalid_value` (path + received, в т.ч. `accentWords.1`) /
  `unknown_key`; неизвестный компонент → `UnknownStoryboardComponentError`.
- `packages/contracts/src/video.ts` — единая спецификация `VIDEO_TARGET` (1080×1920/30,
  h264, `yuv420p`, BT.709, без аудио). Экспортирована из `contracts/index.ts`.
- Fixture CTA: `fallback.componentId` изменён с нереализованного `cta-card` на
  `kinetic-typography` (данные, не скрытая подмена). Остальные fallback'и уже реализованы.
- `apps/render-worker/src/mapping.ts` — resolved scene
  `{ componentId, params, source, diagnostics }`; generic-ветка удалена; оба
  нереализованных компонента дают `UnsupportedSceneComponentError`; `resolvedScenePropsSchema`
  отрезает `source`/`diagnostics` перед Remotion.
- `props.ts` — `resolved` в input props + нейтральные preview-props вместо импорта фикстуры;
  `SceneComposition` больше не выбирает компонент, а рендерит по resolved union; `render.ts`
  резолвит сцену один раз и возвращает component/source/diagnostics в CLI.
- `ParallaxCity` читает `buildingsSeed`, `lamp`, `snowDensity`, `focus`, `roadGlow`;
  `KineticTypography` — `text`, `accentWords`, `preset`, `align`, `underline` (ghost-headline,
  акцентные слова, pill/outline, подчёркивание). Значения видны в кадре.
- `render.ts`: `bundle({ publicDir })`, `SCENE_RENDER_MEDIA_OPTIONS` из `VIDEO_TARGET`;
  `assets.ts` — чистый resolver `local | http | data` + `staticFile`/`assetUrl`,
  `public/assets/test-scene.svg`.
- `cli.ts`: `render-storyboard --input <json> [--scene] [--out]`, валидация `storyboardSchema`
  с понятными путями; `render-fixture` остался shortcut'ом; манифест (`render-fixture.json` /
  `manifest.json`) содержит kind/input/runId/styleId/component/source/diagnostics/размеры/время.
- `apps/worker/src/media/video-target.ts` — FFmpeg-адаптер спецификации; `ffmpeg.ts` и
  `visual-track.ts` берут размеры/fps/кодек/pix_fmt из него. Цветовые флаги не добавлялись.
- Тесты: contracts 11 новых (params), render-worker mapping/props/assets/boundary/examples/
  video-target, worker video-target. Boundary test падает, если `render.ts`, `composition/**`
  или `components/**` упомянут fixture-символы.
- Docs: ADR-0012 раздел M3.3, README (команда и путь к примеру). `AGENTS.md` не менялся —
  правила уже описывали именно это поведение.

**Принятые решения:**

- **CTA fallback** — изменён в данных на реализованный `kinetic-typography`, а не реализован
  новый `cta-card`: это дешевле и не раздувает scope; `cta-card` остаётся на M3.4+.
- **`image-parallax` stretch не взят.** Локальные ассеты — только механизм (`publicDir`,
  `staticFile`, resolver, тестовый SVG). Визуальное потребление ассетов — M3.6.
- **FFmpeg color flags не добавлены:** `ffprobe` до и после показывает bt709 на клипах и на
  склейке; менять кодирование вслепую запрещено планом.
- **Resolution один раз:** `render.ts` резолвит сцену, composition получает только
  `componentId`/`params`; `source`/`diagnostics` остаются в CLI/манифесте и в компонент не
  попадают.

**Проверено:**

- `pnpm check` — зелёный: contracts 114, render-worker 49, worker 100, web 124, API 64,
  storage 3, db 3, tiktok 28 (485 тестов); lint/typecheck/build проходят; initial bundle
  326.09 kB.
- `render-fixture` — 6 сцен, **143.3 с** на dev-машине; `render-storyboard` с
  `examples/custom-storyboard.json` — 4 сцены, **75.0 с**.
- `ffprobe`: все клипы — h264, 1080×1920, 30 fps, `yuv420p`, `color_range=tv`,
  `color_space/primaries/transfer=bt709`, аудиодорожки нет. Длительности 6/8/8/6 с.
- Склейка через обновлённый `buildVisualConcatArgs`: 28.0 с, 1 935 695 байт, те же
  h264/1080×1920/30/`yuv420p`/bt709, без аудио.
- Детерминизм (custom scene 0): полный прогон, одиночный рендер и рендер после scene 1 в том
  же процессе дали **одинаковый SHA-256** и одинаковый `framemd5`; вариант только с
  `buildingsSeed: 2027` отличается по SHA-256 и по раскладке зданий (фонарь/текст/кадр на
  месте).
- Невалидные params (`buildingsSeed: "hello"`, `snowDensity: -100`): сцена рендерится на
  дефолтах, лог и `manifest.json` содержат оба `invalid_value` с path/received.
- Storyboard с `implementation: image-parallax` и `fallback: cta-card`: CLI завершается
  ошибкой `Scene "city-hook" cannot be rendered: component "cta-card" is not implemented…`,
  exit code 1.
- Визуально проверены кадры: фикстура (город, kinetic `15 МИНУТ`, CTA `ЗДОРОВЕЕ`) и custom
  (город с lamp=left, `ТЕПЛО В КАМНЕ`, `+3 °C`, pill `ГОРОД ГРЕЕТ СЕБЯ`); params реально
  меняют кадр.
- `examples/custom-storyboard.json` проходит `storyboardSchema`, все сцены резолвятся в
  реализованные компоненты, params отличаются от фикстуры (проверяется тестом).

**Не проверено (вне scope M3.3 или требует отдельного прогона):**

- Docker-образ `peertoreel-render-worker:m3-3` собирается (`docker build -f
  infra/render-worker.Dockerfile`); Chrome Headless Shell скачивается на этапе сборки. Рендер
  custom scene 0 внутри контейнера работает (21616 мс, 507 707 байт), `public/assets` и
  `examples/` попали в образ, `ffprobe` контейнерного клипа — h264/1080×1920/30/`yuv420p`/bt709,
  без аудио.
- Кросс-платформенный пиксельный паритет Windows↔Docker не подтверждён: декодированный кадр
  той же сцены отличается (шрифтовой/Chrome-растеризация), хотя формат и параметры совпадают.
  Детерминизм проверен в пределах одной платформы.
- Финальная сборка с озвучкой/loudnorm не перезапускалась: проверен concat и метаданные, а не
  полный draft с ASS/аудио. Изменение в `ffmpeg.ts` — только общий codec-адаптер.
- `camera.shot`, `camera.parallax`, `scene.transition`, `effects`, рецепты, DeepSeek,
  `scene-render` queue, `scene_clip`, fal.ai/S3, review UI — не входили в M3.3.
- `infographic-gauge`, `image-parallax`, `particle-field`, `cta-card` по-прежнему не
  реализованы; их сцены обязаны иметь явный реализованный fallback.

**Следующая сессия:** M3.4 — Scene Recipes v1 по промпту
`docs/workspace/plans/2026-11-10-m3-4-scene-recipes-session.md`.

### Теория сессии

- Params — такой же контракт, как форма JSON: без Zod-схемы «любой объект» превращается в
  набор магических ключей, которые никто не проверяет.
- Диагностика на уровне поля важна потому, что один `.catch()` на весь объект теряет путь:
  рендер выживет, но причина деградации исчезнет из логов.
- Resolved scene разделяет два решения: «что рендерить» (mapping/fallback) и «как рисовать»
  (компонент). `source` остаётся снаружи, чтобы компонент не мог передумать.
- Явная ошибка неизвестного компонента лучше generic-заглушки: заглушка скрывает дыру в
  библиотеке и ломает доверие к визуальному результату.
- Video target — спецификация, а не объект опций: Remotion и FFmpeg по-разному выражают одно
  и то же, и слепое копирование флагов между ними ломает уже проверенный output.
- `random(seed)` в Remotion — чистая функция от ключа, поэтому детерминизм достигается
  пространством имён seed'ов, а не хранением состояния.
- Порядок сцен не должен влиять на кадр: один bundle и один процесс не значат общий mutable
  state; тест «scene 0 после scene 1» это проверяет.
- Boundary test на fixture — дешёвая защита от возврата к «рендереру одной темы»: он падает
  не на поведении, а на импорте.
- Локальные ассеты должны быть входными данными (`staticFile`/ключ), а не сетевым вызовом из
  компонента: иначе рендер сцены зависит от S3/fal.ai и перестаёт быть детерминированным.

## 2026-11-10 — Roadmap reset: renderer-first, recipes, end-to-end

**Цель:** сверить read-only аудит с планом из пяти этапов, пересобрать M3 без преждевременной
очереди/asset system и подготовить промпт следующей сессии.

**Сделано (только документы, код не менялся):**

- Проведён read-only аудит пайплайна: Remotion не подключён к API/worker/S3; render stage
  использует Pixabay + FFmpeg; `params`, `camera.shot`/`parallax`, `transition`, `effects`,
  `refs` и `imagePrompt` рендерером не читаются; `scene_clip`/`storyboard_json` не имеют
  producer/consumer; `mapping.ts` молча уводит неизвестный компонент в `kinetic-typography`.
- `ROADMAP.md`: M3.3–M3.7 пересобраны в порядке renderer-first → recipes → end-to-end spike →
  asset library/generator → production hardening. Старые номера M3.4–M3.8 переопределены;
  M3.1/M3.2 остаются DONE.
- `docs/adr/0014-m3-renderer-first-roadmap.md`: решения D1–D7 (data-driven renderer, recipes
  before queue, two-topic spike, assets after vocabulary, hardening last, explicit unknown
  components, one style v1).
- `docs/adr/0012-storyboard-and-scene-render.md`: статус дополнен ссылкой на ADR-0014.
- `apps/render-worker/AGENTS.md`: правила data-driven рендера, params, camera, assets,
  determinism, timing, output, recipes, tests.
- `AGENTS.md`: добавлен render-worker в app-specific список; обновлены M3.3 renderer, video gen
  (M4.8), stage table (topic-discovery/research planned, `scene_clip` M3.7, `ImageProvider`
  M3.6), SSE↔polling, таблицы БД (implemented vs planned), очередь `scene-render` (M3.7),
  testing targets и hard rule 9 (unknown component fails explicitly).
- `apps/api/AGENTS.md`: список модулей приведён к фактическому (`runs`, `publish`, `system`,
  `health`, `storage`, `database`, `redis`, `config`, `common`; остальные — planned).
- `docs/workspace/plans/2026-11-10-m3-3-renderer-foundation-session.md`: готовый промпт следующей
  сессии (data-driven CLI, params, explicit unknown components, unified video target, local
  asset mechanism, acceptance/commands).
- Промпт M3.3 уточнён по ревью: invalid params ≠ missing params (per-field default +
  diagnostics), resolved scene (`componentId/params/source/diagnostics`, компонент не знает
  `source`), video target как спецификация с отдельными адаптерами Remotion/FFmpeg,
  обязательный `examples/custom-storyboard.json` + boundary test, проверки seed/order
  determinism, правило «сначала таблица текущее → требуемое, без рефакторинга вне scope».

**Сильные расхождения с аудитом (осознанно приняты):**

- Аудит ставил `scene-render` queue и `scene_clip` в Phase 2; новый план — M3.7. Причина:
  сначала доказать визуальную связность на двух темах, потом строить очередь. M3.5 использует
  CLI/скрипт и существующий `buildVisualConcatArgs`.
- Аудит ставил asset resolver/generator в Phase 3; новый план — M3.6. Следствие: M3.5 —
  ограниченный spike на procedural/SVG, не «любой промпт». Произвольные темы блокируются до
  M3.6.
- Аудит предлагал vision QC раньше; новый план — M3.7. Компенсация: в M3.5 обязателен ручной
  визуальный review, автоматический QC не обещаем.
- Текущий `mapping.ts` нарушает требование «не маскировать неизвестный компонент»; M3.3
  удаляет generic fallback. Фикстура CTA имеет `cta-card` fallback, который не реализован —
  в M3.3 нужно либо заменить fallback в данных на реализованный, либо сделать минимальный
  `cta-card`.
- `apps/api/AGENTS.md` и root `AGENTS.md` содержали несуществующие модули/таблицы/SSE;
  исправлено на фактическое состояние с пометкой planned.
- `processScriptStage` не проверяет `RESEARCHING` (в отличие от остальных стадий) — известный
  gap, не входит в M3.3, зафиксирован для отдельного fix.
- Research/fact-check стадии в коде нет; для «почему»-тем это остаётся фактическим риском.

**Проверено:** только чтение и документы; `pnpm check` не запускался, код не менялся.
**Следующая сессия:** M3.3 по промпту
`docs/workspace/plans/2026-11-10-m3-3-renderer-foundation-session.md`.

## 2026-11-09 — AGENTS.md: разбивка по приложениям

**Цель:** разгрузить корневой `AGENTS.md`, который грузится в каждую сессию целиком, и убрать
дубли источников правды.

**Сделано:**

- Корневой `AGENTS.md` — 22.2 → 15.2 КБ (284 → 238 строк): остались продукт, карта репо,
  стек, пайплайн + state machine, инварианты данных, лимиты очередей, правила TikTok,
  Shared-конвенции, тесты и hard rules.
- Новые вложенные файлы, которые OpenCode подхватывает при работе в каталоге (а не в каждой
  сессии):
  - `apps/web/AGENTS.md` — Angular + frontend data layer (перенесено дословно);
  - `apps/api/AGENTS.md` — NestJS-модули, Drizzle, миграции, транзакции;
  - `apps/worker/AGENTS.md` — BullMQ, идемпотентность, retry, FFmpeg;
  - `packages/tiktok/AGENTS.md` — OAuth/PKCE, refresh rotation, upload, publish flow.
- Удалены дубли: таблица `Roadmap` (источник — `ROADMAP.md`), DDL-блок data model (источник —
  `packages/db/src/schema.ts`), детали TikTok-флоу (переехали в `packages/tiktok`).
- В §8 добавлено правило: app-specific правило идёт в ближайший `AGENTS.md`, корень — только
  сквозные правила; field list / milestone table / flow в локальные файлы не копировать.
- Hard rule 8 переписана: ADR + обновление ближайшего `AGENTS.md`, milestone-изменения — ещё и
  `ROADMAP.md`.
- `.opencode/agents/reviewer.md`: читает корневой и локальный `AGENTS.md`; исправлен лимит
  Pixabay (было 200 req/hour, верно 100 req/60 s, как в §6 и hard rule 3).

**Проверено:**

- Скриптовая сверка: каждая непустая строка старого `AGENTS.md` найдена в новом наборе файлов
  либо изменена сознательно (удалённые дубли, переименованные заголовки, ссылки вместо
  продублированного текста).
- нумерация §1–§11 сохранена, поэтому существующие ссылки `AGENTS.md §5/§7/§9` в ADR,
  `todo.md` и `SESSION_LOG.md` остаются валидными.
- Код не менялся, тесты не требовались.

**Следующая сессия:** по плану `ROADMAP.md`.

## 2026-11-09 — M3.2: render worker на Remotion + рендер фикстуры «−15°»

**Цель:** отдельный `apps/render-worker` рендерит сцены раскадровки в беззвучные
1080×1920/30 mp4, пригодные для текущей FFmpeg-сборки; проверить это на фикстуре.

**Сделано:**

- `apps/render-worker` (`@peertoreel/render-worker`): React/Remotion существует только здесь;
  TypeScript, `tsx`, Vitest, oxlint, отдельные `tsconfig.json`/`tsconfig.build.json`.
- `src/composition/`: композиция `Scene` (`SceneComposition`), `calculateMetadata()` считает
  `durationInFrames = round(scene.durationSec * 30)`, `inputProps = { scene, style, wordTimings? }`,
  Zod-валидация на входе.
- `src/components/`:
  - `ParallaxCity` — ночной город, два плана зданий, снег, фонарь, дорога, камера
    (pan/zoom/tilt/dolly/orbit), детерминированный `random(seed)`;
  - `KineticTypography` — тёмный фон, сетка, акцентное свечение, zoom по `camera.speed`;
  - `SceneObjects` — общий слой объектов: текст с pill-подложками, снег/пар, конусы света,
    иней, силуэт автомобиля, шкала батареи; появление/исчезновение по окнам и
    `syncToWord`-акценту.
- `src/mapping.ts` — в M3.2 реализованы только `parallax-city` и `kinetic-typography`;
  image/ai-сцены и неизвестные компоненты деградируют в `fallback`, затем в generic
  `kinetic-typography`. Ни одна сцена фикстуры не падает.
- `src/timing.ts` — перевод абсолютных окон объектов в clip-local секунды, поиск
  `syncToWord` по нормализованному токену, округление до миллисекунд.
- `src/render.ts` — `bundle()` один раз на процесс, `selectComposition()` + `renderMedia()`:
  h264, `yuv420p`, `bt709`, CRF 18, `concurrency: 1`, `muted: true`; выход без аудиодорожки.
- `src/cli.ts` — `render-fixture [--scene <idx>] [--out <dir>]`, пишет `scene-<idx>.mp4` и
  `render-fixture.json` с длительностями/размерами/временем; `src/ensure-browser.ts` —
  `ensureBrowser()` для Docker.
- Шрифты — локальные `@fontsource/montserrat/700.css` и `.../900.css` (woff2, OFL);
  `document.fonts.load()` для нужных весов + `delayRender()`/`continueRender()`.
- `infra/render-worker.Dockerfile`: Node 24 bookworm-slim, Chrome-зависимости,
  Remotion-managed Chrome Headless Shell, сборка contracts + render-worker.
- `.dockerignore`, `apps/render-worker/out/` в `.gitignore`.

**Проверено:**

- `pnpm check` — зелёный: contracts 104, render-worker 23, storage 3, tiktok 28, db 3,
  web 124, worker 96, API 64 (445 тестов), сборка проходит; initial bundle 326.09 kB.
- `pnpm --filter @peertoreel/render-worker render-fixture` — 6 сцен, 60 с суммарно,
  **140.1 с** на dev-машине. Docker-контейнер (non-root) — **147.6 с**.
- `ffprobe`: каждая сцена — h264, 1080×1920, 30 fps, `yuv420p`, `color_range=tv`,
  `color_space=bt709`, аудиодорожки нет; длительности 5.2/7.4/6.3/11.1/20/10 с.
- Склеивание через существующий `buildVisualConcatArgs` (`apps/worker/src/media/visual-track.ts`):
  `joined.mp4` — 60.0 с, 4 112 505 байт, 1080×1920/30, `yuv420p`, без аудио.
- Визуально проверены кадры: город/снег/фонарь/`-15°`, машина с паром, шкала `-40%`,
  `15 МИНУТ` + pill, машина с фарами, `ЗДОРОВЕЕ`/`ПОДПИСАТЬСЯ`. Кириллица отображается
  локальными шрифтами.
- Docker-образ `peertoreel-render-worker:test` собирается; контейнер рендерит все 6 сцен
  с volume-mount.

**Не проверено (вне scope M3.2):**

- `scene.transition` пока не рендерится: клипы склеиваются жёсткими cut'ами; переходы
  внутри окна сцены — M3.3/M3.4.
- Очередь `scene-render`, per-scene jobs, S3-запись `scene_clip` — M3.4.
- Полная библиотека из 6 компонентов (`image-parallax`, `infographic-gauge`,
  `particle-field`, `cta-card`) — M3.3.
- AI-изображения/видео, `provider_usage` — M3.6/M3.7.
- Storyboard UI — M3.8. `visuals_json`, render/FFmpeg, API, БД, state machine не менялись.
- Docker-образ пока содержит dev-зависимости (TypeScript/Vitest/oxlint/tsx); prune или
  multi-stage runtime — M3.4.
- `RENDER_TARGET` в FFmpeg-сборке и размеры сцены в render-worker заданы отдельно; вынести
  общий video-target в contracts до M3.4.
- Платных вызовов не было; реальная озвучка в фикстуре не использовалась.

**Следующая сессия:** M3.3 — полная библиотека компонентов v1; после неё quality gate на
полном 60-секундном черновике с реальной озвучкой.

### Теория сессии

- Remotion рендерит не «весь ролик», а отдельную сцену: это сохраняет per-scene
  регенерацию и текущую FFmpeg-сборку.
- `calculateMetadata()` — единственное место, где `durationSec` превращается в
  `durationInFrames`; композиция не угадывает длительность.
- React живёт только в render-worker; Angular и основной worker не получают React-зависимостей.
- `random(seed)` вместо `Math.random()`: два рендера одной сцены дают одинаковый кадр.
- Локальные woff2 + `document.fonts.ready` убирают «прыжок» шрифта на первых кадрах.
- `muted: true` + отсутствие аудио в композиции дают клип без аудиодорожки — ровно то,
  что ждёт `visual-track.ts`.
- `bundle()` кешируется на процесс: 6 сцен не пересобирают бандл шесть раз.
- Fallback-маппинг позволяет рендерить фикстуру до появления полной библиотеки компонентов,
  не подменяя контракт раскадровки.
- Docker с закреплённым Chrome важнее, чем кажется: рендер на Windows и Linux должен давать
  одинаковый результат.

## 2026-11-09 — M3.1: контракт раскадровки `peertoreel.storyboard.v1` + фикстура «−15°»

**Цель:** зафиксировать модель данных AI-режиссёра контрактами и проверяемой фикстурой до
кода Remotion-рендера. Срез — contracts + worker imports + docs, без очередей, S3, API, БД и UI.

**Сделано:**

- `packages/contracts/src/json.ts` — рекурсивный `jsonValueSchema` / `JsonValue` и
  `jsonObjectSchema`; параметры компонентов больше не протекают как `unknown`.
- `packages/contracts/src/timings.ts` — `derivedWordSchema` / `derivedWordsSchema` /
  `DerivedWord` перенесены из worker; добавлена проверка `endSec >= startSec`.
- `packages/contracts/src/scene-part.ts` — общий `hook | beat | cta` для storyboard и
  стокового `visuals_json`, чтобы enum не разъезжался.
- `packages/contracts/src/storyboard.ts` — `peertoreel.storyboard.v1`: style, characters,
  audio, scene, objects, camera, transition, discriminated union
  `programmatic | image_animation | ai_video | hybrid`, обязательный `fallback`, версия
  сцены; проверки таймингов, окон объектов, `syncToWord` по токенам, непрерывности и
  уникальности сцен/объектов, `refs`/`refIds` по реестру персонажей, суммы длительностей и
  первого/последнего `part`.
- `packages/contracts/src/storyboard.fixture.ts` — 6 сцен «−15°» (город, машина с паром,
  аккумулятор, «15 МИНУТ», AI-видео-вставка, CTA) и детерминированные
  `wordTimingsFixture15Deg`; все `syncToWord` имеют тайминг внутри своей сцены.
- `packages/contracts/src/artifact.ts` — `storyboard_json`, `scene_clip`; русские ярлыки в
  `apps/web/.../artifact-labels.ts`.
- Worker: `DerivedWord`/`derivedWordsSchema` импортируются из `@peertoreel/contracts`;
  `deriveWordTimings()` остаётся в worker.
- `docs/adr/0012-storyboard-and-scene-render.md` — D1–D8, версия схемы, ключ сцены,
  `transition` как исходящее ребро внутри окна сцены, лицензия Remotion (≤3 человек —
  бесплатно, подтверждено 2026-11-09), `provider_usage` до M4.3.
- `AGENTS.md` §2/§3/§4/§6/§10 и `ROADMAP.md` синхронизированы с M3/M4/M5; пути к
  research/plan исправлены на фактические `docs/workspace/...` (файлы локальные, gitignored).

**По ревью (APPROVE WITH FIXES → исправлено):**

- `refs` и `implementation.refIds` зафиксированы как **id персонажей** из `characters[]`;
  `characters[].refImageKey` резолвит картинку. Добавлена проверка, что все ссылки
  существуют; в фикстуре `refImageKey: null`, поэтому image/ai_video-сцены до M3.6
  деградируют в fallback.
- `transition` — исходящее ребро в конце сцены; последняя сцена обязана быть `cut` с
  длительностью 0; переход не может быть длиннее сцены. `syncToWord` — акцент анимации,
  а `startSec` — начало видимости (хук начинается раньше слова «морозе»).
- Сцены обязаны быть непрерывными (допуск 0.05 с), а не просто не пересекаться; иначе
  возможна визуальная дыра при разрыве меньше секунды.
- Добавлены уникальность `scene.id`, уникальность `object.id` внутри сцены и требование
  `content` для `text`/`character`/`image`/`chart`. Покрыт `hybrid`-branch.
- `AGENTS.md` дополнен `apps/render-worker`, Remotion, очередью `scene-render` и новыми
  артефактами с пометками M3.2/M3.4/M3.5; scope M3.1 в ADR больше не утверждает, что
  worker-импорты не менялись.

**Проверено:**

- `pnpm check` — зелёный: contracts 102, storage 3, tiktok 28, db 3, web 124, worker 96,
  API 64 (420 тестов), сборка проходит; initial bundle 326.09 kB.
- `storyboardFixture15Deg` проходит `storyboardSchema.parse`; round-trip JSON;
  `wordTimingsFixture15Deg` проходит `derivedWordsSchema`.
- Негативные тесты: нет fallback, конец раньше начала, несовпадение `durationSec` с окном,
  `syncToWord` вне текста, окно объекта вне сцены, разрыв/пересечение сцен, поздний старт,
  неизвестный `componentId`, неизвестный персонаж, дубли id, последняя сцена не `cut`,
  текст без `content`, невалидный цвет/`schemaVersion`, не-JSON params.
- Worker и web собираются после переноса типов; `pnpm --filter @peertoreel/worker typecheck`
  и `pnpm --filter @peertoreel/web typecheck` — чистые.

**Не проверено (вне scope M3.1):**

- Реальный рендер сцен: Remotion, Chrome, шрифты, `apps/render-worker` — M3.2.
- Очередь `scene-render`, оркестратор и запись `scene_clip` в S3 — M3.4.
- Генерация раскадровки DeepSeek — M3.5; `image_animation`/`ai_video` — M3.6/M3.7.
- Storyboard UI — M3.8. `visuals_json`, render/FFmpeg, API, БД и state machine не менялись.
- Платных вызовов не было.

**Следующая сессия:** M3.2 — render worker bootstrap (Remotion), `parallax-city` и
`kinetic-typography`, рендер 6 сцен фикстуры в mp4; лицензия Remotion — бесплатный tier
(≤3 человек).

### Теория сессии

- Раскадровка — это контракт между AI-режиссёром и движком: LLM отдаёт постановку в JSON,
  а не код и не пиксели, поэтому один и тот же вход детерминированно исполняется компонентами.
- `word_timings.json` — источник истины по времени; `durationSec` сцены производная, иначе
  картинка начнёт спорить с озвучкой.
- `syncToWord` проверяется по токенам, а не подстрокой: «кот» не должен совпадать с
  «который», иначе анимация привяжется к случайному слову.
- `syncToWord` — акцент анимации, а `startSec` — начало видимости; поэтому заголовок хука
  может появиться раньше слова, на котором он «вспыхивает».
- Обязательный `fallback` на каждой сцене превращает отказ AI-продюсера в деградацию одной
  сцены, а не в `FAILED` всего run'а.
- `JsonValue` вместо `unknown` сохраняет публичные типы проверяемыми: параметры компонентов
  открыты по форме, но закрыты по типу.
- `transition` в v1 — исходящее ребро в конце сцены; у последней сцены нет наследника,
  поэтому только `cut` с нулевой длительностью. Перекрытие таймлайна (xfade с handles) —
  отдельное решение, иначе сумма сцен перестаёт сходиться с длительностью аудио.
- `scene.refs`/`implementation.refIds` — id персонажей, а не ключи S3: картинка резолвится
  через `characters[].refImageKey`, поэтому реестр персонажей остаётся единственным.
- Фикстура «−15°» — не продуктовая тема, а golden sample: она покрывает programmatic,
  image_animation и ai_video ветки, а `hybrid` проверяется отдельным тестом; LLM, TTS и S3
  для неё не нужны.
- Контракты проверяются до появления рендера: ошибка в схеме стоит минуты, ошибка в
  формате на этапе M3.4 стоила бы переделки очереди и артефактов.

## 2026-11-08 — fix(web): убрать протухающий Vite-кэш для `@peertoreel/contracts`

**Цель:** после добавления экспорта в контракты web больше не падает с
`does not provide an export named '<schema>'` и не требует ручной чистки `.angular/cache`.

**Причина:** Vite пре-бандлил `@peertoreel/contracts` в `apps/web/.angular/cache`, а ключ
кэша зависимостей не зависит от содержимого `packages/contracts/dist` — новый `dist` не
инвалидировал пре-бандл, поэтому ни перезапуск `pnpm dev`, ни Ctrl+Shift+R не помогали.

**Сделано:**

- `apps/web/angular.json`: `serve.options.prebundle.exclude: ["@peertoreel/contracts"]` —
  контракты собираются в чанки приложения, кэш зависимостей на них больше не влияет.
- `apps/web/package.json`: `zod` объявлен зависимостью web — исключённые контракты
  импортируют `zod`, и в pnpm-изоляции Vite не резолвил его из корня приложения
  (`Failed to resolve import "zod"`).
- `pnpm dev` запускает `contracts` в watch-режиме: dev-сервер web пересобирается на
  изменение `packages/contracts/dist`, перезапуск не нужен.
- `apps/web`: скрипт `clean` (удаляет `.angular/cache`) как аварийный выход.
- README: troubleshooting переписан под постоянное решение вместо ручной чистки кэша.

**Проверено:**

- Cold start после `pnpm --filter @peertoreel/web clean`: в `vite/deps` нет
  `@peertoreel_contracts.js`, есть `zod.js`; контракты внутри чанков приложения.
- Правка `packages/contracts/dist` при запущенном dev-сервере → `Changes detected` и
  пересборка; новое значение попало в чанк без перезапуска.
- Браузер: `/login` и ленивые маршруты грузятся без ошибок в консоли; нужный экспорт
  (`tiktokPublishAvailabilitySchema`) присутствует в чанках.
- `pnpm --filter @peertoreel/web typecheck`, `test` (124) и `build` — зелёные.

## 2026-11-08 — M1.2b: очередь публикации + кнопка в publish card

**Цель:** публиковать в TikTok из UI, без CLI-команды, с прогрессом и без дублей.

**Сделано:**

- Контракты: очередь `publish`, job `tiktok-publish`, детерминированный `publish-<runId>`,
  `tiktokPublishAvailability` (аккаунт + снапшот job).
- API: `POST /runs/:id/tiktok-publish` (202; проверяет `SCHEDULED`, карточку, явную
  приватность, активный аккаунт и scope `video.publish`), `GET .../tiktok-publish/job`,
  `GET .../tiktok-publish` для восстановления после F5. Очередь `PublishQueue` с
  дедупликацией job id.
- Worker: процессор `publish` — `SCHEDULED → PUBLISHING → PUBLISHED/FAILED` с audit-записями;
  `publish_id` пишется в карточку до чанков, повторный job возобновляет status-polling вместо
  нового `video/init`; терминальные ошибки → `UnrecoverableError`, финальный retry помечает
  run `FAILED` с `resume_state=SCHEDULED`. Общий token-lock с API.
- Web: в publish card секция TikTok — аккаунт, кнопка «Опубликовать в TikTok», прогресс,
  ошибки, результат; кнопка недоступна без сохранённой приватности и подключённого аккаунта;
  форма сохраняется перед постановкой job'а; job восстанавливается после перезагрузки и
  поллится каждые 1.5 с; карточка показывается и в `PUBLISHED` (read-only).
- ADR-0013, AGENTS §4/§6/§7/§9, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 61, tiktok 28, storage 3, db 3, web 124, worker 96,
  API 64 (379 тестов), сборка проходит.
- Живой API на run `5a931675-aa79-4748-beb6-bede83a8eb53`:
  - `POST /runs/:id/tiktok-publish` → 202, job `publish-<runId>`;
  - job completed, run `PUBLISHED`, карточка `published`, `published_at` записан;
  - `publish_id` из предыдущего spike переиспользован — **второго поста не создано**
    (idempotency через status-polling);
  - `post_id=7705631453408808000`.
- Найдено и исправлено: TikTok отдаёт `publicaly_available_post_id` как JSON-число int64
  (больше `Number.MAX_SAFE_INTEGER`) — схема теперь принимает string|number, но точность
  post_id в JS может теряться; webhooks M1.2c вернут строку.

**Не проверено:**

- Браузерный клик по кнопке (API-путь и store/компонент покрыты тестами; живой прогон шёл
  через тот же endpoint).
- Свежий `video/init` из очереди: живой прогон был resume по существующему `publish_id`;
  сам upload уже проверен spike'ом M1.2a.
- Webhooks, rate limiter, выбор аккаунта, автошедулинг — M1.2c.

**Следующая сессия:** M1.2c (webhooks/rate limiter/аккаунты) или M3.1 (storyboard contract).

### Теория сессии

- Кнопка публикации — это не HTTP-запрос, а очередь: внешний upload дольше HTTP-таймаутов и
  должен переживать F5.
- Детерминированный `publish-<runId>` + `publish_id` в карточке дают идемпотентность: retry
  возобновляет статус, а не создаёт второй пост.
- Явная приватность — часть контракта: API отвечает 409, пока пользователь не выбрал уровень;
  для неaudited приложения рабочий вариант только `SELF_ONLY`.
- Ошибки TikTok делятся на terminal/retryable/token; только terminal сразу завершают run,
  остальные дают BullMQ шанс, а финальный retry помечает FAILED.
- `post_id` int64 в JSON — ловушка JS: число теряет точность, поэтому будущие webhooks с
  строковым post_id предпочтительнее.
- UI-состояние переживает reload через серверный снапшот job'а, а не через root-store.

## 2026-11-08 — Web: компоненты без конструкторов, публичный API сторов — `void`

**Ветка:** `refactor/web-lifecycle-and-void-commands` (от `main` после `3c1c85e`).

**Цель:** убрать конструкторы из компонентов и перестать отдавать `Promise` из публичного
API сторов — вызовы в компонентах должны читаться линейно.

**Сделано:**

- `BaseStore`: добавлен `run(key, factory, { onSuccess, onError, onDone })` —
  fire-and-forget команда; общее ядро `execute()` с дедупом по ключу, счётчиком `pending`
  и нормализацией `unknown` в сообщение; `command()` остался value-returning для внутренней
  оркестрации (`regenerate`) и тестов.
- Публичные методы сторов теперь `void`: `accounts.connect/disconnect/testConnection`,
  `auth.login`, `runs.create`, `run-detail.transition/runStage/regenerate`,
  `publish-card.save/markExported/markPublished`. Где вызывающему нужен результат —
  колбэк: `connect(onConsent)`, `create(onCreated)`, `markPublished(onPublished)`,
  `transition(..., onSuccess)`.
- Компоненты без конструкторов: `accounts-page`, `login-page`, `run-page`, `publish-card` —
  `implements OnInit`, побочные эффекты в `ngOnInit`, эффекты через
  `effect(..., { injector: this.injector })`.
- `publish-card.copyText` — promise-цепочка вместо `async/await` (Clipboard API),
  fallback вынесен в `copyWithFallback`.
- Тесты переписаны на `vi.waitFor` и флаш микрозадач; в `run-detail` добавлен
  `beforeEach(vi.useRealTimers)`, чтобы fake timers не протекали между тестами.

**По ревью (REQUEST CHANGES → исправлено):**

- `CommandOutcome` стал статусным (`ok | error | skipped | cancelled`) вместо пары
  `ok/message`: пропуск дубликата и отмена по `takeUntilDestroyed` больше не выглядят как
  успех, `onSuccess` на них не вызывается. Раньше `onDone` срабатывал при пропуске, и
  повторный `logout()` чистил сессию до ответа сервера.
- `logout()` чистит локальную сессию только после успешного ответа — при провале cookie
  на сервере ещё жива.
- Колбэки вызываются через `notify()` с try/catch: исключение в UI-колбэке не становится
  unhandled rejection.
- Добавлены тесты на `run()`: успех, ошибка, пропуск дубликата, уничтожение стора.
- Усилены переписанные тесты: transition проверяет повторную загрузку run, «нет relative
  id» проверяет отсутствие вызовов API, тест clipboard разделён на «копирование упало» и
  «Clipboard API недоступен».

**Проверки:** `pnpm typecheck`, `pnpm --filter @peertoreel/web lint`, `pnpm test`
(contracts 58, storage 3, tiktok 28, db 3, web 119, worker 91, api 60), `pnpm build` —
зелёные.

**Не сделано намеренно:** `restore()` остался `Observable` (нужен router guard), сторы
сохранили конструкторы — это DI-wiring сервиса, а не компонентный жизненный цикл.
Правила для AGENTS §8 не вносил: по hard rule 8 изменение файла требует ADR.

## 2026-11-08 — M1.2a: живая загрузка в TikTok

**Результат:** OAuth sandbox-аккаунта и `FILE_UPLOAD` в TikTok впервые прошли end-to-end.

**Путь:**

- Приложение TikTok в Sandbox: client key/secret, Login Kit + Content Posting API, scopes
  `user.info.basic` + `video.publish`.
- Из-за требования HTTPS для Web поднят временный `cloudflared`-туннель к локальному API;
  redirect URI `https://<tunnel>/api/v1/accounts/tiktok/callback` зарегистрирован в Sandbox
  Login Kit. Туннель остановлен после подключения.
- OAuth: исправлен PKCE (`code_challenge`/`code_verifier`), затем ошибка `scope` — scopes
  включены в Sandbox. Подключён приватный аккаунт `@arapashwb55` (Куклуксмаксер).
- `tiktok:spike` на новом run `5a931675-aa79-4748-beb6-bede83a8eb53` («почему собака —
  лучший друг человека?»):
  - `creator_info/query` → privacy options включают `SELF_ONLY`;
  - draft 28 125 877 байт, 2 чанка (`HTTP 206`, затем `HTTP 201`);
  - `publish_id=v_pub_file~v2-1.7705630733150406678`;
  - `status=PUBLISH_COMPLETE`, `post_id` пустой — ожидаемо для `SELF_ONLY`
    (непубличный пост);
  - карточка получила `publish_id`, run остался в `SCHEDULED`.

**Проверки:**

- `pnpm check` — 356 тестов (contracts 58, tiktok 28, storage 3, db 3, web 113, worker 91,
  API 60), сборка проходит.
- `pnpm --filter @peertoreel/web test` после no-store/cache-buster для authorize — 113.
- Живой OAuth и upload — см. выше.

**Ограничения:**

- Приложение не прошло аудит: посты только `SELF_ONLY`, публичная публикация недоступна.
- Это spike, а не очередь `publish`: run state и publish card state не двигаются; кнопка
  публикации в UI, webhooks и rate limiter — M1.2b.
- Временный `trycloudflare.com` URL живёт только пока запущен процесс; для повторного OAuth
  нужен новый туннель/домен.

**Следующая сессия:** M1.2b — очередь `publish`, кнопка в publish card, `publish_id`/`post_id`
в карточке, статус/webhooks, rate limiter.

## 2026-11-08 — fix(accounts): PKCE для TikTok OAuth

**Симптом:** после нажатия «Подключить TikTok» страница TikTok показывала
«Something went wrong / correct the following: code_challenge».

**Причина:** приложение TikTok настроено на Desktop/localhost redirect (`http://localhost`),
а TikTok требует PKCE для такого flow. Наш authorize URL не содержал `code_challenge`, а
обмен кода — `code_verifier`.

**Сделано:**

- `packages/tiktok/src/pkce.ts`: `createCodeVerifier` (48 random bytes → base64url, 64 символа)
  и `createCodeChallenge` (hex SHA-256 — так требует Login Kit desktop guide TikTok).
- `TikTokApi.authorizeUrl(state, scopes, codeChallenge?)` добавляет
  `code_challenge` + `code_challenge_method=S256`; `exchangeCode(code, codeVerifier?)`
  отправляет `code_verifier`.
- OAuth state в Redis теперь хранит `{ userId, codeVerifier }` (JSON), а не голый userId;
  callback парсит его и передаёт verifier в обмен. Старые state без verifier отклоняются.
- Тесты: PKCE verifier/challenge, authorize URL, token exchange, OAuth state/callback.

**Проверено:**

- `pnpm --filter @peertoreel/tiktok test` — 28 тестов.
- `pnpm --filter @peertoreel/api typecheck` и `test` — 60 тестов.
- Живой `/accounts/tiktok/authorize` отдаёт URL с `code_challenge` и `code_challenge_method=S256`.

**Осталось:** повторить подключение в браузере. Если TikTok вернёт ошибку redirect URI —
проверить, что `http://localhost:3000/api/v1/accounts/tiktok/callback` зарегистрирован
в том же режиме (Sandbox/Production), что и используемый client key.

## 2026-11-08 — Переименование Kadence → Peer to Reel

**Цель:** уйти от бренда `kadence` (конфликт с Kadence Themes/kadencewp.com и HR-брендом
Kadence International) до старта M3.1, пока контракт раскадровки не отгружен.

**Сделано:**

- 137 файлов: скоупы `@kadence/*` → `@peertoreel/*`, корневой пакет `peertoreel`,
  `pnpm-lock.yaml` перегенерирован через `pnpm install`.
- Cookie `kadence_session` → `peertoreel_session`; id контракта
  `peertoreel.storyboard.v1`; bootstrap-админ `owner@peertoreel.local`.
- UI: `<title>`, meta description, бренд в шапке (марка `P2R`), футер,
  «Вход в Peer to Reel»; спека `App` обновлена.
- Инфра: compose-проект `peertoreel`, Postgres user/db `peertoreel`, volumes
  `peertoreel-*`, bucket и ключи S3 `peertoreel`; CI и env-дефолты синхронно.
- Локальная инфра пересоздана: старые контейнеры и volumes `kadence-*` удалены вручную
  (проект compose переименован, поэтому `down -v` их уже не находил), затем `up -d`,
  `db:migrate`, bucket создан init-джобой.
- `docs/workspace/**` (gitignored research/prompts) намеренно не трогали — там исторический
  материал.

**Найденный баг (не связан с переименованием):** в `tiktok-token.service.spec.ts`
фикстура `now` была захардкожена на `2026-11-07T10:00:00Z`. После этой даты токен в
фикстуре считается протухшим: тест «fresh token» падал по ассерту, а «waits for another
refresh» висел до таймаута. Заменил на `new Date()` — оба теста снова зелёные.

**Проверки:**

- `pnpm lint` — ок (осталось одно старое warning про неиспользуемый `TikTokAccount`
  в `tiktok.controller.ts`).
- `pnpm typecheck` — ок.
- `pnpm test` — 353 теста: storage 3, contracts 58, tiktok 26, db 3, web 113, worker 91,
  api 59.
- `pnpm build` — ок.
- Smoke на живом API: `/api/v1/health/live` → 200; `/api/v1/health/ready` → database,
  redis, worker `up`; `POST /api/v1/auth/login` → 200 и `Set-Cookie: peertoreel_session=…`.

**Git:** история не переписывалась, переименование — один коммит. Осталось:
переименовать репозиторий на GitHub в `peertoreel`, обновить remote и сделать push.

**Локальная папка:** `Rename-Item` не сработал — каталог держит процесс OpenCode
(`access denied` даже на пустой папке). Переехали копией: `robocopy` без
`node_modules/dist/.angular/.idea`, затем `pnpm install`, `pnpm typecheck` и `pnpm test`
в новой папке (353 теста зелёные), после чего `session_move`. Пустой каталог `Kadence`
остаётся заблокированным до перезапуска приложения — удалить после рестарта.

## 2026-11-08 — Roadmap M3 «Animated Factory» + план для агентов

**Цель:** после исследования нарезать ближайшие фичи, дополнить ROADMAP и подготовить
входные данные для агентных сессий. Реализация не начиналась.

**Сделано:**

- `ROADMAP.md`: новая веха **M3 — Animated Factory** (M3.1–M3.8, acceptance = эксперимент
  «−15°» из исследования §I.2); прежние M3/M4 перенумерованы в M4/M5 с сохранением
  содержания; остатки M2 распределены (retry Pixabay → M4.6, замена сцены → M4.4);
  «Следующие сессии» переписаны под новые слайсы.
- `docs/plans/2026-11-08-animated-factory-plan.md` — данные для агентов: правила сессии и
  Definition of Done, принятые решения D1–D8 со ссылками на исследование, карта данных
  (артефакты `storyboard_json`/`scene_clip`, очередь `scene-render`, схема раскадовки),
  нарезка 8 слайсов (оценки/зависимости), детальные брифы M3.1 (контракт + фикстура +
  ADR-0012) и M3.2 (Remotion render worker), средние M3.3–M3.5, краткие M3.6–M3.8;
  справочник начальной библиотеки компонентов (6 шт. с параметрами), карта кода для
  чтения, ограничения (лицензия Remotion, детерминизм, платные вызовы только моками в CI).

**Ключевые решения нарезки:**

- Один слайс = одна сессия (код + тесты + демо + docs + SESSION_LOG + theory-блок);
  детальные брифы только для ближайших слайсов, остальные — до меры, достаточной для старта.
- Продюсеры сцен пишут `video/mp4` в существующие ключи сцен и `kind: 'video'` в
  `visuals_json` — render-стейдж и FFmpeg-сборка не меняются (минимальный дифф).
- Очередь `scene-render` — не stage-очередь (payload `{runId, sceneIdx}`), оркестрация
  остаётся в `visuals`; ADR-0012 + обновление AGENTS §10 входят в слайс M3.1 (hard rule 8).

**Следующая сессия:** M3.1 — контракт `peertoreel.storyboard.v1` в contracts, перенос
`DerivedWord` в contracts, фикстура «−15°» (6 сцен), ADR-0012, AGENTS §10.

## 2026-11-08 — Исследование: программная анимация + AI video generation (research only)

**Цель:** техническое и экономическое исследование перехода от стоковых клипов (Pixabay) к
автоматизированному созданию оригинальных анимированных видео: AI-режиссёр (раскадровка) +
программный движок + точечные AI-ассеты/видео. Код не изменялся, зависимости не ставились.

**Сделано:**

- Анализ фактического кода пайплайна (стадии, контракты, worker, render, web) и точек
  расширения; зафиксированы расхождения AGENTS.md ↔ код (SSE vs polling, отсутствие модулей
  `scripts`/`projects`/`provider_usage`, `word_timings` вне contracts и др.).
- Веб-исследование пяти направлений: движки программной анимации (Remotion/Motion Canvas/
  Revideo/HyperFrames/GSAP/Lottie/Three.js/Blender), AI video/image generation API с
  ценами и региональными ограничениями (Sora закрыт, MiniMax H3, Veo 3.1, Kling, Seedance,
  FLUX/NB/Recraft), AI coding agents (OmniLottie: параметрический JSON 82–97% vs codegen
  0–12.7%), синхронизация (Whisper не нужен; MFA только для липсинка), инфраструктура.
- Итоговый отчёт: `docs/research/2026-11-08-ai-video-production-research.md`
  (разделы A–J + краткая выжимка); сырые отчёты потоков —
  `docs/research/ai-video-image-generation-apis-2026-11-08.md`,
  `C:\Temp\opencode\ai-animation-codegen-report-2026-11-08.md`.

**Ключевые выводы:**

- Движок — Remotion 4.0.x в изолированном render worker (React только там; Plan B — Revideo
  MIT); сцены рендерятся в mp4 и собираются **существующим** FFmpeg-конвейером без изменений
  (render уже потребляет `scene.asset.objectKey`).
- Основной путь генерации сцен — библиотека параметрических компонентов + Zod-раскадровка
  (`peertoreel.storyboard.v1`), codegen — аварийный люк в песочнице.
- Себестоимость: программный ролик $0.05–0.25, гибрид $0.8–4.5, полный AI-видео $6–18.
- Первый эксперимент: тема «−15°» (референс `docs/references/Screenshot_1.png`),
  5–6 различных сцен, ≤$0.5 (≤$2 с видео-сценой), ≤15 мин рендера.

**Следующая сессия (после согласования):** H1 — контракт `storyboard.v1` в contracts +
фиксстура раскадровки для темы «−15°».

## 2026-11-07 — M1.2a TikTok OAuth + token vault + upload spike

**Цель:** подключить TikTok через Login Kit, безопасно хранить токены и проверить реальный
`FILE_UPLOAD` до постройки очереди публикации.

**Сделано:**

- `packages/tiktok`: OAuth (`authorizeUrl`, code exchange, refresh, revoke), user info,
  `creator_info/query`, `video/init`, chunked upload, `status/fetch`; AES-256-GCM
  `TokenCipher`; `planChunks` по правилам TikTok; классификация ошибок
  `token/retryable/terminal`.
- Контракты `tiktok.ts`: метаданные аккаунта, callback query, creator info; подключены к web.
- БД: `tiktok_accounts` (`user_id`, `open_id`, шифрованные токены, expiry, scope, unique
  `(user_id, open_id)`), миграция `0007`.
- API `accounts/`: `GET /accounts/tiktok`, `GET /accounts/tiktok/authorize`,
  `GET /accounts/tiktok/callback`, `GET /accounts/tiktok/:id/creator-info`,
  `DELETE /accounts/tiktok/:id`. OAuth state живёт в Redis 10 минут; callback не требует
  cookie и разрешает пользователя по state.
- Refresh: `expires_in`/`refresh_expires_in` из ответа, ротация refresh-токена, Redis-лок
  на аккаунт, 503 при недоступном Redis.
- Web: `/accounts` — подключение, список, проверка creator info, отключение; ссылка в shell.
- Worker: `tiktok:spike` — читает `SCHEDULED` run + `draft_mp4`, аккаунт из vault,
  обновляет токен, вызывает creator info, `video/init` (`is_aigc: true`, `FILE_UPLOAD`),
  грузит чанки и опрашивает статус; `--dry-run` останавливается до загрузки.
- ADR-0011; AGENTS §2/§3/§5/§7/§9; ARCHITECTURE; README; ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 58, tiktok 26, storage 3, db 3, web 113, worker 91,
  API 59 (353 теста), сборка проходит; initial bundle 326.04 kB.
- `pnpm db:migrate` — применена `0007`, таблица `tiktok_accounts` и unique-индекс на месте.
- API после добавления модуля поднимается; `GET /accounts/tiktok` без сессии → 401, с сессией
  без ключей → `200 {accounts: []}` (список не требует TikTok-конфигурации),
  `GET /accounts/tiktok/authorize` с сессией без ключей → 503 с сообщением
  «TikTok не настроен: добавьте TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI, TOKEN_ENCRYPTION_KEY».
- Unit-тесты: cipher round-trip/tamper, chunking (включая пример 50 000 123 байт), OAuth
  state/callback, ротация токенов, ошибки/классификация, store/API accounts.

**Не проверено (нужны ключи TikTok):**

- Реальный OAuth: в `.env` нет `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
  `TIKTOK_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- Реальная загрузка `tiktok:spike` и статус `PUBLISH_COMPLETE` на приватном аккаунте.
- Очередь `publish`, кнопка публикации в publish card, webhooks, rate limiter — M1.2b.

**Найдено в официальной документации (2026-11-07):**

- Access token ≈2 часа, refresh ≈180 дней, refresh-токен ротируется; старые «24 ч / 365 дней»
  в AGENTS были неверны и исправлены.
- `post_info` требует `privacy_level`, `brand_content_toggle`; `is_aigc` — optional, мы всегда
  передаём `true`.
- Для `FILE_UPLOAD`: чанки 5–64 МБ, последний может быть больше, `total_chunk_count =
  floor(size/chunk_size)`, загрузка последовательная.
- `SELF_ONLY` не возвращает `publically_available_post_id` — null post id ожидаем для
  unaudited приложения.

**Следующая сессия:** добавить ключи, подключить приватный аккаунт, прогнать `--dry-run` и
реальную загрузку; затем M1.2b — очередь `publish` и кнопка в publish card.

### Теория сессии

- Сроки жизни токенов — данные ответа, а не константы: TikTok уже менял их, и hardcode
  ломает refresh-джоб.
- Refresh-токен одноразовый: два параллельных refresh инвалидируют друг друга, поэтому
  обновление сериализуется локом, а проигравший перечитывает строку.
- OAuth state в Redis, а не в cookie: callback приходит с tiktok.com, state одноразовый и
  привязан к пользователю.
- AES-256-GCM даёт и шифрование, и проверку целостности; версия в префиксе оставляет место
  для ротации формата.
- `FILE_UPLOAD` выбран раньше `PULL_FROM_URL`, потому что не требует подтверждённого домена;
  чанки считаются по правилам TikTok, а не «по 10 МБ на глаз».
- Ошибка TikTok классифицируется до ретрая: `access_token_invalid` → refresh, 429/5xx →
  backoff, spam/auth/media → terminal.
- Upload spike не трогает state machine: сначала проверяем реальный API, потом кодируем
  очередь и audit-переходы.
- Unaudited app — это ограничение продукта, а не баг: `SELF_ONLY` и приватный аккаунт до
  прохождения аудита.

## 2026-11-06 — M1.1 Publish card + manual export

**Цель:** первый срез публикации без TikTok API: карточка публикации, автоматическое создание
при `REVIEW → SCHEDULED`, скачивание черновика/текста/JSON и ручная отметка публикации.

**Сделано:**

- Контракты `publish.ts`: privacy levels, состояния карточки, `publishCardSchema`,
  `updatePublishCardRequestSchema` (title 1–150, 0–30 хештегов, nullable privacy/scheduled,
  `isAigc` не принимается от клиента), нормализация хештегов и дефолты из темы/заголовка
  сценария.
- БД: enum `publish_card_state`, таблица `publish_cards` (`run_id` unique, `is_aigc` check,
  `title` length check, nullable TikTok-поля), миграции `0005` (создание + backfill) и `0006`
  (truncate длинных заголовков + check).
- API: модуль `publish/` (`GET`/`PUT /runs/:id/publish-card`, `mark-exported`,
  `manual-publish`), автоматическая карточка в той же транзакции, что и `REVIEW → SCHEDULED`
  (`ON CONFLICT DO NOTHING`, заголовок из `script_json` с fallback на тему).
- Ручная публикация: `SCHEDULED → PUBLISHING → PUBLISHED` одной транзакцией с guard
  `state = 'SCHEDULED'` (два параллельных запроса не публикуют дважды), две audit-записи с
  reason «Ручной экспорт» и разными timestamp, карточка `published` + `published_at`.
  Прямые переходы в `PUBLISHING`/`PUBLISHED` через `/transitions` теперь 409: эти рёбра
  принадлежат publish card.
- Web: `PublishCardApiService`, route-scoped `PublishCardStoreService` (404 → пустая форма),
  `publish-card.component` с typed reactive form, бейджем `AI-generated: да`, privacy без
  default, скачиванием видео, копированием текста (clipboard + textarea fallback), JSON и
  ручной публикацией. Сырые кнопки `SCHEDULED → PUBLISHING`/`PUBLISHING → PUBLISHED` скрыты.
- `presignGet` умеет подписывать `Content-Disposition: attachment`; для `draft_mp4` отдаётся
  отдельный `downloadUrl`, а инлайновый `url` остаётся для `<video>` и «Открыть».
- Повторное одобрение нового черновика сбрасывает устаревший `exported_at`/`state=exported`,
  сохраняя title/hashtags/privacy/scheduled.
- ADR-0010, AGENTS §4/§5/§7/§9, ARCHITECTURE, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 55, storage 3, db 3, web 98, worker 91, API 41
  (291 тест), сборка проходит; initial bundle 325.79 kB.
- `pnpm db:migrate` — применены `0005` и `0006`; в БД есть enum, таблица, unique `run_id`,
  check `is_aigc = true`, check длины title; backfill создал карточки для старых
  `SCHEDULED`/`PUBLISHED` run'ов (у legacy-карточек только title из темы, хештеги пустые).
- Живой API (сессия из `.env`, значения не выводились):
  - `GET /runs/:id/publish-card` без сессии → `401`;
  - run в `REVIEW` → `404`, `PUT` по нему → `409`;
  - `POST /transitions {"to":"PUBLISHING"}` → `409` (ребро принадлежит publish card);
  - `PUT` по `SCHEDULED` → `200`; `#пород`, `собак`, `Пород` нормализованы до
    `["пород","собак"]`; `isAigc: false` в теле проигнорирован, ответ и БД `is_aigc = true`;
  - `manual-publish` на `PUBLISHED` run → `409`;
  - `mark-exported` дважды → `state=exported`, `exported_at` не сдвинулся;
  - artifacts для `draft_mp4`: инлайновый `url` без `Content-Disposition` (206, video/mp4),
    `downloadUrl` с `Content-Disposition: attachment; filename="peertoreel-draft-<id>.mp4"`;
  - после проверок demo-карточка сброшена в `draft` с заголовком сценария и хештегами
    `["пород","собак"]`, privacy/scheduled/exported пустые.
- Сквозной smoke на одноразовом run (создан, проведён по всем переходам до `SCHEDULED`,
  удалён после проверки):
  - карточка создана автоматически в транзакции `REVIEW → SCHEDULED`, title из темы,
    hashtags `["проверка","ручной","публикации"]`, privacy пустой, `isAigc=true`;
  - `manual-publish` → карточка `published` + `published_at`, run `PUBLISHED`,
    в истории ровно две записи `SCHEDULED → PUBLISHING` и `PUBLISHING → PUBLISHED`
    с reason «Ручной экспорт».
- Не проверено живьём: браузерный click-through (скачивание/буфер/JSON) — оставлен на ручной
  сценарий пользователя; логика покрыта unit-тестами API/store/компонента.

**Найдено и исправлено на ревью:**

- прямые `PUBLISHING`/`PUBLISHED` через `/transitions` больше не принимаются (409);
- backfill мог записать title длиннее 150 → миграция `0006` + check;
- конкурентный `manual-publish` → guard в `UPDATE ... WHERE state='SCHEDULED'`, проигравший
  получает 409; обычные переходы тоже проверяют `state = fromState` (проигравший получает
  409 вместо тихого перезаписывания);
- две audit-записи в одной транзакции имели одинаковый `created_at` → вторая сдвинута на 1 ms;
- устаревший `exported_at` после нового draft → сброс при повторном `REVIEW → SCHEDULED`;
- `markExported` не может понизить `published` до `exported`;
- после ошибки загрузки карточки появилась кнопка «Повторить загрузку»;
- карточка перезагружается при повторном появлении в `SCHEDULED` (store живёт в роуте,
  `setRelativeId` с тем же id — no-op) без дублирующего GET на первом монтировании;
- скачивание видео вынесено в отдельный `downloadUrl`, чтобы не ломать `<video>` и «Открыть».

**Ограничения / осознанно не сделано:**

- Backfill не может восстановить заголовок сценария (его не было на run) — legacy-карточки
  начинаются с темы и пустых хештегов.
- Уникальность `run_id` проверена миграцией и живой БД, отдельного Testcontainers-теста нет:
  в проекте пока нет такого паттерна.
- Нет TikTok OAuth, `tiktok_accounts`, `video/init`, webhooks, rate limiter,
  auto-scheduling, `provider_usage`, `scenes`, замены сцены.

**Следующая сессия:** M1.2 — TikTok OAuth + token vault + приватная публикация.

### Теория сессии

- Enum'ы БД дублируются в `schema.ts` литералами, потому что drizzle-kit загружает схему через
  CJS и не видит ESM-only contracts; `schema.spec.ts` ловит расхождение.
- Инвариант «одобрил → карточка есть» держится транзакцией: run, событие и `publish_cards`
  пишутся атомарно, поэтому промежуточного `SCHEDULED` без карточки не бывает.
- Медленное внешнее чтение (S3) вынесено до транзакции; его сбой деградирует до темы и не
  блокирует переход.
- `ON CONFLICT DO NOTHING` делает повторное одобрение идемпотентным и сохраняет правки
  пользователя.
- Запрос не содержит `isAigc`, сервер пишет `true`, а check constraint в БД — вторая линия
  защиты продуктового правила.
- `exported_at` фиксирует первую выгрузку и не двигается повторно; `published` не
  понижается до `exported`.
- Кросс-доменная ссылка с `download` не работает без `Content-Disposition`; отдельный
  подписанный `downloadUrl` даёт настоящий download и не мешает инлайновому `<video>`.
- Условный `UPDATE ... WHERE state = 'SCHEDULED'` — это compare-and-set: проверка состояния
  перед транзакцией не защищает от двух одновременных запросов. По той же причине одобрение
  нового черновика сбрасывает устаревший `exported_at`, иначе UI врёт про выгрузку.
- Web-слой трактует 404 как доменное состояние «карточки ещё нет», а не как ошибку; форма
  остаётся управляемой, а первый `PUT` создаёт строку.
- Ручная публикация — две audit-записи на существующих рёбрах вместо нового перехода: история
  остаётся полной, а `PUBLISHING` не может остаться тупиком.

## 2026-11-05 — M2.5 QC + review gate

**Цель:** автоматическая проверка черновика перед human gate: длительность, громкость,
синхронизация, стоп-слова, `is_aigc`, читаемость; отчёт в UI; «Одобрить» только после
успешного/предупреждающего QC.

**Сделано:**

- Контракты `qc.ts`: `qcReportSchema` (`verdict`, checks, metrics, createdAt), проверки
  `duration/loudness/sync/stop_words/aigc/readability`.
- Очередь/стадия `qc` (`REVIEW → REVIEW`, concurrency 1), worker и failure handling.
- `qc.processor.ts`: качает draft, `ffprobe` (длительности и разрывы аудио-пакетов),
  `loudnorm`-замер, правила, `qc_report.json` в S3 + artifact.
- `render` теперь удаляет старый `qc_report` и объект при новом draft: отчёт всегда
  относится к текущему файлу.
- API: `GET /runs/:id/qc` (404, пока отчёта нет), `StorageService.getObject`.
- Web: `qcReport` в detail store, `stageToRun` показывает QC до отчёта, блокирует
  «Одобрить» при `fail`; QC-карточка с verdict/checks/metrics и «Перепроверить»;
  комментарий и danger-зона не конфликтуют с гейтом.
- ADR-0009, AGENTS §4/§6/§9, ARCHITECTURE, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 40, storage 3, db 2, web 67, worker 91, API 25
  (228 тестов), сборка проходит.
- Живой QC на run `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`:
  - до запуска `GET /runs/:id/qc` → 404;
  - `POST /stages/qc` → job completed; `qc_report` создан;
  - verdict `warn`: `loudness=-14.6 LUFS, true peak=-1.0 dBTP` — единственный warn;
  - duration 47.9 s, sync pass (разрыв 0.088 s), stop-words pass, AIGC pass,
    readability 131.5 слов/мин — pass;
  - run остался в `REVIEW`, «Одобрить» доступно (warn ≠ fail).
- QC не меняет состояние run'а и не вызывает LLM.

**Осталось:**

- S1 — TikTok publish risk spike.
- Retry/next-candidate на transient-ошибки скачивания Pixabay.
- Ручная замена сцены в review.
- `provider_usage`/cost ledger и `scenes` table — отдельные milestone'ы.

## 2026-11-05 — feat(web): иерархия действий на run-странице

**Зачем:** блок действий был плоским списком кнопок, а комментарий и регенерация висели
всегда. Пользователю было неясно, что делать в первую очередь.

**Сделано:**

- Карточка стадии получила надпись «Следующий шаг»; её кнопка «Запустить» — primary
  (`mat-flat-button`).
- `REVIEW`: primary-кнопка «Одобрить»; блок «Перегенерировать» свёрнут в `<details>`;
  «Остановить с ошибкой» — отдельная красная danger-зона, тоже свёрнутая.
- Комментарий теперь показывается только внутри danger-зоны, а не всегда.
- Back-переходы (`Переделать бриф`, `Вернуться к сценарию`, `Перегенерировать визуалы`,
  `Вернуть на ревью`) — secondary (`mat-stroked-button`), отдельным рядом.
- `FAILED`: primary «Повторить стадию», без danger-зоны.
- `DRAFT / SCHEDULED / PUBLISHING`: один filled primary-переход, secondary — только
  возвраты, danger — свёрнут.
- Stage-owned переходы по-прежнему скрыты, чтобы не было кнопок без запуска job'а.
- Бюджет component styles поднят с 4 kB до 5 kB: run-page вырос до ~4.4 kB CSS; initial
  bundle не изменился.

**Проверено:**

- `pnpm --filter @peertoreel/web typecheck`, `test` (64), `build` — без предупреждений.
- `pnpm check` — зелёный: contracts 37, storage 3, db 2, web 64, worker 79, API 23
  (208 тестов).
- Живой click-through не выполнялся (не передаю сессию/пароль через инструменты);
  шаблон и состояния собраны typecheck/build, логика переходов покрыта store-тестами.

**Дальше:** ручная замена сцены в review и более строгий дизайн карточки черновика —
после проверки текущей иерархии пользователем.

## 2026-11-05 — feat(visuals): anchor + tags + relevance ranking, убрана кнопка «Перерендерить»

**Зачем:** на dog-run подбор давал кошек, людей и абстракции вместо собак. Причина —
селектор игнорировал теги и порядок выдачи Pixabay и выбирал самый вертикальный/крупный
клип. На запрос `dog owner hugging oxytocin brain` приходили 2 собаки, пара и 2 кота;
выбирался кот. На `scientist dog experiment...` в выдаче не было собаки, выбирался учёный.

**Сделано:**

- В `scriptSchema` добавлен optional `visualAnchor` — главный визуальный субъект ролика
  (`dog`, `black hole`). Для старых сценариев anchor выводится эвристикой: самый частый
  униграм/биграм в `visualDirection`. Для текущего dog-run heuristic дал `dog`.
- Промпт сценария теперь просит `visualAnchor` и короткие (2–4 слова) конкретные
  `visualDirection` без абстракций.
- Pixabay provider парсит `tags` и запоминает `rank` (позицию в выдаче).
- `selectStockAsset`:
  - фильтрует кандидатов по anchor-тегам (например, `dog`);
  - rank стал главным сигналом релевантности, вертикальность/разрешение — вторичными;
  - если primary-запрос не дал anchor-совпадений, visuals делает fallback-запрос только
    по anchor;
  - если единственный релевантный клип уже использован, сначала пробуется anchor-запрос,
    и только потом допускается повтор.
- `visuals_json` meta теперь содержит `visualAnchor`, а scene-artifact meta — теги
  выбранного ассета.
- Из блока регенерации убрана кнопка «Перерендерить»: она запускала только render на тех
  же визуалах и в обычном review-флоу только путала. Рендер остаётся карточкой стадии на
  `VISUALS_READY`; после ошибки — «Повторить стадию».

**Проверено на dog-run `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`:**

- Финальный прогон: 8 сцен, 8 тематических ассетов — 5 разных видео с собаками и 3 фото
  с собаками, fallback-сцен 0. `visualAnchor=dog`, `providerRequests=8`, `cacheHits=13`.
- Кадры на 5 / 15 / 25 / 40 s: собака у миски, собака на улице, собака в снегу,
  человек с собакой на прогулке.
- Draft: 47.9 s, 14 579 335 байт, video/audio одинаковой длины; аудио непрерывно.
- `pnpm check` — зелёный: contracts 37, storage 3, db 2, web 64, worker 79, API 23
  (208 тестов), сборка проходит.

**Ограничение:** один промежуточный прогон при холодном кеше/вариативной выдаче Pixabay дал
3 fallback-сцены; повторный прогон с прогретым кешем выбрал собак для всех 8 сцен. Если
это повторится, следующим шагом стоит добавить retry/next-candidate на transient download
errors.

**Ещё осталось:** иерархия кнопок в UI (kнопка «Перерендерить» убрана, но блок
регенерации всё ещё требует UX-прохода) и ручная замена сцены в review.

## 2026-11-05 — fix(worker): пропуски озвучки на границах сцен

**Симптом:** в draft «почему собака лучший друг человека» голос пропускал ~3 секунды
между словами на 21–24 s и 26–29 s; субтитры продолжали идти, к 38 s рассинхрон пропадал.

**Разбор:**

- `script_json`, `word_timings` и ASS были корректны и монотонны. Слова `лучше`
  (23.394–23.661) и `лучше нас` (29.443–30.081) стояли на своих местах.
- В draft-аудио `ffprobe` показал два реальных разрыва PTS:
  `20.992 → 23.917` и `26.285 → 29.288`. В voiceover MP3 разрывов не было.
- Разрывы совпадали с границами сцен визуального трека. `buildVisualConcatArgs`
  склеивал сегменты через concat demuxer с `-c copy`; на стыках оставались DTS-разрывы,
  и muxer выбрасывал куски аудио.
- Проверено отдельно: CFR-перекодировка склейки (`fps=30`, libx264) даёт непрерывный
  visual track 48.832 s / 1465 кадров; финальный render — 47.9 s без 3-секундных разрывов.
  Экспериментальный `setpts=N/(30*TB)` в финальном фильтре, наоборот, обрезал видео до
  22.5 s, поэтому убран.

**Сделано:**

- `buildVisualConcatArgs` теперь перекодирует concat в CFR вместо `-c copy`.
- Из `buildRenderArgs` убран `setpts`; остаётся `fps=30` и обычный scale/crop/ass.
- Обновлены тесты аргументов `visual-track` и `ffmpeg`; добавлен `ffmpeg.spec.ts`.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 64, worker 71, API 23
  (199 тестов), сборка проходит.
- Повторный render run'а `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`: 47.9 s, video/audio
  одинаковой длины, аудио-пакеты непрерывны на 20–30 s. Остался один разрыв 88 ms на
  44.9 s (AAC/loudnorm), не сравнимый с исходными 3 s.
- Run снова в `REVIEW` с исправленным черновиком.

## 2026-11-05 — fix(web): рабочие кнопки регенерации

**Симптом:** на `REVIEW` кнопки «Перегенерировать визуалы» и «Перерендерить» только меняли
состояние run'а и не запускали стадию. «Перегенерировать визуалы» вела в `VISUALS_READY`
(состояние *после* визуалов), а «Перерендерить» — в `RENDERING`, откуда render уже не
стартовал. В итоге видео не менялось.

**Сделано:**

- Из машины состояний убран тупиковый переход `REVIEW → RENDERING`; render всегда
  запускается из `VISUALS_READY`.
- На `REVIEW` появился отдельный блок «Перегенерировать» с четырьмя действиями:
  - «Перегенерировать сценарий» — `REVIEW → SCRIPT_READY → RESEARCHING`, запускает script
    и останавливается на гейте `SCRIPT_READY`;
  - «Перегенерировать озвучку» — voiceover → visuals → render, возврат в `REVIEW`;
  - «Перегенерировать визуалы» — visuals → render, возврат в `REVIEW`;
  - «Перерендерить» — только render из текущих визуалов.
- Цепочка стадий стартует следующую после `completed` предыдущей; при `failed` цепочка
  очищается. Кнопки заблокированы, пока стадия выполняется.
- Сырые переходы, которые принадлежат процессорам стадий (`RESEARCHING → SCRIPT_READY`,
  `VOICE_READY → VISUALS_READY`, `VISUALS_READY → RENDERING` и т.п.), скрыты из блока
  «Действия», чтобы не было кнопок без запуска job'а.
- `VISUALS_READY → VOICE_READY` теперь тоже запускает visuals + render, а не просто меняет
  состояние.
- Регенерация visuals исключает `providerAssetId` из предыдущего `visuals_json`. Иначе
  24-часовой кеш Pixabay возвращал тот же список, селектор выбирал тот же лучший клип, и
  видео выглядело идентичным.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 64, worker 70, API 23
  (198 тестов), сборка проходит.
- Живая регенерация run'а `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47`:
  - до: asset ids `30470,240531,217708,185938,179597,275593,156318,14869`;
  - после: `26493,189018,217708,133189,251873,5631,15305,156318` — 7 из 8 клипов
    сменились, один переиспользован; `cacheHits=8`, `providerRequests=8`;
  - render завершился, run снова в `REVIEW`, черновик пересобран.
- Отдельно проверен путь «Перерендерить»: `REVIEW → VISUALS_READY → render → REVIEW`,
  draft обновился.
- Живой browser click-through не выполнялся; цепочка покрыта тестами
  `run-detail-store.service.spec.ts`.

**Найдено по ходу:** на старом run'е в `VOICE_READY` не было карточки «Подбор визуалов» —
web-дев-сервер держал старый Vite-прекеш `@peertoreel/contracts` без `VOICE_READY → visuals`.
Кеш `.angular/cache` очищен, web-дев-сервер перезапущен; проверено, что отдаваемый
`@peertoreel_contracts.js` содержит `VOICE_READY: "visuals"`. Лейбл `VOICE_READY → SCRIPT_READY`
переименован в «Вернуться к сценарию», чтобы не обещать регенерацию сценария.

## 2026-11-05 — fix(web): черновик над историей, без встроенных плееров для сцен

**Симптом:** на `/runs/:id` черновик был внутри блока артефактов ниже истории; в консоли
браузера — `404 Not Found` и `scene-5: ERR_CONTENT_LENGTH_MISMATCH` при загрузке стоковых
клипов.

**Сделано:**

- Порядок блоков на run-странице: действия → **Черновик** → история → артефакты.
- Черновик вынесен в отдельную карточку с плеером и ссылкой «Открыть»; из списка
  артефактов он исключён, чтобы не дублировать видео. Счётчик артефактов показывает
  оставшиеся файлы.
- Встроенные `<video>` для `visual_clip` убраны. 8 одновременных запросов к стоковым
  клипам больше не уходят из списка артефактов; у них осталась только ссылка «Открыть».
  Это устраняет `ERR_CONTENT_LENGTH_MISMATCH` при перезаписи сцены во время повторного
  запуска visuals и лишние 404 от устаревших/истёкших presigned URL.
- Аудиоплеер для озвучки сохранён.

**Проверено:**

- Все presigned URL артефактов run'а `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47` отдают
  `HEAD 200` и `Range: bytes=0-1 → 206` с корректным `Content-Length`; размеры совпадают
  с `artifacts.size_bytes`.
- `pnpm check` — зелёный: 192 теста, сборка web проходит.
- Живой browser click-through не выполнялся (не передаю пароль/сессию через инструменты);
  проверка ограничена API-ссылками, typecheck/build и store-тестом.

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

## 2026-11-05 — Закрытие M0 и актуализация документации

**Цель:** закрыть M0 по acceptance и убрать расхождения между кодом, README,
ARCHITECTURE и ROADMAP.

**Сделано:**

- ROADMAP: M0 → `DONE`, M2 → `DOING`; acceptance дополнен проверкой worker'а и уточнением
  про CI/секреты. Добавлена дата закрытия M0.
- README: убран устаревший статус «M0, AI-стадий нет»; описаны реальные стадии
  `script/voiceover/render`, S3-артефакты, readiness с worker'ом и актуальные ограничения.
  Пример bootstrap-пароля заменён на placeholder, добавлено напоминание про `.env`.
- ARCHITECTURE: текущий срез M0 → «M0 закрыт, M2 в работе»; worker забирает jobs из
  `system/script/voiceover/render`; S3 используется для артефактов; readiness проверяет
  Postgres/Redis/worker; обновлены следующие архитектурные шаги.
- Web shell: футер `Pipeline foundation · M0` → `Pipeline core · M2`.
- `pnpm install --frozen-lockfile` и `pnpm db:migrate` проходят.
- `pnpm check` — зелёный: contracts 29, storage 3, db 2, web 60, worker 19, API 21 (134 теста).
- `GET /health/live` → 200; `GET /health/ready` → 200,
  `checks: { database: 'up', redis: 'up', worker: 'up' }`.
- `POST /system/ping` → job `completed` за ~487 мс, прогресс через SSE 10 → 50 → 90 → 100.
- Сканирование tracked-файлов не нашло секретов; `.env` в `.gitignore`, в репозитории только
  `.env.example` и placeholder'ы.

**Ограничение:** удалённый CI-run не проверялся (нет `gh`, репозиторий недоступен через
публичный GitHub API); workflow `ci.yml` повторяет локальные гейты, которые прошли.

## 2026-11-04 — fix(ci): typecheck падал на свежем checkout

**Цель:** починить красный CI после коммита `992cad7` (render stage + stage retries).

**Причина:** `@peertoreel/db` и `@peertoreel/storage` публикуют только `dist` (`exports` → `dist/index.d.ts`).
Корневой `typecheck` собирал перед проверкой один `@peertoreel/contracts`, а `db`/`storage` в CI
не собирались — их `dist` не существует на чистом checkout. Отсюда `TS2307` в worker/api
и каскадные `TS7006` (`tx`, `table`, `eq` выводились как `any` из-за ненайденного `drizzle-orm`
через `@peertoreel/db`).

**Сделано:**

- `package.json` (root): новый скрипт `build:packages` (`pnpm --filter "./packages/*" build`).
  `typecheck`, `test` и `dev` теперь вызывают его вместо сборки одного `contracts`.
- `README.md`: таблица скриптов обновлена (`build:packages`, порядок сборки пакетов).
- Проверено на чистом состоянии (без `packages/*/dist` и без `*.tsbuildinfo`):
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — зелёные.

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

## 2026-11-04 — Настоящая причина «залипающей» кнопки: редирект-петля

**Симптом (уточнён пользователем):** создать черновик через «Создать run», затем нажать
«← Все прогоны» → URL на мгновение меняется на `/runs`, но страница сразу возвращается к
run'у. Помогает только reload.

**Причина:** `RunsPageComponent` в конструкторе подписан на `store.created()` — сигнал
«последний созданный run». После создания он остаётся заполненным в root-store, поэтому при
возврате в список компонент создаётся заново, эффект снова видит `created` и делает
`router.navigate(['/runs', created.id])`. Получалась петля: список → run → список → run.

Reload «лечил» потому, что стор пересоздавался и `created` был `null`.

**Сделано:**

- `RunsStoreService.clearCreated()` — сбрасывает сигнал.
- `RunsPageComponent` в эффекте: `clearCreated()` вызывается до навигации, поэтому повторного
  редиректа нет.
- Откатил `--no-hmr` в `dev`/`start` (был добавлен по ошибочной диагностике HMR) и убрал
  соответствующий абзац из README. Кнопка возврата осталась отдельным методом
  `goToRuns()` с `navigateByUrl`.

**Проверено в браузере (ровно сценарий из жалобы):**

- «Создать run» → попадаем на `/runs/:id` → «← Все прогоны» → путь остаётся `/runs`,
  форма на месте; в течение 4 секунд после клика путь не меняется (проверял каждый 150 мс).
- Повторный вход в тот же run из списка и возврат — тоже остаётся на `/runs`.
- Ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Урок:** прежде чем винить HMR/кэш, проверяйте, не остаётся ли в root-store сигнал, который
провоцирует навигацию при повторном создании компонента. Мой прошлый разбор был неверным.

## 2026-11-04 — Фикс кодировки после PowerShell-правок

**Симптом:** в UI надписи стадий показывались иероглифами (`Р“РµРЅРµСЂР°С†РёСЏ…`).

**Причина:** часть правок я делал через PowerShell (`Get-Content -Raw` → `-replace` →
`Set-Content`). `Get-Content` без `-Encoding` читает UTF-8 как ANSI, поэтому кириллица
превратилась в mojibake и в таком виде записалась обратно. Пострадали четыре файла:

- `apps/web/.../run-page.component.ts` — `stageTitle`, `stageHint`;
- `apps/worker/src/stages/transition.ts` — два сообщения об ошибках;
- `apps/worker/src/stages/voiceover.processor.ts` — два сообщения;
- `apps/worker/src/stages/script.processor.ts` — одно сообщение.

**Сделано:**

- Все строки восстановлены (правки через `edit`, который пишет UTF-8 корректно).
- Заодно поправлена склеенная строка в `runStage()` (`{    const run = …`).
- Для проверки написан разовый сканер (вне репозитория), который ищет mojibake по
  сигнатурам `Р+continuation` / `вЂ`; после правок — `no mojibake`.

**Проверено:**

- Браузер: карточка run'а показывает «Генерация озвучки», подсказку про ElevenLabs,
  бейдж «Сценарий готов», артефакт «Сценарий», ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Правило на будущее:** файлы с кириллицей не редактировать через `Set-Content`/`-replace`
в PowerShell 5.1 — только `edit`/`write`, либо `-Encoding utf8` на чтении и записи.

## 2026-11-04 — Фикс «залипающей» кнопки «Все прогоны»

**Симптом:** после полного прогона стадий ссылка возврата на список перестаёт реагировать.

**Разбор:**

- Роутинг не виноват: `routerLink="/runs"` тоже не срабатывал, а `navigateByUrl` в обработчике
  выполнялся без ошибок и без смены URL.
- Причина — HMR дев-сервера: компонент подменяется в открытой вкладке, обработчики кликов
  остаются от старой версии. После `reload` кнопка работает.
- Побочный эффект того же класса: страница run'а иногда рендерилась пустой (только ссылка
  назад), хотя запросы `/runs/:id` и `/artifacts` уходили и отвечали 200.

**Сделано:**

- `RunPageComponent.goToRuns()` — отдельный метод с `router.navigateByUrl('/runs')` вместо
  `routerLink`; в разметке `<button type="button" class="run__back">`.
- `RunsStoreService.clearStageJob()` — сбрасывает снапшот последней стадии; вызывается в
  `goToRuns()` и в `ngOnDestroy`, чтобы «completed 100%» не висел при возврате.
- `apps/web/package.json`: `dev` и `start` теперь `ng serve --port 4200 --no-hmr`. Полная
  перезагрузка вместо подмены компонентов — этот класс «мёртвых» обработчиков исчезает.
  *(Откатано: причина была в редирект-петле, см. запись выше; скрипты снова без `--no-hmr`.)*
- README, раздел Troubleshooting: описано, что делать при «UI не реагирует».

**Проверено:**

- Свежая вкладка: клик по кнопке → `URL /runs`, список и форма создания на месте, ошибок нет.
- Повторное открытие run'а: прогресс стадии отсутствует, состояние и артефакты на месте.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

## 2026-11-04 — M2.1c Кнопки стадий и прогресс в UI

**Цель:** запускать стадии из интерфейса, а не через curl, и видеть их прогресс.

**Сделано:**

- Контракты: `STAGE_FOR_STATE` (`RESEARCHING → script`, `SCRIPT_READY → voiceover`) — один
  источник правды и для кнопок в UI, и для будущих проверок.
- Web API: `startStage()` (POST), `stageJob()` (GET) с Zod-валидацией снапшота.
- Store: `runStage(id, stage)` через `exhaustMap`, затем опрос `timer(0, 1500)` до
  `completed`/`failed` (`takeWhile`), сигналы `stageJob`/`stageRunning`; по завершении —
  перезагрузка run'а, артефактов и списка; при `failed` — текст ошибки из `failedReason`.
- Карточка run'а: блок «Генерация сценария» / «Генерация озвучки» с кнопкой «Запустить»,
  прогресс-баром и процентами; кнопка блокируется, пока стадия выполняется.
- Двойной запуск невозможен: `stageRunning()` + `exhaustMap`.

**Проверено в браузере (три новых run'а):**

- «Почему мы видим молнию раньше грома»: `DRAFT → RESEARCHING` → «Запустить» → прогресс
  `active 10% … completed 100%` → `SCRIPT_READY`, артефакт «Сценарий» появился сам.
- Далее «Генерация озвучки» → `active 10%` → `VOICE_READY`, артефактов стало 4
  (Сценарий, Субтитры, Тайминги слов, Озвучка).
- «Зачем котам усы»: тот же путь, ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Наблюдения:**

- Опрос раз в 1.5 s: у быстрых стадий (5–10 s) видно 1–2 промежуточных значения и финальные
  100% — для реального рендера (1–3 мин) этого достаточно.
- После завершения артефакты подтягиваются автоматически, без перезагрузки страницы.

**Осталось:**

- Стадия `render` (следующий шаг): mp3 + тайминги + ASS из S3 → `draft_mp4` → `REVIEW`.
- `provider_usage` и SSE вместо опроса.

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
- Worker: зависимости `@peertoreel/db`, `@peertoreel/storage`, `drizzle-orm`, `pg`; скрипт
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

- `pnpm --filter @peertoreel/web typecheck` и `test` — успешно, web 32 теста (было 21).
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

- Vite-прекеш: после добавления новых экспортов в `@peertoreel/contracts` дев-сервер web нужно
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
- Сессия: 32 случайных байта в `peertoreel_session` (httpOnly, SameSite=Lax, Secure в prod),
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
  грузят auth-фичу динамическим `import()`, иначе `@peertoreel/contracts` с Zod попадал в
  initial bundle (809 kB → 320 kB).
- ADR-0004 (серверные сессии), обновлены `README.md`, `ARCHITECTURE.md`, `AGENTS.md` §5.

**Проверено:**

- `pnpm --filter @peertoreel/contracts build`, `api typecheck` — успешно.
- Тесты: contracts 12, API 13, worker 2, web 21.
- `pnpm check` — зелёный (lint/typecheck/test/build), initial bundle 320.21 kB при бюджете
  500 kB.
- `pnpm db:migrate` — миграция `0002` применена; в БД `users`, `sessions`, `user_role`.
- API вручную (curl):
  - неверный пароль → `401 UNAUTHORIZED`, тело в едином error envelope;
  - верный пароль → `200`, `Set-Cookie: peertoreel_session=…; HttpOnly; SameSite=Lax`;
  - `GET /auth/me` с cookie → `200`, без cookie → `401`;
  - `POST /system/ping` без cookie → `401`, с cookie → `202`;
  - SSE `/system/ping/:jobId/events` без cookie → `401`, с cookie → `event: job` + `completed`;
  - `POST /auth/logout` → `204`, после него `/auth/me` → `401`, строк в `sessions` — 0.
- В БД: `password_hash` = `$argon2id$v=19$m=19456…`, `token_hash` не совпадает с cookie
  (хранится sha256), `role=admin`.
- Браузер: `/health` без сессии → redirect на `/login`; вход `owner@peertoreel.local` →
  `/health` с «Owner»/«Выйти» в шапке; `/system` → ping прошёл (100%, 471 мс) без console
  errors; «Выйти» → `/login`, защищённые роуты снова редиректят.

**Осталось / осознанно не сделано:**

- Нет rate limit и lockout на логин, нет аудита неудачных попыток, нет MFA.
- Нет cron-очистки истёкших сессий (только на старте приложения).
- Клиент доверяет локальному сигналу пользователя: истечение сессии обнаруживается ответом
  `401` на реальном запросе, без фонового refresh.
- В dev-сервере Angular пришлось очистить `.angular/cache` — Vite пре-бандлил старый
  `@peertoreel/contracts` без `loginResponseSchema`.

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
- Создан `@peertoreel/contracts` с Zod-схемами health и error.
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
- `pnpm --filter @peertoreel/contracts build` — успешно.
- `pnpm --filter @peertoreel/api typecheck` — успешно.
- `pnpm --filter @peertoreel/api test` — 3 теста.
- `pnpm --filter @peertoreel/web typecheck` — успешно.
- `pnpm --filter @peertoreel/web build` — успешно.
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
- `pnpm --filter @peertoreel/api typecheck` и `test` прошли.
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

- `pnpm --filter @peertoreel/web typecheck` и `test` — успешно.
- Web tests: 12 (включая SystemApiService и SystemStoreService).
- SSE вручную: `GET /api/v1/system/ping/demo-sse-4/events` отдал `active 90` и
  `completed 100` с result.
- Браузер: `/system` → «Запустить ping» → job завершился, UI показал 100%,
  request ID, время обработки и длительность; console errors нет.
- `pnpm check` — будет финально прогнан после документации.

**Следующая сессия:** S0.3 — auth + sessions + baseline schema.
