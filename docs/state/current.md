# Состояние проекта

Обновлено: 2026-11-13 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05` (Phase 0/1 workflow на месте).
Активная работа: `feat/m3-animated-factory`; HEAD `4491c77` + незакоммиченные изменения M3.6b.5.
План: `docs/workspace/plans/2026-11-13-m3-6b-5-third-topic-and-acceptance-session.md` — выполнен.
Рабочее дерево: изменено (M3.6b.5), коммит не сделан.
Направление: DeepSeek SVG за портом `ImageProvider`; Recraft/FLUX parked.

## Проверки

- `pnpm check` — зелёный (2026-11-13, M3.6b.5): contracts 172, assets 71, providers 30,
  render-worker 110, worker 145 тестов.
- Acceptance `wifi-wall` (после фикса перспективы): 7 сцен, 6 subject-слотов, 5 generated (83%);
  `subject/wifi-router` и `subject/brick-wall-section` → `tier: provider`, `source: llm`,
  2 вызова, $0.005104. Промпты — в `provider_usage.meta` и манифесте.
- Повторный прогон → `tier: cache`, `providerRequests: 0`, 0 новых строк `provider_usage`.
- `--provider=none`, `DEEPSEEK_SVG_FORCE_FAILURE=unavailable|empty`, budget ($0.000001 на вызов)
  → fallback/Tier 0, рендер завершён; empty — 2 строки по 0, budget — 1 строка $0.003684.
- Ролик: 48.7 с, 1080×1920/30, h264 yuv420p + aac 48k; `audioGaps 0.051`.
- Галерея: `apps/worker/out/m3-6b-5/gallery.html` (7 кадров + SVG роутера и стены).
- Изометрия на роутере (первый прогон) — причина и фикс в записи сессии; ассет перегенерирован,
  плоский фронт. Визуальная оценка человеком — `Not verified`.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6b.5, episode-слой (PR #5).

## Готово

- M3.6b.5: generated subjects (`subject/<slug>` + `fallbackIcon` + `prompt`, ADR-0016 D10);
  резолвер продолжает в fallback после ошибки провайдера и отдаёт реальные attempts/cost;
  `ProviderBudgetError` → стоп-кран `provider_disabled_by_budget`; ledger пишет over-budget;
  плоская проекция принудительно: правило провайдера + `sanitizeSubjectPrompt` + first-wins.
- M3.6b.4: числовой PLAN и silhouette rules; `thinking` — дефолт, `max_tokens` 16000; A/B 9/9.
- M3.6b.3: пресет `studio_flat_2d_v2` (дефолт), `recolor:starter`, пилот 30/30.
- M3.6b.2: `DeepSeekSvgProvider` + `LlmJsonClient`, allowlist, ledger на attempt, `source: 'llm'`.
- M3.6b.1: alias `key → hash`, metadata-refresh, ledger `provider_usage`.
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- Ничего не в работе; изменения M3.6b.5 ждут коммита.

## Следующий шаг

1. Коммит M3.6b.5 (`feat(assets)`/`feat(render-worker)`) и визуальный review
   `apps/worker/out/m3-6b-5/gallery.html`.
2. Остаток M3.6b: raster-cutout (b.6), `cartoon-character` (b.7) — плана нет.
3. M3.6c дизайн-кит (`fallbackIcon`-промоушен, `role`, promote) — плана нет.

## Открытые решения и блокеры

- ElevenLabs: квота исчерпана (290 кредитов при 409 нужных) — episode-прогоны на
  `--tts google` до пополнения.
- Тариф LLM — фиксированный off-peak в env; `thinking` — дефолт, `max_tokens` 16000.
- Тени запрещены; `rx` у фонового `<rect>` запрещён (белые углы).
- 12 старых S3-объектов (M3.6b.1) — сироты, `--prune` не сделан.
- Дизайн-кит (`fallbackIcon`, `role`, promote) — M3.6c.

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
