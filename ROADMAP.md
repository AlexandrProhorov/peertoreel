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
`docs/research/2026-11-08-ai-video-production-research.md`, план —
`docs/plans/2026-11-08-animated-factory-plan.md`). Прежние M3/M4 перенумерованы в M4/M5
(содержание сохранено).

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
| M1.2b | Очередь `publish`, `publish_id`/`post_id`, статус/webhooks, rate limiter | TODO |

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

Переход от стоковых клипов (Pixabay) к автоматизированному созданию оригинальных
анимированных видео. AI-режиссёр (DeepSeek) строит JSON-раскадровку; программный движок
(Remotion в изолированном render worker) рендерит сцены; AI-изображения/AI-видео — точечно;
сборка, субтитры и QC остаются за текущим FFmpeg. Решения: `docs/adr/0012-*` (в M3.1),
исследование: `docs/research/2026-11-08-ai-video-production-research.md`,
брифы слайсов для агентов: `docs/plans/2026-11-08-animated-factory-plan.md`.

| ID | Задача | Owner | Статус |
|---|---|---|---|
| M3.1 | Контракт раскадровки `peertoreel.storyboard.v1` + фикстура «−15°» + ADR-0012 | агент | TODO |
| M3.2 | Render worker (Remotion): bootstrap, рендер сцен-клипов из фикстуры | агент | TODO |
| M3.3 | Библиотека компонентов v1 (parallax-city, kinetic-typography, …) | агент | TODO |
| M3.4 | Продюсер сцен: очередь `scene-render`, per-scene jobs, fallback | агент | TODO |
| M3.5 | AI-режиссёр: раскадровка из DeepSeek (Zod-retry, тайминги) | агент | TODO |
| M3.6 | `image_animation`: `ImageProvider` (fal.ai FLUX), реестр персонажей | агент | TODO |
| M3.7 | `ai_video`: `VideoProvider` (MiniMax H3), ошибки, `provider_usage` | агент | TODO |
| M3.8 | Storyboard UI: карточка сцен, превью, регенерация одной сцены | агент | TODO |

**M3 acceptance** (эксперимент «−15°», исследование §I.2): ролик из ≥5 различных сцен
собирается автоматически без ручного кода сцен; стиль и палитра консистентны; акценты
типографики синхронны озвучке (±100 мс); рендер ≤15 мин на VPS 4 vCPU; себестоимость ≤$0.5
(≤$2 с AI-видео сценой); ≥80% сцен проходят review без регенерации; регенерация одной сцены
не пересобирает ролик.

## M4 — Quality & Ops (бывш. M3, содержание сохранено)

| ID | Задача | Статус |
|---|---|---|
| M4.1 | Стиль-пресеты (flat_2d_motion + второй стиль) | TODO |
| M4.2 | Vision-QC кадров (пустые сцены, артефакты, читаемость текста) | TODO |
| M4.3 | `provider_usage`: cost ledger, бюджетные предупреждения | TODO |
| M4.4 | Ручная замена сцены в review (таблица `scenes` по ADR-0008) | TODO |
| M4.5 | Music + ducking (`@audio/beat`, sidechain в FFmpeg) | TODO |
| M4.6 | Retry/next-candidate для transient-ошибок скачивания Pixabay | TODO |
| M4.7 | Мониторинг и операционные улучшения | TODO |

## M5 — Scale & Monetization (бывш. M4, содержание сохранено)

| ID | Задача | Статус |
|---|---|---|
| M5.1 | Batch series generation | TODO |
| M5.2 | A/B hooks | TODO |
| M5.3 | Analytics feedback в выбор тем | TODO |
| M5.4 | Multi-platform publish | TODO |

## Следующие сессии

1. M3.1 — контракт раскадровки + фикстура «−15°» + ADR-0012 (бриф: `docs/plans/2026-11-08-animated-factory-plan.md` §4).
2. M3.2 — render worker bootstrap (Remotion); перед merge — проверить headcount для
   лицензии Remotion и платёжный канал.
3. M3.3 → M3.5 — компоненты, продюсер сцен, AI-режиссёр.
4. M1.2b — очередь `publish` + кнопка публикации (старый трек, с M3 не пересекается).
