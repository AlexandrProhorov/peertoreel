# Состояние проекта

Обновлено: 2026-11-12 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05` (Phase 0/1 workflow на месте).
Активная работа: `feat/m3-animated-factory` @ `98279f7` (docs pivot M3.6b на DeepSeek; код M3.6b.2 не начат).
План: `docs/workspace/plans/2026-11-12-m3-6b-2-deepseek-svg-session.md` (локальный, не в git).
Рабочее дерево: неприменённые doc-правки этой сессии (SESSION_LOG, state card, запись сессии); код не менялся.
Направление: реальная генерация SVG через DeepSeek API; Recraft/FLUX parked.

## Проверки

- M3.6b.1: `pnpm check` — 767 тестов (2026-11-12, вне этой сессии).
- В этой сессии проверки не запускались — `Not verified`.
- Postgres/Redis/SeaweedFS подняты; миграция `0010_powerful_wong` применена локально.
- `assets:import` дважды: `добавлено 12`, затем `добавлено 0, уже было 12` (12 записей).
- Showcase `render-storyboard --resolve-assets --persist`: `assets.persisted: true`,
  `ffprobe` 1080×1920/30, h264, `yuv420p`, BT.709.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6a.1, episode-слой (PR #5),
  M3.6b.1 (закоммичен).
- `feat/m3-5-1` — влит в `feat/m3-animated-factory` через PR #5; дальше не используется.
- Следующий срез — M3.6b.2: DeepSeek SVG за `ImageProvider`; план есть, требует обновления
  (промпт, thinking, кандидаты, тарифы).

## Готово

- M3.6b.1: alias `key → hash` (`asset_aliases`), metadata-refresh, ledger `provider_usage`,
  Tier 0 в палитре `studio_flat_2d_v1` и хранится нормализованным, `packages/providers`
  (скелеты Recraft/FLUX.2 без сети).
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- Ничего не в работе: HEAD `98279f7`, дерево чистое.

## Следующий шаг

1. M3.6b.2: DeepSeek SVG за портом `ImageProvider` — план
   `docs/workspace/plans/2026-11-12-m3-6b-2-deepseek-svg-session.md`; подтвердить решения
   о месте адаптера, ledger на attempt и тарифах.
2. Опционально: визуальный review перекрашенных 12 стартовых SVG (`brick`, `thermometer`
   ушли в янтарный) и `--prune` для 12 сирот в S3.

## Открытые решения и блокеры

- DeepSeek утверждён генератором; Recraft/FLUX parked. Ключи `RECRAFT_API_KEY`/`FAL_KEY` не нужны.
- К M3.6b.2: тени (запрет или flat hard shadow), кандидатов 3 или 5, тариф (off-peak в env или по UTC).
- Модель данных M3.6b.2: дизайн-кит (library) отдельно от run artifacts; предметы без семантического кэша; сценарный вызов отдаёт `description`/`fallbackIcon`/`role`.
- Для M3.6b.2 нужны: тариф LLM в env (`LLM_INPUT_USD_PER_MTOK`/`LLM_OUTPUT_USD_PER_MTOK`),
  лимит расходов на сессию и визуальная оценка пилота (человеком).
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
