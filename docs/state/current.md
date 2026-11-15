# Состояние проекта

Обновлено: 2026-11-15 · Milestone: M3 (Animated Factory)
База: `main` @ `c4e5b05`.
Активная работа: `feat/m3-animated-factory`; M3.6b.7.4 закоммичен, дерево чистое.
План: M3.6b.7.4 выполнен; следующий — части персонажа (7.4.1), затем identity (7.5).
Направление: DeepSeek SVG за портом `ImageProvider`; Recraft/FLUX parked.

## Проверки

- `pnpm check` — зелёный (2026-11-15, после 7.4): contracts 194, providers 40, assets 88,
  render-worker 124, worker 165, web 142, api 74, db 21, storage 9, tiktok 30.
- Semantic layer (7.4): `storyboard:from-plan` → 5 сцен 1080×1920/30, h264, 25.8 s; кадры —
  `apps/render-worker/out/m3-6b-7/semantic/frames/`.
- Аксессуары и `point`: golden без аксессуаров 10/10; кадры —
  `apps/render-worker/out/m3-6b-7/accessories/frames/`.
- `character-accessories.json`: 3 сцены, 1080×1920/30, h264 (hat+glasses+point, scarf+wave).
- `character-recipes.json` (7.2): 3 сцены, 1080×1920/30; кадры в `out/m3-6b-7/recipes/frames/`.
- DeepSeek-приёмка (7.9): 2 generated subject, 3 строки ledger, $0.008464; 3 прогона — кэш.
- Визуальная оценка человеком и полный ролик с персонажем/аксессуарами — `Not verified`.

## Где идёт работа

- `feat/m3-animated-factory` — вся функциональность M3: M3.3–M3.6b.9, M3.6b.7.2–7.3,
  episode-слой (PR #5).

## Готово

- M3.6b.7.4: `CharacterPlan` (entity/strategy/accessories), роль из `scene.part`, слияние плана
  со слотом, demo `storyboard:from-plan`.
- M3.6b.7.3: аксессуары `glasses`/`scarf`/`hat`, поза `point`, геометрия в blueprint, z-порядок.
- M3.6b.7.2: слот `character` в hook-hero/fact-object/cta, общий `CharacterSvg`, эмоции директора.
- M3.6b.7.1: `cartoon-character` — 5 эмоций, idle/wave, anchor, кадры приёмки.
- M3.6b.9: `VISUALS_SOURCE`, resolver + DeepSeek SVG в `episode_plan`, ledger, бюджет, UI-статусы.
- M3.6b.8: `CharacterBlueprint`, golden-паритет, `docs/acceptance.md`, `assets:prune`.
- До этого: M3.6b.1–b.6, M3.5/M3.5.1, M3.4, M3.3, M3.6a.

## В процессе

- Ничего не в работе.

## Следующий шаг

1. M3.6b.7.4.1 — части персонажа (head/torso/hands) через `ImageProvider`, вместо процедурных
   примитивов; план 7.4 уже отделяет семантику от геометрии.
2. Дальше: identity и animal-риг (7.5), дизайн-кит M3.6c.
3. Галерея ассетов и регенерация одного слота — отдельный веб-срез.

## Открытые решения

- Источник визуалов по умолчанию `pixabay`; откат DeepSeek — одна переменная окружения.
- Стоимость в UI — только USD; рублёвая оценка запрещена (нет фиксированного курса).
- Один персонаж на сцену; диалог двух — отдельный контракт `characters[]`.
- Цвета аксессуаров: шляпа — `accent`, шарф и оправа — `ink`; дубликаты отвергаются схемой.
- Роль персонажа не приходит от модели: она выводится из `scene.part` (`hook`/`beat`/`cta`),
  эмоция и поза задаются жёсткой таблицей.
- ElevenLabs: квота исчерпана — episode-прогоны на `--tts google`.

## Не загружать на старте

- `SESSION_LOG.md` — только индекс; запись из `docs/sessions/` — по ссылке.
- `ROADMAP.md`, `ARCHITECTURE.md`, `docs/adr/*`, `docs/workspace/research/*`, неактивные планы.
- `node_modules`, `dist`, `apps/*/dist`, `apps/worker/out`, `pnpm-lock.yaml`.

## Актуальность

- Исторические факты не перепроверять без причины; изменяемые — ветка, HEAD, Git status, проверки.
- `Not verified` означает, что проверка не запускалась; это не «зелёный».
