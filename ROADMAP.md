# ROADMAP

Статусы: `TODO` · `DOING` · `BLOCKED` · `DONE`.
Оценки — планировочные, не измерения.

## Обзор

| ID | Milestone | Результат | Оценка | Статус |
|---|---|---|---|---|
| M0 | Walking Skeleton | Монорепо, infra, contracts, API+web, auth, CI | 30–45 ч | DONE |
| M1 | Publish Risk Spike | Один MP4 → R2 → private TikTok post → статус | 20–35 ч | DOING |
| M2 | Factory Core | Тема → research → script → TTS → visuals → render → QC → review → MP4 | 70–110 ч | DOING |
| M3 | Animated Factory | Storyboard (JSON) → продюсеры сцен (Remotion / image / AI video) → гибридный анимированный ролик | 60–90 ч | DOING |
| M4 | Quality & Ops | Стиль-пресеты, vision QC, cost ledger, music/ducking, ручная замена сцен | 40–60 ч | TODO |
| M5 | Scale & Monetization | Batch, A/B, analytics, multi-platform | 40–80 ч | TODO |

MVP = M0 + M2 + manual export. M1 — опциональный risk spike. M3 — производство оригинальных
анимированных видео вместо стоковых клипов (исследование
`docs/ignore/research/2026-11-08-ai-video-production-research.md`, план —
`docs/ignore/plans/2026-11-08-animated-factory-plan.md`; оба файла локальные, `docs/ignore/`
в `.gitignore`). Прежние M3/M4 перенумерованы в M4/M5 (содержание сохранено).

## M0 — Walking Skeleton

| ID | Задача | Owner | Статус |
|---|---|---|---|
| M0.1 | Workspace, git, CI baseline | агент | DONE |
| M0.2 | Contracts package | пара | DONE |
| M0.3 | Local infrastructure | агент | DONE |
| M0.4 | API skeleton, DB, health | вы | DONE |
| M0.5 | Web shell и health page | агент | DONE |
| M0.6a | Worker, BullMQ, ping job | вы | DONE |
| M0.6b | SSE progress + web ping UI | пара | DONE |
| M0.7 | Auth и sessions | вы | DONE |
| M0.8 | Error model, observability, CI gates | пара | DONE |
| M0.9 | Render spike | агент | DONE |

## M0 acceptance

- `pnpm install` проходит.
- `pnpm infra:up` поднимает Postgres, Redis, S3.
- `pnpm db:migrate` применяет миграции.
- `pnpm dev` поднимает API, web и worker.
- `/api/v1/health/live` и `/api/v1/health/ready` работают; readiness проверяет Postgres,
  Redis и наличие worker'а.
- `POST /api/v1/system/ping` ставит job, worker обрабатывает, статус и SSE-прогресс читаются.
- Web показывает статус API/Postgres/Redis/Worker.
- `pnpm check` зелёный.
- CI workflow повторяет локальные гейты (install → migrate → lint → typecheck → test → build).
- Секретов в репозитории нет: `.env` в `.gitignore`, в репозитории только `.env.example`.

**M0 закрыт 2026-11-05.** Локально проверено: `pnpm install --frozen-lockfile`,
`pnpm db:migrate`, `pnpm check` (134 теста), `/health/ready` → 200 с `worker: up`,
ping job → `completed` за ~0.5 с.

## M1 — Publish Risk Spike (в работе)

| ID | Задача | Статус |
|---|---|---|
| M1.1 | Publish card + manual export (без TikTok API) | DONE |
| M1.2a | TikTok OAuth, token vault, `/accounts`, upload spike | DONE |
| M1.2b | Очередь `publish` + кнопка в publish card + статус-поллинг | DONE |
| M1.2c | Webhooks, rate limiter, per-card account selection, auto-publish | TODO |

