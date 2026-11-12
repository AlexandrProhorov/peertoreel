# Состояние проекта

Обновлено: 2026-11-12 · Milestone: M3 (Animated Factory)
База: `main`, Phase 0 закоммичен (SHA — `git log --oneline -2`).
Phase 1 подготовлен, изменения в рабочем дереве (не закоммичены).
Активная работа: `feat/m3-5-1` @ `07791d4`, PR #5 (open, base `main`).

## Проверки

- `main` + Phase 1: `pnpm check` — зелёный, 485 тестов (2026-11-12).
- `feat/m3-5-1` @ `07791d4`: по записи в логе ветки — зелёный (M3.5.1c:
  743 теста; fix TikTok chunk: зелёный, число не указано); не перепроверялся.

## Где идёт работа

- `main` — база и инфраструктура workflow; функциональных изменений нет.
- `feat/m3-5-1` — активная функциональность: M3.4, M3.5, M3.6a/6a.1,
  M3.5.1a/b/c. В `main` этих пакетов нет, включая `packages/assets`.
- Следующий срез — M3.6b.1 (provider readiness). План:
  `docs/workspace/plans/2026-11-11-m3-6b-1-provider-readiness-session.md`
  (локальный, не в git).

## Готово

- Phase 0 (`1ed6912`): state card, `/start` `/end` `/context`,
  `pnpm context:check`.
- Phase 1 (не закоммичен): `SESSION_LOG.md` — индекс, 54 записи в `docs/sessions/`,
  шаблоны `docs/templates/session-{plan,record}.md`, `pnpm sessions:split`.
- На `feat/m3-5-1`: M3.5.1c (episode UI, `/runs/:id/storyboard`, review без QC),
  M3.6a/6a.1 (asset library + persistence), M3.5.1a/b (episode-стадии).

## В процессе

- PR #5 открыт; `main` и `feat/m3-5-1` расходятся.
- Phase 1 не закоммичен; после коммита влить `main` в `feat/m3-5-1`.
- Функциональный код приложения не менялся.

## Следующий шаг

1. Закоммитить Phase 1 на `main`, влить `main` в `feat/m3-5-1`, запушить ветку —
   PR #5 получит Phase 0 и 1.
2. Перед M3.6b.1 убедиться, что ветка содержит M3.6a.1.
3. M3.6b.1: alias `key → hash`, metadata-refresh, `provider_usage`,
   каркасы Recraft/FLUX.2 без платных вызовов.

## Открытые решения и блокеры

- `RECRAFT_API_KEY` и `FAL_KEY` отсутствуют; платные вызовы запрещены до
  M3.6b.2, в M3.6b.1 — только fake/offline.
- Генерация ассетов через DeepSeek отложена; пока Pixabay, Tier 0, ручные ассеты.
- Integration-тесты требуют Postgres/Redis/SeaweedFS: `pnpm infra:up`.
- Открыт вопрос бюджета на Recraft/FLUX.2 для M3.6b.2.

## Не загружать на старте

- `SESSION_LOG.md` — только индекс; запись из `docs/sessions/` — по ссылке.
- `ROADMAP.md`, `ARCHITECTURE.md`, `docs/adr/*`, `docs/workspace/research/*`.
- `docs/workspace/plans/*` — только активный план.
- `node_modules`, `dist`, `apps/*/dist`, `apps/worker/out`, `pnpm-lock.yaml`.

## Актуальность

- Исторические факты (решения, миграции) не перепроверять без причины.
- Изменяемые факты: ветка, HEAD, Git status, проверки. Если HEAD отличается —
  карточка потенциально устарела.
- `Not verified` означает, что проверка не запускалась; это не «зелёный».
