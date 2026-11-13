## 2026-11-10 — M3.4: Scene Recipes v1, слои и локальный starter SVG

**Статус:** DONE. Ветка `feat/m3-animated-factory`.

**Цель:** превратить рецепты сцен в данные (5 × 2–3 варианта), разделить `SceneObjects` на
переиспользуемые слои, включить локальный `image`/`subject`-слой и добавить стартовый SVG-пак
без запечённого текста; форму контракта зафиксировать в ADR-0016 до кода.

### Что изменено

- `docs/adr/0016-scene-recipe-contract.md` — D1–D9: ветка `implementation.type = 'recipe'`,
  каталог как данные, семантика слотов, starter-ключи, один visual source, один resolved value,
  закрытый набор слоёв, единый `camera.ts`, запрет маскировать ошибку рецепта через fallback.
- `packages/contracts/src/storyboard.recipes.ts` — 5 рецептов × 2 варианта, `RecipeSlotSpec`,
  layer plan, camera hint, `STARTER_ASSET_KEYS`/`STARTER_ASSET_CATALOG`, `parseRecipeSlots`,
  `recipeImplementationSchema`, typed-ошибки. В `storyboard.ts` добавлены ветка `recipe`,
  `subject` kind и валидация сцен; в `kinetic-typography` — `preset: 'backdrop'`.
- `apps/render-worker/src/recipes.ts` — единственный resolution рецепта в background + layers;
  `camera.ts` — shot/movement/speed/parallax; `components/layers/*` — text/pill/hud-chip,
  particles, light, overlay, character, chart (battery + comparison/process), subject/image;
  `SceneObjects` — тонкий диспетчер; `mapping.ts`/`props.ts`/`render.ts`/`SceneComposition.tsx`/
  `cli.ts` несут `recipe` и slot diagnostics.
- `apps/render-worker/public/assets/starter/` — 12 authored SVG (`dog-snout`, `water-drop`,
  `thermometer`, `scent-wave`, `brick`, `brick-wall`, `house`, `flame`, `shield`, `key-switch`,
  `clock`, `lightning`), без `<text>`/`<tspan>`.
- `examples/recipe-showcase.json` — 5 сцен: hook-hero, fact-object, comparison, process, cta.
- README, ROADMAP (M3.4 → DONE), ADR-0012 (раздел M3.4), `apps/render-worker/AGENTS.md`.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.3) | Требуемое изменение (M3.4) |
| --- | --- | --- |
| Контракт сцены | `implementation` = `programmatic` / `image_animation` / `ai_video` / `hybrid` | Добавить ветку `{ type: 'recipe', recipeId, variant, slots }`; `programmatic` остаётся escape hatch (ADR-0016 D1) |
| Каталог рецептов | Нет | `packages/contracts/src/storyboard.recipes.ts`: 5 id × 2–3 варианта, slot specs, background+params, layer plan, camera hint — только данные (ADR-0016 D2) |
| Слоты | Нет | `parseRecipeSlots` с семантикой `parseComponentParams`: required missing/invalid → typed error, optional invalid → default + diagnostic, unknown key → `unknown_key` (ADR-0016 D3) |
| Валидация storyboard | Проверяет окна, id, refs, transitions | Дополнительно валидирует recipeId/variant/slots и запрещает непустой `scene.objects` у recipe-сцены (ADR-0016 D3/D5) |
| Subject-ассеты | `kind: 'image'`/`'shape'` в `SceneObjects` возвращают `null` | Локальный `image`/`subject` слой рендерит `assets/starter/*.svg` через `resolveAssetKey` + `assetUrl`; неизвестный ключ → ошибка (ADR-0016 D4) |
| Стартовый пак | Только `public/assets/test-scene.svg` | 12 чистых плоских SVG без `<text>` в `public/assets/starter/` + каталог ключей/тегов/лицензий |
| Резолвинг сцены | `mapping.ts` → `{ componentId, params, source, diagnostics }` | + `recipe: { id, variant, layers } \| null`; неизвестный рецепт/вариант/layer → typed error, без generic-подмены (ADR-0016 D6/D9) |
| `SceneObjects` | Один файл: switch по kind, часть веток возвращает `null` | Тонкий диспетчер над `components/layers/*`; поведение legacy-сцен сохраняется; неизвестный kind падает явно (ADR-0016 D7) |
| Камера | `ParallaxCity` и `KineticTypography` считают движение сами; `shot`/`parallax` не влияют | `src/camera.ts` — единственный модуль; `shot`/`movement`/`speed`/`parallax` влияют на кадр; дефолт parallax `[0.15, 0.35, 0.6, 0.8, 1]` (ADR-0016 D8) |
| Input props Remotion | `{ scene, style, resolved: { componentId, params }, wordTimings? }` | + nullable `recipe`; source/diagnostics остаются вне Remotion |
| CLI/манифест | Манифест: componentId/source/params diagnostics | + `recipeId`, `variant`, slot diagnostics; интерфейс CLI не меняется |
| Примеры | `custom-storyboard.json`, fixture «−15°» | + `examples/recipe-showcase.json` (5 рецептов, предметные SVG); оба старых входа рендерятся как раньше |
| Тесты | Params/mapping/timing/assets/boundary | + каталог, слоты, resolution/diversity, слои, камера, starter SVG (существование и отсутствие `<text>`), showcase JSON |

### Проверено

- `pnpm check` — зелёный (lint, typecheck, tests, build; см. итоговые числа ниже).
- Контракты: 14 файлов / **137 тестов**; render-worker: 11 файлов / **84 теста**. Тесты не
  запускают Chrome и не вызывают `renderMedia`.