**M1.1 закрыт 2026-11-06.** Проверено: миграции `0005`/`0006` (enum `publish_card_state`,
`publish_cards`, unique `run_id`, check `is_aigc = true` и длины title, backfill существующих
run'ов); `pnpm check`; живые запросы — 401 без сессии, 404 без карточки, upsert с
`isAigc: false` сохраняет `true` и нормализует хештеги, PUT вне `SCHEDULED/PUBLISHING` → 409,
прямой переход в `PUBLISHING` → 409, повторная отметка экспорта не двигает `exported_at`,
`downloadUrl` отдаёт `Content-Disposition: attachment`; одноразовый run прошёл
`REVIEW → SCHEDULED` (карточка создана автоматически) и `manual-publish` (две audit-записи,
`PUBLISHED`). Пользователь скачал черновик из браузера и вручную опубликовал его в приватном
TikTok-аккаунте; отдельно кнопки «Скопировать текст»/«Скачать JSON» не проверялись.

**M1.2a закрыт 2026-11-08.** Сделано: `packages/tiktok` (OAuth + PKCE, `TokenCipher`
AES-256-GCM, chunk planner, классификация ошибок), миграция `0007` (`tiktok_accounts`), API
`/accounts/tiktok` (authorize/callback/list/disconnect/creator-info), refresh с ротацией под
Redis-локом, web `/accounts`, CLI `tiktok:spike` (`FILE_UPLOAD`, `SELF_ONLY`). Живая проверка:
sandbox-аккаунт `@arapashwb55` подключён через HTTPS-туннель и PKCE; `creator_info/query`
вернул доступные privacy options; spike загрузил draft 28 125 877 байт двумя чанками,
`status=PUBLISH_COMPLETE`, `publish_id=v_pub_file~v2-1.7705630733150406678`. `post_id` пустой —
это ожидаемо для `SELF_ONLY` (непубличный пост). Карточка сохранила `publish_id`, run остался
в `SCHEDULED`; очередь и кнопка публикации — M1.2b.

**M1.2b закрыт 2026-11-08.** Добавлены очередь `publish` (детерминированный job id), API
`POST/GET /runs/:id/tiktok-publish`, worker-процессор с переходами
`SCHEDULED → PUBLISHING → PUBLISHED/FAILED`, возобновление по `publish_id` без дубля поста и
кнопка «Опубликовать в TikTok» в publish card с сохранением формы, прогрессом и поллингом.
Живой прогон на run `5a931675-aa79-4748-beb6-bede83a8eb53`: job completed, run `PUBLISHED`,
карточка `published`, `post_id=7705631453408808000`. Ограничение: `post_id` приходит JSON-числом
int64 и может терять точность; webhooks вернут строку. Webhooks, rate limiter, выбор аккаунта
и автошедулинг — M1.2c.

## M2 — Factory Core (в работе)

| ID | Задача | Статус |
|---|---|---|
| M2.1 | Storage + artifacts + S3 | DONE |
| M2.2 | Стадии `script` и `voiceover` в очереди | DONE |
| M2.3 | Стадия `render` до `REVIEW` | DONE |
| M2.4 | Стадия `visuals` (Pixabay, кеш 24 ч, fallback) | DONE |
| M2.5 | QC + review gate (`qc_report`, проверки, verdict) | DONE |

**M2.4 закрыт 2026-11-05.** Проверено: `pnpm check` (228 тестов), живой прогон
`VOICE_READY → VISUALS_READY → REVIEW` с 8 Pixabay-клипами, повторный запуск visuals без
дублей, `draft.mp4` 1080×1920/30 fps из реальных сцен.

**M2.5 закрыт 2026-11-05.** Живой QC на dog-run: `qc_report` создан, verdict `warn`
(true peak −1.0 dBTP), duration/sync/stop-words/AIGC/readability — pass; run остался в
`REVIEW`. «Одобрить» доступно только при наличии отчёта и не при `fail`.

**M2 — ядро фабрики работает** (тема → черновик → QC → review). Остатки перенесены:
retry/next-candidate Pixabay → M4.6, ручная замена сцены → M4.4, cost ledger → M4.3.

## M3 — Animated Factory (в работе)

Переход от стоковых клипов (Pixabay) к оригинальным анимированным видео. Порядок слайсов
пересобран 2026-11-10 после read-only аудита: сначала data-driven renderer и режиссёрские
рецепты, затем сквозная история на двух темах, и только потом asset library, AI-генерация и
production hardening. Причина — не строить очередь и asset system до того, как доказана
визуальная связность. Решения: `docs/adr/0014-m3-renderer-first-roadmap.md` и
`docs/adr/0015-subject-assets-and-mvp-formats.md`. Контракт
раскадровки и базовая архитектура — ADR-0012; исследования:
`docs/ignore/research/2026-11-08-ai-video-production-research.md`,
`docs/ignore/research/2026-11-10-asset-pipeline-and-format-research.md`; брифы:
`docs/ignore/plans/2026-11-08-animated-factory-plan.md`; промпт ближайшей сессии:
`docs/ignore/plans/2026-11-10-m3-4-scene-recipes-session.md`.

| ID | Задача | Owner | Статус |
|---|---|---|---|
| M3.1 | Контракт раскадровки `peertoreel.storyboard.v1` + фикстура «−15°» + ADR-0012 | агент | DONE |
| M3.2 | Render worker (Remotion): bootstrap, рендер сцен-клипов из фикстуры | агент | DONE |
| M3.3 | Renderer foundation: произвольный storyboard JSON, params, local assets, явные ошибки неизвестных компонентов | агент | DONE |
| M3.4 | Scene Recipes v1: 5 рецептов × 2–3 варианта композиции + слои (вкл. local subject SVG) + starter pack | агент | DONE |
| M3.5 | End-to-end animation spike: 2 темы, DeepSeek → Remotion (+ local starter SVGs) → FFmpeg, без облачных AI-ассетов | агент | DONE |
| M3.6 | Asset Library + Asset Generator: metadata/hash/variants/resolver, Recraft Vector / FLUX.2 + BiRefNet, OKLab нормализация, `cartoon-character`, style preset | агент | TODO |
| M3.7 | Production hardening: `scene_clip`, per-scene regeneration, `scene-render` queue, vision QC, review UI, cost | агент | TODO |

**M3.1 закрыт 2026-11-09.** Добавлены `packages/contracts/src/json.ts`,
`timings.ts`, `storyboard.ts` (`peertoreel.storyboard.v1`), фикстура «−15°» на 6 сцен с
детерминированными `word_timings`, типы артефактов `storyboard_json`/`scene_clip`, русские
ярлыки в web и ADR-0012. `DerivedWord`/`derivedWordsSchema` перенесены из worker в contracts;
worker собирается. Проверено: contracts 102 теста, worker 96, web 124; `pnpm check` зелёный.
Никаких изменений в `visuals_json`, render/FFmpeg, API, БД, очередях и UI-страницах нет.

**M3.2 закрыт 2026-11-09.** Добавлены `apps/render-worker` (Remotion 4.0.542, React 19),
композиция `Scene`, компоненты `parallax-city`/`kinetic-typography` + общий `SceneObjects`,
fallback-маппинг для ещё не реализованных компонентов, CLI `render-fixture` и
`infra/render-worker.Dockerfile`. Фикстура рендерится в 6 беззвучных клипов
1080×1920/30/h264/`yuv420p`; 140.1 с на dev-машине, 147.6 с в контейнере;
`buildVisualConcatArgs` склеивает их в 60-секундный трек. Docker-образ с закреплённым
Chrome Headless Shell 158.0.8127.2 собирается, рендер идёт под non-root. `pnpm check` —
445 тестов. Важно: это fixture-renderer; API/worker/S3, параметры и ассеты в нём ещё не
подключены — это M3.3+.

**M3.3 — Renderer foundation (закрыт 2026-11-10).** Remotion принимает любой валидный
`storyboard.v1` (или отдельную сцену), а не только встроенную фикстуру; fixture-импорт остался
только в CLI. Итог ниже фиксирует acceptance.
- `implementation.params`/`fallback.params` доходят до компонентов; для каждого
  `componentId` есть Zod-схема параметров и дефолты в contracts.
- Семантика params явная: отсутствие params/поля → defaults; некорректное значение →
  default для этого поля + диагностическое предупреждение с path; неизвестный
  `componentId` → ошибка. Молчаливая замена некорректного входа запрещена.
- `mapping.ts` возвращает разрешённую сцену (`componentId`, `params`, `source`,
  `diagnostics`); компонент получает только `componentId`/`params` и не знает, почему
  выбран этот компонент.
- Общий video target (1080×1920/30, H.264, `yuv420p`, BT.709, без аудио) вынесен в contracts
  как спецификация; Remotion и FFmpeg мапят её в свои параметры independently. Длительность
  считается из `scene.durationSec`.
- Механизм локальных ассетов: `public/` + `staticFile` (или эквивалент в input props), без
  AI-генерации и без Asset Library.
- Неизвестный компонент не маскируется под `kinetic-typography`: если ни `implementation`,
  ни объявленный `fallback` не реализованы, рендер падает с типизированной ошибкой.
  Существующая фикстура остаётся рендерящейся за счёт явного реализованного fallback.
- CLI `render-storyboard --input <json> [--scene <idx>] [--out <dir>]`; `render-fixture`
  остаётся shortcut. В репозитории есть `examples/custom-storyboard.json`, не выведенный из
  фикстуры.
- **Acceptance:** фикстура рендерится; `examples/custom-storyboard.json` рендерится через
  CLI; изменение params видно в кадре; некорректные params дают диагностику, а не тихий
  default; неизвестный компонент даёт понятную ошибку; длительность/тайминги соответствуют
  входу; в core render path нет fixture-специфичных импортов; детерминизм проверен на
  одинаковом seed, изменении seed и независимости от порядка сцен.

**Итог M3.3.** Добавлены `storyboard.components.ts` (6 схем/defaults + per-field diagnostics),
`video.ts` (единая спецификация), resolved scene в `mapping.ts` с
`UnsupportedSceneComponentError`, param-aware `ParallaxCity`/`KineticTypography`, общий
`public/` + `staticFile` + resolver ассетов, CLI `render-storyboard`, манифест с diagnostics и
boundary test. Fixture CTA fallback переведён на реализованный `kinetic-typography`;
`image-parallax` stretch не взят (M3.6). FFmpeg/Remotion мапят video target раздельно;
цветовые флаги не добавлялись, потому что `ffprobe` уже показывает BT.709. Проверено:
`pnpm check` — 485 тестов; фикстура 143.3 с, custom 75.0 с; concat 28.0 с; одинаковый
SHA-256 для сцены в полном прогоне, одиночно и после другой сцены; изменение seed меняет
кадр; invalid params пишут diagnostics в лог/манифест; unsupported component завершает CLI
ошибкой; Docker-образ `peertoreel-render-worker:m3-3` собирается. Полная сборка с озвучкой —
отдельная проверка (см. `SESSION_LOG.md`).

**M3.4 — Scene Recipes v1.** Пять рецептов: `hook-hero`, `fact-object`, `comparison`,
`process`, `cta`; у каждого 2–3 варианта композиции. Рецепт — это способ визуально объяснить
мысль (слоты, камера, движение, допустимые примитивы), а не шаблон расположения элементов.
`SceneObjects` разделяется на переиспользуемые слои: текст/pill (вкл. HUD-чипы), частицы, свет,
overlay, персонаж, chart и `image`/`subject` (рендер локальных SVG/PNG через M3.3
`resolveAssetKey` + `assetUrl`). Добавляется небольшой локальный стартовый пакет плоских SVG без
запечённого текста в `apps/render-worker/public/assets/starter/` под showcase и будущие темы
M3.5 (ADR-0015). **Acceptance:** один storyboard смешивает ≥3 рецепта (включая предметный слот из
`starter/`); два рендера одной сцены детерминированы; ролик не выглядит как одинаковые карточки;
каталог рецептов доступен будущему DeepSeek-режиссёру.

**Итог M3.4.** Форма контракта зафиксирована в ADR-0016: `implementation.type = 'recipe'` с
`recipeId`/`variant`/`slots`, `programmatic` остаётся escape hatch. Добавлены
`packages/contracts/src/storyboard.recipes.ts` (5 рецептов × 2 варианта, slot specs, layer plan,
camera hint, `STARTER_ASSET_KEYS`/`STARTER_ASSET_CATALOG`), слот-диагностика с семантикой
`parseComponentParams`, `subject` в `sceneObjectKindSchema` и `preset: 'backdrop'` у
`kinetic-typography`. В render worker: `recipes.ts` (единственный resolution), `camera.ts`
(shot/movement/speed/parallax), слои `components/layers/*`, рабочий `image`/`subject` через
`resolveAssetKey` + `assetUrl`, manifest с `recipeId`/`variant`/slot diagnostics. В
`public/assets/starter/` лежат 12 authored SVG без `<text>`; `examples/recipe-showcase.json`
смешивает все 5 рецептов. Проверено: contracts 137 тестов, render-worker 84; showcase 78.5 с,
фикстура 135.9 с, custom 77.7 с; все клипы 1080×1920/30/h264/`yuv420p`/BT.709 без аудио;
SHA-256 сцены совпадает в полном прогоне, одиночно и после другой сцены; смена варианта меняет
кадр; неизвестные recipeId/variant/slot/assetKey дают Zod-путь и exit 1; невалидный optional
slot рендерится с diagnostics в манифесте. Камера теперь влияет на кадры fixture/custom
(`shot`/`parallax` — требование M3.4), длительности и состав сцен не менялись. Полная сборка
showcase с озвучкой и FFmpeg concat — задача M3.5.

**M3.5 — End-to-end animation spike.** Две темы: «Почему у собак мокрый нос?» и «Почему дома
строят из кирпича?». DeepSeek выдаёт `storyboard.v1` (используя каталог рецептов M3.4 и список
ключей локального стартового пакета `public/assets/starter/`), render worker рендерит сцены,
FFmpeg собирает ролик. Без облачной AI-генерации ассетов и без очереди `scene-render`: допустим
CLI/скрипт и ручная сборка существующим `buildVisualConcatArgs`. **Acceptance:** два ролика
30–60 с, ≥5 сцен каждый, связная история с предметным слоем (собака/нос, кирпич/дом), разные
визуальные сетапы, отсутствие per-topic кода; визуальный review фиксирует, что подход работает.
**Не входит:** production queue, облачный `ImageProvider`, R2 Asset Library, vision QC.

**Итог M3.5.** Добавлены `packages/contracts/src/storyboard.director.ts` (драфт 5–8 сцен:
recipeId/variant/slots, без таймингов) и CLI `storyboard:episode` в `apps/worker`:
DeepSeek → ElevenLabs (или spike-fallback) → `buildStoryboardFromDraft` → render-storyboard →
`buildVisualConcatArgs` → `renderDraft`. Промпт собирается из каталога рецептов и
`STARTER_ASSET_KEYS`, тайминги выводятся из реальной озвучки, а не из LLM. Оба ролика собраны:
«собака» — 7 сцен / 50.4 с / 86 слов, «кирпичи» — 6 сцен / 46.0 с / 75 слов; LLM с первой
попытки (2511/916 и 2512/795 токенов). Оба — 1080×1920/30, h264 + AAC, BT.709; сцены
146/137 с, concat 3.2/3.3 с, финальная сборка 6.4/5.5 с. Визуальный review: разные рецепты,
предметный слой и ASS-субтитры читаются, per-topic кода нет. Из-за исчерпанной квоты
ElevenLabs (осталось 290 кредитов) спайк озвучен `--tts google`: точные длительности сцен,
word timings — пропорциональная оценка; production-путь voiceover остаётся ElevenLabs,
провайдер записан в manifest.

**M3.6 — Asset Library + Asset Generator.** После spike становится видно, каких объектов не
хватает в стартовом пакете. Добавляются: общая библиотека ассетов, metadata и content hash,
версии/варианты, проверка лицензий (`commercialUse: true`), трёхуровневый `AssetResolver`
(Tier 0 локальный стартовый пакет / кэш R2 → Tier 1 Recraft V4/V4.1 Vector SVG или FLUX.2
`[klein] 4B` + Vectorize → Tier 2 FLUX.2 `[klein]`/`[pro]` + BiRefNet v2 cutout), обязательная
нормализация стиля (`svgo` + OKLab квантование палитры в `style.assetPalette`, стикер-контур для
растра), параметрический rig `cartoon-character` (5 эмоций по `syncToWord` + аксессуары) и
первый style preset (`studio_flat_2d_v1`, ADR-0015). Процедурные объекты, SVG и AI-иллюстрации
сосуществуют; реальные фото и AI-схемы с текстом в flat 2D не попадают. **Acceptance:** две темы
M3.5 плюс третья собираются из смеси procedural/SVG/AI; персонаж и палитра консистентны между
сценами; кэш предотвращает повторные оплаты; при отказе генерации сцена деградирует в Tier 0
иконку или процедурный fallback.

**M3.7 — Production hardening.** Отдельные `scene_clip` artifacts, per-scene regeneration,
очередь `scene-render` с payload `{runId, sceneIdx}`, vision QC ассетов и готовых сцен,
проверка повторяемости композиций, review UI, учёт стоимости и бюджета. **Acceptance:**
регенерация одной сцены не пересобирает ролик; jobs идемпотентны; vision QC ловит пустые,
off-style и нечитаемые сцены; стоимость генерации записана.

**M3 acceptance (пересобран 2026-11-10, дополнен ADR-0015):**
- M3.3: произвольный storyboard JSON рендерится, params влияют на кадр, неизвестный компонент
  падает явно, фикстура зелёная.
- M3.4: пять рецептов с вариантами, ≥3 рецепта в одном ролике, нет «одинаковых карточек»,
  локальный `subject`-слой и стартовый SVG-пак без `<text>`.
- M3.5: две разные темы проходят путь topic → storyboard → сцены → ролик без per-topic кода и
  с предметным слоем из стартового пака.
- M3.6: asset library/resolver/generator (Tier 0–2), OKLab-нормализация, `cartoon-character`,
  style preset, procedural/SVG/AI coexisting.
- M3.7: `scene_clip`, per-scene regen, `scene-render` queue, vision QC, review UI, cost ledger.
- Общий baseline M3.2 (эксперимент «−15°») сохраняется: 1080×1920/30, ≤15 мин рендера,
  детерминизм, стиль и палитра консистентны.

## M4 — Quality & Ops

| ID | Задача | Статус |
|---|---|---|
| M4.1 | Второй style preset (первый studio flat 2D появляется в M3.6) | TODO |
| M4.2 | Advanced vision QC: артефакты, читаемость на масштабе, сложные офф-стиль кейсы (базовый QC — M3.7) | TODO |
| M4.3 | Cost dashboard и бюджеты (ledger — M3.7) | TODO |
| M4.4 | Ручная замена/тонкая правка сцены в review (per-scene regen — M3.7) | TODO |
| M4.5 | Music + ducking (`@audio/beat`, sidechain в FFmpeg) | TODO |
| M4.6 | Retry/next-candidate для transient-ошибок скачивания Pixabay (fallback-путь) | TODO |
| M4.7 | Мониторинг и операционные улучшения | TODO |
| M4.8 | AI video (MiniMax H3) как опциональные hero-шоты; не дефолт | TODO |

## M5 — Scale & Monetization

| ID | Задача | Статус |
|---|---|---|
| M5.1 | Batch series generation | TODO |
| M5.2 | A/B hooks | TODO |
| M5.3 | Analytics feedback в выбор тем | TODO |
| M5.4 | Multi-platform publish | TODO |

## Следующие сессии

1. **M3.6 — Asset Library + Asset Generator.** Resolver Tier 0–2, `ImageProvider` (Recraft
   Vector / FLUX.2 + BiRefNet), OKLab-нормализация, `cartoon-character`, style preset. M3.5
   закрыт 2026-11-10.
2. M3.7 — `scene_clip`, per-scene regeneration, `scene-render` queue, vision QC, review UI, cost.
3. M1.2c — webhooks, rate limiter, выбор аккаунта, автошедулинг (параллельно, когда понадобится
   публичная публикация).
