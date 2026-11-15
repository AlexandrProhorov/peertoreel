# 2026-11-15 — M3.6b.7.4: semantic layer персонажа

**Статус:** DONE · **Ветка:** `feat/m3-animated-factory`
**План:** `docs/workspace/plans/2026-11-15-m3-6b-7-4-semantic-parts-session.md`
Цель

Ведущий описывается семантически (`CharacterPlan`), роль и выражение выводятся из `scene.part`,
builder превращает план в параметры слота `character`.
Результат

- `characterPlanSchema`: `entity` 1–80, `strategy` (дефолт `transformation`), `accessories`; поля
  `role` нет. `characterAccessoriesSchema` общая для плана и слота, дубликаты отвергаются.
- `CHARACTER_ROLE_EXPRESSION` + `characterRoleForPart(part)`: `hook → surprised/idle`,
  `beat → neutral/idle`, `cta → happy/wave`.
- `resolveCharacterPlan(plan, part)` → `{ preset: 'host', emotion, pose, anchor: 'center',
  accessories }`; `standalone_character` → `UnsupportedCharacterStrategyError`.
- Драфт: `characterPlan` опционален; план + `slots.character` → issue на `characterPlan`, а
  непровалидированный драфт ловит `InvalidRecipeSlotError` в builder.
- `buildStoryboardFromDraft` вливает план в слот; вариант без character-слоя →
  `StoryboardCharacterPlanError` с `sceneId`, `recipeId`, `variant`.
- Промпт: shape плана, запрет эмоции/позы/anchor/координат/частей, аксессуары ≤ 2 без повторов;
  слот `character` — «не заполняй».
- Demo `storyboard:from-plan` + `examples/character-plan-draft.json` (5 сцен, 63 слова), приёмка:
  5 клипов 1080×1920/30, h264/yuv420p, кадры в `apps/render-worker/out/m3-6b-7/semantic/frames/`;
  hook — surprised + glasses, cta — happy/wave + scarf.
- Тесты: contracts 194 (+9), worker 165 (+7). `pnpm check` зелёный (2026-11-15).
Изменённые файлы

- `packages/contracts/src/{character,storyboard.recipes,storyboard.director}.ts` (+ спеки);
  `apps/worker/src/storyboard/{build,prompt,from-plan}.ts` (+ спеки), `package.json`, пример драфта.
- `ROADMAP.md`, `SESSION_LOG.md`, `docs/state/current.md`.
Решения

- Роль — производная от `scene.part`: конфликт «план vs сцена» невозможен по построению; чужая
  стратегия или отсутствие character-слоя — явная ошибка, без подмены host-ом.
- Demo: фиксированный `runId`, синтетические 0.4 с/слово, строку в БД не создаёт.
Отклонения от плана

- Слот `character` в промпте отдаёт инструкцию вместо JSON-shape: иначе модель заполняет слот и
  попадает в конфликт. `anchor: 'center'` фиксирован, слой размещает рецепт.
Не проверено

- Живой прогон директора с `characterPlan`, оценка кадров человеком, полный ролик с озвучкой и
  FFmpeg — `Not verified` (кадры просмотрены только агентом).
Блокеры и следующий шаг

- Блокеров нет. Дальше: 7.4.1 — части персонажа через `ImageProvider`, затем 7.5 identity.
