# Состояние проекта

Обновлено: 2026-11-14 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05`.
Активная работа: `feat/m3-animated-factory`; HEAD — срез M3.6b.8 (тег `m3.6b-acceptance`),
дерево чистое.
План: M3.6b.8 выполнен; следующий — веб-интеграция DeepSeek SVG (M3.6b.9).
Направление: DeepSeek SVG за портом `ImageProvider`; Recraft/FLUX parked.

## Проверки

- `pnpm check` — зелёный (2026-11-14, после M3.6b.8): contracts 177, providers 40, assets 88,
  render-worker 120, worker 145, web 140, api 74, db 21, storage 9.
- `CharacterBlueprint` (`packages/contracts/src/character.ts`) — canvas 400×700, `view: 'front'`,
  14 anchors, 6 bounds, `drawOrder`, 5 z-зон; golden-тест 10/10 (5 эмоций × 2 позы).
- Пиксельный паритет M3.6b.8: сцена 0, отрендеренная кодом `4d50869` и новым, — один и тот же
  MP4 (`8810B756…`).
- `assets:prune --dry-run`: 24 сироты → удалены; повторный прогон — 27 объектов, 0 сирот.
- Версии в ledger и манифесте: `promptVersion` (v3.1), `promptHash`, `blueprintVersion`, `styleId`.
- `cartoon-character`: 5 эмоций (neutral/happy/surprised/angry/sad), позы idle/wave, `anchor`,
  цвета в params; кадры — `apps/render-worker/out/m3-6b-8/frames/`.
- Визуальная оценка персонажа человеком — `Not verified` (кадры 0–4 в `out/m3-6b-7/frames`).
- Raster-cutout: fake-провайдер отдаёт `24×24` PNG → `tier: provider`, `kind: raster-cutout`,
  hash по обрезанным байтам; пустой cutout и непрозрачный фон → fallback.
- Guard SVG: фикстура роутера с изометрией ловится (`top_face_polygon`,
  `perspective_transform`), чистая геометрия проходит.
- Acceptance `wifi-wall` (2026-11-13): 7 сцен, 5/6 generated, 2 вызова, $0.005104; кэш-повтор —
  0 строк ledger; `--provider=none`/`unavailable`/`empty`/budget → Tier 0, рендер завершён.
- Ролик `wifi-wall`: 48.7 с, 1080×1920/30, h264+aac, `audioGaps 0.051`.
- Веб-генерация SVG — `Not verified`: кода интеграции нет, только план.
- Runbook трёх приёмок — `docs/acceptance.md`.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6b.8, episode-слой (PR #5).

## Готово

- M3.6b.8: `CharacterBlueprint` в contracts, рендер из blueprint без визуальных изменений,
  `docs/acceptance.md`, версии в ledger/манифесте, `assets:prune` + удаление 24 сирот.
- M3.6b.7.1: `cartoon-character` — процедурный ведущий (5 эмоций, idle/wave, anchor), чистая
  `characterLayers`, SVG-компонент, пример и кадры приёмки.
- M3.6b.6: raster-cutout — `fast-png` пайплайн, ветвление резолвера по encoding, cutout 8–75 %,
  trim и hash по обрезанным байтам, persist PNG.
- M3.6b.5.1: структурный guard SVG (верхняя грань, `transform`) → retry → fallback.
- M3.6b.5: generated subjects (`subject/<slug>` + `fallbackIcon` + `prompt`), fallback после
  ошибки провайдера, реальные attempts/cost, budget stop-crank, плоская проекция.
- M3.6b.4–b.1: промпт v3.1, пресет v2, провайдер, alias и ledger.
- До этого: M3.3 renderer, M3.4 recipes, M3.5/M3.5.1 episode, M3.6a/6a.1 asset library.

## В процессе

- Ничего не в работе.

## Следующий шаг

1. `docs/workspace/plans/2026-11-14-web-deepseek-visuals-session.md` (M3.6b.9): `episode_plan`
   берёт subject-ассеты из резолвера + DeepSeek за `VISUALS_SOURCE`, persist, ledger, лимит
   `ASSET_LLM_MAX_USD_PER_RUN=0.25`, fallback, UI-статусы; стоимость в UI — только USD.
2. `docs/workspace/plans/2026-11-14-m3-6b-7-2-character-in-recipes-session.md`: персонаж как слой
   рецепта и выбор эмоции директором.
3. Дальше: аксессуары как контракт (7.3, z-зоны blueprint), semantic layer/части (7.4),
   identity (7.5).

## Открытые решения и блокеры

- Персонаж MVP — только фронтальный вид; профиль/три четверти — отдельный срез.
- Животные — `standalone_character`, не трансформация базы.
- Vision-QC персонажа — после пилота генерации частей.
- Веб-источник визуалов по умолчанию `pixabay` до приёмки `deepseek-svg`.
- M3.6b.9: повтор стадии с кэшем — успех без вызова провайдера; force-перегенерация не входит.
- ElevenLabs: квота исчерпана — episode-прогоны на `--tts google` до пополнения.
- M3.6c дизайн-кит (`fallbackIcon`-промоушен, `role`, promote) — позже.
- Миграций схемы в M3.6b.8 нет.

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
