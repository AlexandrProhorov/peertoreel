# Состояние проекта

Обновлено: 2026-11-13 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05` (Phase 0/1 workflow на месте).
Активная работа: `feat/m3-animated-factory` @ `2471663` + коммит M3.6b.2–b.4 и v3.1 (эта сессия).
План: `docs/workspace/plans/2026-11-13-m3-6b-5-third-topic-and-acceptance-session.md`
(M3.6b.5 — третья тема + M3.6 acceptance); M3.6b.2–b.4 закрыты.
Рабочее дерево: чистое после коммита этой сессии (M3.6b.2–b.4, v3.1).
Направление: DeepSeek SVG за портом `ImageProvider`; Recraft/FLUX parked.

## Проверки

- `pnpm check` — зелёный, 784 unit-теста (2026-11-12, M3.6b.4). В этой сессии не запускался — `Not verified`.
- Промпт v3.1: бенчмарк 5×2 (2026-11-13) — 9/10, пропорции в цели (1.77/1.60/0.46–0.50/0.52–0.53/1.00), `maxD = 0`, PLAN 9/9; светофор — семантическая огреха (полукруглые линзы).
- Миграции `0011` (enum `llm`) и `0012` (default `style_id = v2`) применены локально.
- Пилот v2 (старая палитра): 30/30, $0.014573, 3 344 мс — история.
- Think mode (bus/palm/pirate, после silhouette rules): **9/9 годных**, $0.071 за 9 вызовов,
  $0.003–0.006 за кандидата (пират — 2 attempt'а), 16–115 с. `thinking` — дефолт,
  `max_tokens` 16000.
- Thinking off (те же объекты, референсный промпт): 9/9, $0.0056, ≈3.9 с, но композиция «плывёт».
- Tier 0: 12 SVG перекрашены под насыщенную v2 (v2-строки пересозданы, 12), `assets:import`
  добавил 12.
- CLI acceptance (M3.6b.2): `pilot/robot` → `tier: provider`, `source: llm`; повтор — `cache`,
  `providerRequests: 0`.
- Визуальная оценка silhouette rules — `Not verified`
  (`out/m3-6b-5/pilot/gallery.html`).

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6b.3, episode-слой (PR #5).
- `feat/m3-5-1` — влит в `feat/m3-animated-factory` через PR #5; дальше не используется.
- Следующий срез: визуальный review v2, затем остаток M3.6b (raster-cutout,
  `cartoon-character`, третья тема) или M3.6c (дизайн-кит).

## Готово

- M3.6b.4: числовой PLAN и silhouette rules; `thinking` — дефолт, `max_tokens` 16000;
  A/B bus/palm/pirate — 9/9, $0.071.
- M3.6b.3: пресет `studio_flat_2d_v2` (дефолт, 16 слотов, насыщенность поднята), скругления
  в промпте, `recolor:starter`, пилот 10×3 (30/30, $0.0146).
- M3.6b.2: `DeepSeekSvgProvider` + `LlmJsonClient`, allowlist, ledger на attempt, `source: 'llm'`,
  миграция `0011`, `--provider=deepseek-svg` (только с `--persist`), пилот 10×3×3.
- M3.6b.1: alias `key → hash`, metadata-refresh, ledger `provider_usage`, Tier 0 в палитре,
  скелеты Recraft/FLUX.2 (parked).
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- Ничего не в работе; всё закоммичено этой сессией.

## Следующий шаг

1. Визуальный review `apps/render-worker/out/m3-6b-5/pilot/gallery.html`: bus/palm после
   silhouette rules + pirate как контроль.
2. Если композиция всё ещё не устраивает — двухшаговый plan-first вызов (план отдельным дешёвым
   запросом, рендер без thinking) для снижения цены стабильного режима.
3. Остаток M3.6b (raster-cutout, `cartoon-character`, третья тема) или M3.6c (дизайн-кит); плана нет.

## Открытые решения и блокеры

- Тариф LLM — фиксированный off-peak в env; `thinking` — дефолт, `max_tokens` 16000 (M3.6b.4).
  Per-run бюджеты — M3.7.
- Провайдер: обязательный retry на пустой/оборванный ответ (v3.1 bench: `terminated`).
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
