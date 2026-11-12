# Состояние проекта

Обновлено: 2026-11-12 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05` (Phase 0/1 workflow на месте).
Активная работа: `feat/m3-animated-factory` @ `31c32f2` (мёрж PR #5 `feat/m3-5-1`).
План: `docs/workspace/plans/2026-11-11-m3-6b-1-provider-readiness-session.md` (локальный, не в git).
Рабочее дерево: M3.6b.1 изменён, не закоммичен.

## Проверки

- `feat/m3-animated-factory` + M3.6b.1: `pnpm check` — зелёный, 767 тестов (2026-11-12).
- Postgres/Redis/SeaweedFS подняты; миграция `0010_powerful_wong` применена локально.
- `assets:import` дважды: `добавлено 12`, затем `добавлено 0, уже было 12` (12 записей).
- Showcase `render-storyboard --resolve-assets --persist`: `assets.persisted: true`,
  `ffprobe` 1080×1920/30, h264, `yuv420p`, BT.709.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6a.1, episode-слой (PR #5),
  M3.6b.1 (в рабочем дереве).
- `feat/m3-5-1` — влит в `feat/m3-animated-factory` через PR #5; дальше не используется.
- Следующий срез — M3.6b.2 (реальные вызовы Recraft/fal.ai); плана пока нет.

## Готово

- M3.6b.1: alias `key → hash` (`asset_aliases`), metadata-refresh, ledger `provider_usage`,
  Tier 0 в палитре `studio_flat_2d_v1` и хранится нормализованным, `packages/providers`
  (скелеты Recraft/FLUX.2 без сети).
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- M3.6b.1 не закоммичен: 0010-миграция, правки пакетов, 12 SVG, docs, `pnpm-lock.yaml`.
- Root `AGENTS.md` §2 не обновлён под новый `packages/providers` (намеренно не правился
  в середине сессии, чтобы не инвалидировать prompt cache).

## Следующий шаг

1. Закоммитить M3.6b.1 на `feat/m3-animated-factory`.
2. Обновить root `AGENTS.md` §2/§3 строкой про `packages/providers`.
3. M3.6b.2: реальные вызовы (нужны ключи и бюджет) — см. приложение к плану M3.6b.1.

## Открытые решения и блокеры

- `RECRAFT_API_KEY`/`FAL_KEY` отсутствуют; платные вызовы запрещены до M3.6b.2.
- Бюджет и лимит на сессию для Recraft/FLUX.2 не согласованы.
- Сетевой доступ к `api.recraft.ai`/`fal.run` с этой машины не проверялся.
- 12 прежних объектов стартовых SVG остались сиротами в S3 (ключи — в записи
  `docs/sessions/2026-11/2026-11-12-02-...`); `--prune` не сделано.

## Не загружать на старте

- `SESSION_LOG.md` — только индекс; запись из `docs/sessions/` — по ссылке.
- `ROADMAP.md`, `ARCHITECTURE.md`, `docs/adr/*`, `docs/workspace/research/*`.
- `docs/workspace/plans/*` — только активный план.
- `node_modules`, `dist`, `apps/*/dist`, `apps/worker/out`, `pnpm-lock.yaml`.

## Актуальность

- Исторические факты (решения, миграции) не перепроверять без причины.
- Изменяемые факты: ветка, HEAD, Git status, проверки. Если HEAD отличается — карточка
  потенциально устарела.
- `Not verified` означает, что проверка не запускалась; это не «зелёный».
