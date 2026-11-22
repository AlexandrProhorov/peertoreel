# 2026-11-15 — M3.6b.7.3: аксессуары и поза point

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-15-m3-6b-7-3-accessories-session.md`

## Цель

Дать персонажу аксессуары как контракт (`glasses`, `scarf`, `hat`) и позу `point`, используя
z-зоны blueprint; внешний вид без аксессуаров не менять.

## Результат

- `accessories` в params и в слоте рецепта `character`: три значения, дефолт `[]`, дубликаты —
  `invalid_value` + дефолт.
- `point`: правая рука вытянута в сторону на уровне плеча (`pointHandRight` в blueprint).
- Геометрия шляпы/очков/шарфа — в `CharacterAccessoryGeometry`; цвета: шляпа — `accent`, шарф и
  оправа — `ink`.
- Вставка по базовым частям: шарф после `neck`, шляпа после `hair`, очки после `mouth`. Без
  аксессуаров набор фигур прежний (golden 10/10).
- `CharacterShape` ellipse/circle получили необязательный `stroke` для оправы.
- Промпт директора: `point` только для указания, аксессуары — максимум два без повторов.
- Приёмка: `examples/character-accessories.json` → 3 сцены 1080×1920/30, кадры в
  `out/m3-6b-7/accessories/frames/`.

## Изменённые файлы

- `packages/contracts/src/character.ts`, `storyboard.components.ts`, `storyboard.recipes.ts` (+ спеки).
- `apps/render-worker/src/character.ts`, `components/CartoonCharacter.tsx`, `RecipeLayers.tsx`, `mapping.ts`.
- `apps/worker/src/storyboard/prompt.ts`.
- `apps/render-worker/examples/character-accessories.json`.

## Решения

- Аксессуар — часть params/слота, не отдельный компонент: одна геометрия, один SVG-маппинг.
- Z-порядок задаёт blueprint (`ACCESSORY_AFTER`), а не порядок JSX.
- Шарф — `ink`: `accent` совпадает с торсом, аксессуар исчезает.
- Дубликаты отвергаются схемой, а не дедуплицируются молча.
- Полоса шарфа опущена ниже подбородка (`y=372`): выше её закрывает голова.

## Отклонения от плана

- Цвет и геометрию шарфа поправили после просмотра кадра, а не до кода.
- Пример приёмки расширен до трёх сцен: `storyboardSchema` требует минимум три.

## Не проверено

- Полный ролик (Remotion + FFmpeg + озвучка) с аксессуарами — `Not verified`.
- Живой прогон директора с аксессуарами — `Not verified`.
- Блокеров нет. Дальше: 7.4 — semantic layer и части персонажа.