- Рендер showcase (5 сцен): **78.5 с**; fixture (6 сцен): **135.9 с**; custom (4 сцены):
  **77.7 с**. Все клипы — `h264`, 1080×1920, 30 fps, `yuv420p`, `bt709`/`bt709`/`bt709`, без
  аудиодорожки; длительности 6/6/6/5/5 с совпадают со входом.
- Детерминизм showcase: SHA-256 `scene-0` одинакова в полном прогоне, одиночном рендере и при
  рендере после CTA в одном процессе (`out/order-check`). `scene-4` также совпала с полным
  прогоном.
- Смена варианта (`hook-hero/subject-lead` → `ghost-question`) меняет background и SHA-256 кадра.
- Невалидные входы: неизвестный `recipeId` → Zod enum; неизвестный `variant` → путь
  `scenes.0.implementation.variant`; отсутствующий required slot → путь к слоту; неизвестный
  `assetKey` → путь `...slots.subject.assetKey`; все завершаются exit 1 до рендера.
- Невалидный optional slot (`cta.subtitle = 42`) → рендер успешен, в логе и `manifest.json`
  есть `slotDiagnostics[{path:'subtitle',reason:'invalid_value',received:42}]`.
- Визуально: 5 рецептов дают разные экраны (сюжетный subject, факт-пилюля, bar-сравнение,
  process-steps, CTA-плитка); предметные SVG читаемы; текстовых узлов внутри SVG нет.
- Fixture и `custom-storyboard.json` рендерятся, fallback/implementation выбираются как раньше.

### Не проверено / ограничения

- Полная сборка showcase с озвучкой, ASS-субтитрами и FFmpeg concat не выполнялась — это M3.5.
- Камера M3.4 меняет кадры legacy-сцен: `shot` и `parallax` теперь реально влияют на кадр
  (требование M3.4). Длительности, состав сцен и тайминги не изменились, но пиксельного
  совпадения с M3.3 нет — это осознанное изменение поведения камеры.
- Кросс-платформенный пиксельный паритет Windows/Linux не проверялся (шрифты/Chrome).
- `chart`-примитивы покрывают сравнение и шаги; сложные диаграммы/выноски — M3.5/M3.6.
- `character` по-прежнему поддерживает только `car`; параметрический rig — M3.6.
- Docker-образ M3.4 не собран: Docker daemon (`dockerDesktopLinuxEngine`) не запущен на машине
  сессии; `docker build` завершился ошибкой подключения к API. Dockerfile не менялся.

### Теория сессии

- **Рецепт — это данные, а не компонент.** `StoryboardRecipe`/`RecipeVariant` в
  `storyboard.recipes.ts` описывают слоты, фон, камеру и layer plan; renderer не знает тему и не
  содержит `DogNose.tsx`. DeepSeek в M3.5 сможет выбрать `recipeId` и заполнить слоты, не
  трогая код.
- **Один resolved value.** `parseRecipeSlots` → `resolveRecipeScene` → `mapping.ts` дают
  `{ componentId, params, recipe }`; `SceneComposition` не выбирает рецепт повторно. Это то же
  правило, что `source`/`diagnostics` в M3.3: лог-поля не влияют на кадр.
- **Слоты — контракт с диагностикой.** Required slot отсутствует → typed error; optional
  некорректен → default + `invalid_value` с `path`/`received`; лишний ключ → `unknown_key`.
  Ошибка не исчезает: CLI пишет её в лог и манифест.
- **Неизвестный assetKey — ошибка схемы.** Subject-слот принимает только `STARTER_ASSET_KEYS`;
  это защищает от «пустого кадра» и от галлюцинаций путей будущим режиссёром.
- **Слои — закрытый набор.** `sceneObjectRenderer`/`recipeRenderer` в `layer-kind.ts` дают
  явную таблицу kind → renderer; default бросает. `SceneObjects` стал диспетчером, а не местом
  для визуального языка.
- **Камера — чистая математика.** `camera.ts` не использует React/Remotion/wall clock:
  `shotScale`, `movementMotion`, `parallaxCoefficient`, `cameraTransform`. Поэтому её можно
  тестировать без Chrome, а компоненты только применяют CSS-трансформ.
- **Parallax — это глубина, а не украшение.** Коэффициент 0 — дальний план, 1 — ближний;
  отсутствие массива использует документированный default, поэтому кадр детерминирован.
- **Единственный visual source.** Recipe-сцена обязана иметь пустой `scene.objects`; иначе два
  layout-а боролись бы за кадр. Legacy-сцены наоборот рисуются только из `scene.objects`.
- **SVG без текста.** Стартовый пак содержит только геометрию; русские подписи, числа и
  выноски рисует Remotion (`RecipeTextLayer`, `RecipeChartLayer`). Это Hard Rule 10 и заодно
  страховка от кривых подписей внутри картинки.
- **Детерминизм проверяется хешем.** Одинаковые recipe+variant+seed дают одинаковый SHA-256;
  порядок сцен не влияет на кадр; вариант меняет кадр. Это дешёвая проверка, которую можно
  повторять в CI без визуального review.

### Следующая сессия

M3.5 — End-to-end animation spike: DeepSeek-режиссёр получает каталог M3.4 и `STARTER_ASSET_KEYS`,
выдаёт `storyboard.v1` для тем «Почему у собак мокрый нос?» и «Почему дома строят из кирпича?»;
render worker рендерит сцены, FFmpeg собирает ролик.

---

