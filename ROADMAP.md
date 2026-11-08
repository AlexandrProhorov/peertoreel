# ROADMAP

Статусы: `TODO` · `DOING` · `BLOCKED` · `DONE`.
Оценки — планировочные, не измерения.

## Обзор

| ID | Milestone | Результат | Оценка | Статус |
|---|---|---|---|---|
| M0 | Walking Skeleton | Монорепо, infra, contracts, API+web, auth, CI | 30–45 ч | DONE |
| M1 | Publish Risk Spike | Один MP4 → R2 → private TikTok post → статус | 20–35 ч | DOING |
| M2 | Factory Core | Тема → research → script → TTS → visuals → render → QC → review → MP4 | 70–110 ч | DOING |
| M3 | Quality & Ops | Шаблоны, regeneration, cost dashboard, monitoring | 40–60 ч | TODO |
| M4 | Scale & Monetization | Batch, A/B, analytics, multi-platform | 40–80 ч | TODO |

MVP = M0 + M2 + manual export. M1 — опциональный risk spike.

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
| M1.2a | TikTok OAuth, token vault, `/accounts`, upload spike | DOING |
| M1.2b | Очередь `publish`, `publish_id`/`post_id`, статус/webhooks, rate limiter | TODO |

**M1.1 закрыт 2026-11-06.** Проверено: миграции `0005`/`0006` (enum `publish_card_state`,
`publish_cards`, unique `run_id`, check `is_aigc = true` и длины title, backfill существующих
run'ов); `pnpm check`; живые запросы — 401 без сессии, 404 без карточки, upsert с
`isAigc: false` сохраняет `true` и нормализует хештеги, PUT вне `SCHEDULED/PUBLISHING` → 409,
прямой переход в `PUBLISHING` → 409, повторная отметка экспорта не двигает `exported_at`,
`downloadUrl` отдаёт `Content-Disposition: attachment`; одноразовый run прошёл
`REVIEW → SCHEDULED` (карточка создана автоматически) и `manual-publish` (две audit-записи,
`PUBLISHED`). Браузерный click-through скачивания/буфера/JSON остаётся на ручную проверку.

**M1.2a — код готов, живая проверка ждёт ключей TikTok.** Сделано: `packages/tiktok`
(OAuth, `TokenCipher` AES-256-GCM, chunk planner, классификация ошибок), миграция `0007`
(`tiktok_accounts`), API `/accounts/tiktok` (authorize/callback/list/disconnect/creator-info),
refresh с ротацией под Redis-локом, web `/accounts`, CLI `tiktok:spike` (`FILE_UPLOAD`,
`SELF_ONLY`). Проверено: `pnpm check` (353 теста), `GET /accounts/tiktok` без сессии → 401,
`GET /accounts/tiktok/authorize` с сессией без ключей → 503 с перечнем переменных. Не
проверено: реальный OAuth и загрузка — нужны `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
`TIKTOK_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` и приватный аккаунт.

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

## Следующие сессии

1. M1.2b — очередь `publish` + кнопка публикации в publish card, статус/webhooks, rate limiter.
2. M3 — quality/ops: style templates, image generation, music/ducking, cost ledger, manual
   scene replacement.
