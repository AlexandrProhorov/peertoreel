# 2026-11-15 — M3.6b.7.2: персонаж как слой рецепта и выбор эмоции директором

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-m3-6b-7-2-character-in-recipes-session.md`

## Цель

Сделать `cartoon-character` участником раскадровки: слот `character` в рецептах, слой в
варианте композиции, эмоция/поза из слота и правила для директора.

## Результат

- `RECIPE_SLOT_KINDS += 'character'`; значение `{preset:'host', emotion, pose, anchor}` с
  дефолтами (`neutral`/`idle`/`center`) и `invalid_value`, как у остальных слотов.
- Слот добавлен в `hook-hero`, `fact-object`, `cta`; слой `character` — в варианты
  `ghost-question`, `stage`, `prop`. Когда слот не задан, слой пропускается и кадры прежних
  сцен не меняются.
- `resolveRecipeScene` связывает слот в `ResolvedRecipeLayer.character`, а не в `content`;
  `content` остаётся для legacy-статических character-слоёв (`car`).
- `RecipeLayers` рендерит персонажа через общий `CharacterSvg`; высота — от размера слоя,
  акцент — из `style.palette.accent`, эмоция/поза — из слота.
- Промпт директора: shape `character`, максимум один персонаж на сцену, эмоция по роли
  (hook → surprised, cta → happy), смена эмоции не реже чем раз в две сцены, `wave` только
  в приветствии/cta.
- Приёмка: `examples/character-recipes.json` → 3 сцены, 1080×1920/30, h264; кадры в
  `out/m3-6b-7/recipes/frames/` (персонаж + текст в одном кадре).

## Изменённые файлы

- `packages/contracts/src/character.ts` — enums эмоций/поз/якорей переехали в листовой модуль.
- `packages/contracts/src/storyboard.components.ts` — реэкспорт enums.
- `packages/contracts/src/storyboard.recipes.ts`, `.spec.ts` — kind/schema/helper/слои/тесты.
- `apps/render-worker/src/recipes.ts`, `recipes.spec.ts` — `character` в резолве.
- `apps/render-worker/src/mapping.ts` — поле `character` в схеме слоя.
- `apps/render-worker/src/components/CartoonCharacter.tsx` — `CharacterSvg` + прежний wrapper.
- `apps/render-worker/src/components/RecipeLayers.tsx` — рендер слоя и высота по размеру.
- `apps/worker/src/storyboard/prompt.ts`, `prompt.spec.ts` — shape и правила.
- `apps/render-worker/examples/character-recipes.json` — пример приёмки.

## Решения

- Три рецепта (`hook-hero`, `fact-object`, `cta`), по одному варианту на слой — минимальный
  риск и покрытие hook/факт/cta.
- Дефолт слота — `neutral`; эмоцию по роли выставляет директор, а не контракт.
- Один `character`-слот на вариант; диалог — отдельный контракт.
- Enums вынесены в `character.ts`: импорт из `storyboard.components` замыкал цикл
  `storyboard → recipes → components → storyboard` и ронял схемы при загрузке.
- `anchor` в слоте принимается, но рецепт использует layout; позиция — свойство каталога.

## Отклонения от плана

- Слой добавлен по одному варианту на рецепт (план допускал один-два).
- В `fact-object/stage` и `cta/prop` плашка частично перекрывает торс персонажа: слой стоит
  раньше текста по требованию «фон → персонаж → текст». Это композиционное решение, не баг.
- Визуальная оценка человеком не запрашивалась: кадры просмотрены агентом.

## Не проверено

- Ролик целиком с персонажем в рецептах (Remotion-сцены + FFmpeg + озвучка) — `Not verified`.
- Директор на живой теме со слотом `character`: промпт обновлён, прогон не делался.

## Блокеры и следующий шаг

- Блокеров нет.
- Дальше: 7.3 — аксессуары (`glasses`, `scarf`, `hat`) и поза `point` на z-зонах blueprint.
