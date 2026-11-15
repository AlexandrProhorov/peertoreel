# 2026-11-15 — M3.6b.7.3: аксессуары и поза point

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-15-m3-6b-7-3-accessories-session.md`

## Цель

Дать персонажу аксессуары как контракт (`glasses`, `scarf`, `hat`) и позу `point`, используя
z-зоны blueprint; внешний вид без аксессуаров не менять.

## Результат

- `CARTOON_CHARACTER_ACCESSORIES` и поле `accessories` в `cartoonCharacterParamsSchema` и в слоте
  рецепта `character`: максимум три, дубликаты отвергаются (field-level `invalid_value`).
- `CARTOON_CHARACTER_POSES += 'point'`; правая рука вытянута в сторону на уровне плеча
  (`pointHandRight` в blueprint).
- Геометрия шляпы, очков и шарфа — в `CharacterAccessoryGeometry` blueprint; цвета: шляпа —
  `accent`, шарф и оправа — `ink`.
- `characterLayers` вставляет фигуры после базовых частей по `ACCESSORY_AFTER`: шарф после `neck`,
  шляпа после `hair`, очки после `mouth`. Без аксессуаров набор фигур прежний (golden 10/10).
- `CharacterShape` ellipse/circle получили необязательный stroke для оправы; SVG-маппинг обновлён.
- Промпт директора: `point` только для указания, аксессуары — максимум два без повторов.
- Приёмка: `examples/character-accessories.json` → 3 сцены, 1080×1920/30, кадры в
  `out/m3-6b-7/accessories/frames/`: point+hat+glasses, glasses+scarf, wave+scarf.

## Изменённые файлы

- `packages/contracts/src/character.ts` — accessories, point, геометрия.
- `packages/contracts/src/storyboard.components.ts`, `.spec.ts` — поле и тесты.
- `packages/contracts/src/storyboard.recipes.ts`, `.spec.ts` — слот с аксессуарами.
- `apps/render-worker/src/character.ts`, `character.spec.ts` — вставка фигур, point.
- `apps/render-worker/src/components/CartoonCharacter.tsx` — stroke у ellipse/circle.
- `apps/render-worker/src/components/RecipeLayers.tsx` — accessories в params.
- `apps/render-worker/src/mapping.ts` — accessories в схеме слоя.
- `apps/worker/src/storyboard/prompt.ts` — правила.
- `apps/render-worker/examples/character-accessories.json` — пример приёмки.

## Решения

- Аксессуары — часть params/слота, а не отдельные компоненты: одна геометрия, один маппинг.
- Z-порядок задаёт blueprint через `ACCESSORY_AFTER`, а не порядок вызовов в JSX.
- Шарф — `ink`, потому что `accent` совпадает с торсом и аксессуар исчезает.
- Дубликаты аксессуаров — ошибка схемы, а не тихая дедупликация.
- Широкая манжета шарфа опущена ниже подбородка (`y=372`): выше её целиком закрывает голова.

## Отклонения от плана

- Шарф в первой версии был акцентным и невидимым; цвет и геометрию пришлось поправить после
  просмотра кадра, а не до кода.
- Пример приёмки расширен до трёх сцен: `storyboardSchema` требует минимум три.

## Не проверено

- Ролик целиком (Remotion + FFmpeg + озвучка) с аксессуарами — `Not verified`.
- Живой прогон директора: правила аксессуаров в промпте, но модель на теме не запускалась.

## Блокеры и следующий шаг

- Блокеров нет.
- Дальше: 7.4 — semantic layer и части персонажа.
