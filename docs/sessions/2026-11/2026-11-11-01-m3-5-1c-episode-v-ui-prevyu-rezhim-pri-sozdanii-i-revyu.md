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

