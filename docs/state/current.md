# Состояние проекта

Обновлено: 2026-11-15 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05`.
Активная работа: `feat/m3-animated-factory`; HEAD — срез M3.6b.7.2, дерево чистое.
План: M3.6b.7.2 выполнен; следующий — аксессуары и поза point (M3.6b.7.3).
Направление: DeepSeek SVG за портом `ImageProvider`; Recraft/FLUX parked.

## Проверки

- `pnpm check` — зелёный (2026-11-15, после M3.6b.7.2): contracts 182, providers 40, assets 88,
  render-worker 122, worker 158, web 142, api 74, db 21, storage 9.
- `character-recipes.json`: 3 сцены (hook-hero/ghost-question, fact-object/stage, cta/prop),
  1080×1920/30, h264; кадры — `apps/render-worker/out/m3-6b-7/recipes/frames/`.
- Слот `character` валидируется как остальные: дефолты, `invalid_value`, отсутствие слота —
  сцена валидна; слой пропускается.
- `VISUALS_SOURCE=deepseek-svg` через веб-стадию: 5 episode-прогонов, 2 generated subject
  (`subject/dog-nose`, `subject/dog-snout`), 3 строки `provider_usage` (`run_id`, `source=worker`),
  $0.008464; три прогона — кэш (`providerRequests 0`, новых строк нет).
- Бюджет прогона `ASSET_LLM_MAX_USD_PER_RUN=0.25` не достигнут; остановка по бюджету проверена
  юнит-тестом, не в живом прогоне.
- `docs/acceptance.md` — три M3.6 приёмки + раздел deepseek-svg.
- `CharacterBlueprint` (M3.6b.8): golden 10/10, пиксельный паритет подтверждён одинаковым MP4.
- `assets:prune`: 24 сироты удалены; 27 объектов, 0 сирот.
- `cartoon-character`: 5 эмоций, idle/wave, кадры — `apps/render-worker/out/m3-6b-8/frames/`.
- Визуальная оценка персонажа и превью эпизода в браузере человеком — `Not verified`.
- Raster-cutout: PNG 24×24 → `tier: provider`, `kind: raster-cutout`, hash по обрезанным байтам.
- Guard SVG: изометрия ловится (`top_face_polygon`, `perspective_transform`).
- Ролик `wifi-wall` (2026-11-13): 48.7 с, 1080×1920/30, h264+aac, `audioGaps 0.051`.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6b.9, M3.6b.7.2, episode-слой
  (PR #5).

## Готово

- M3.6b.7.2: слот рецепта `character` (preset/emotion/pose/anchor), слой в hook-hero,
  fact-object и cta, рендер тем же `CharacterSvg`, правила эмоций в промпте директора.
- M3.6b.9: `VISUALS_SOURCE` (`pixabay` по умолчанию), resolver + DeepSeek SVG в `episode_plan`,
  persist в библиотеку, ledger с `run_id`, лимит на прогон, деградация слотов в Tier 0,
  решения по каждому subject (`subjects[]`) и UI-статусы; Pixabay-путь сохранён.
- M3.6b.8: `CharacterBlueprint`, рендер из blueprint без визуальных изменений,
  `docs/acceptance.md`, версии в ledger/манифесте, `assets:prune`.
- M3.6b.7.1: `cartoon-character` — 5 эмоций, idle/wave, anchor, чистые `characterLayers`.
- M3.6b.6: raster-cutout — `fast-png`, trim/hash по обрезанным байтам, persist PNG.
- M3.6b.5.1: структурный guard SVG → retry → fallback.
- M3.6b.5: generated subjects, fallback, реальные attempts/cost, budget stop-crank.
- M3.6b.4–b.1: промпт v3.1, пресет v2, провайдер, alias и ledger.
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- Ничего не в работе.

## Следующий шаг

1. `docs/workspace/plans/2026-11-14-m3-6b-7-3-accessories-session.md` (план ещё не создан):
   аксессуары (`glasses`, `scarf`, `hat`) и поза `point`; z-зоны blueprint уже готовы.
2. Дальше: semantic layer/части (7.4), identity (7.5).
3. Галерея ассетов и регенерация одного слота — отдельный веб-срез.

## Открытые решения и блокеры

- Веб-источник визуалов по умолчанию `pixabay` до приёмки `deepseek-svg`; откат — одна
  переменная окружения.
- Стоимость в UI — только USD; рублёвая оценка запрещена (нет фиксированного курса).
- Повтор стадии с кэшем — успех без вызова провайдера; force-перегенерация не входит.
- Персонаж MVP — только фронтальный вид; профиль/три четверти — отдельный срез.
- Один персонаж на сцену; диалог двух — отдельный контракт `characters[]`.
- В рецепте позицию и размер задаёт layout слоя; `anchor` в слоте принимается ради
  совместимости с `cartoon-character`, но рецепт его не использует.
- Животные — `standalone_character`, не трансформация базы.
- Vision-QC персонажа — после пилота генерации частей.
- ElevenLabs: квота исчерпана — episode-прогоны на `--tts google` до пополнения.
- M3.6c дизайн-кит (`fallbackIcon`-промоушен, `role`, promote) — позже.

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
