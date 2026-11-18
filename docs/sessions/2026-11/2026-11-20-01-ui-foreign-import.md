# 2026-11-20 — UI-demo: приёмка чужих ответов, salvage, абсолютные линии

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-20-ui-demo-keep-scenes.md`

## Цель

Сцена теряется только тогда, когда её нельзя починить без изменения смысла; приёмка чужих
ответов должна быть воспроизводимой из репозитория.

## Результат

- `ui:import` (`src/ui-demo/film/import.ts`) читает `{thesis, scenes[]}`, маппит в эпизод,
  нормализует, печатает статус сцен и salvage; exit 1 при потере. CLI стартует только при
  прямом запуске — модуль импортируется тестами.
- Фикстуры `apps/render-worker/fixtures/foreign/{gpt,claude,deepseek}-subscriptions.json`
  взяты из `docs/workspace/prompts/` без правок.
- `fit/salvage.ts`: неизвестные параметры, `border: "none"`, числа вне диапазона,
  `shadow: true/false`, переходы вне контракта. Отчёт `Repair` печатают `ui:import`,
  `film/cli.ts`, `director/cli.ts`.
- `line` в абсолютных координатах (`devices/line-geometry.ts`), `layout` — рамка;
  `spec-episode.json` переведён на ту же конвенцию, семантика линии названа в промпте.
- `grab` удалён из `thumb`; `tone` добавлен к `pill`/`bubble`, `textColor` — к `label`.
- Гейт поверхности сравнивает с фоном объявленного `stage`.
- Галерея в вебе пересобрана (`ui:gallery`).

## Изменённые файлы

- `src/ui-demo/film/import.ts`, `import.spec.ts`, `package.json` — `ui:import`.
- `src/ui-demo/fit/salvage.ts`, `salvage.spec.ts`, `fit/normalize.ts` — salvage в нормализации.
- `src/ui-demo/devices/SpecRenderer.tsx`, `line-geometry.ts`, `line-geometry.spec.ts` — линии.
- `src/ui-demo/catalog.ts`, `primitives/index.tsx` — словарь чернил, `grab`.
- `src/ui-demo/quality.ts`, `quality.spec.ts` — гейт относительно стадии.
- `src/ui-demo/gallery/catalog.ts`, `apps/web/.../catalog.json`, playground — каталог.
- `src/ui-demo/spec-episode.json` — абсолютные точки линии.
- `fixtures/foreign/*.json` — три чужих ответа.

## Решения

- Salvage только для того, что не меняет смысл; геометрию не правит, отказ остаётся.
- Один словарь текста: оба имени параметра документированы, явный цвет выигрывает у тона.
- `grab` = молчаливый no-op, поэтому убран; нажатие — `drag`.
- Старая конвенция линии не поддерживается: фикстура мигрирована.

## Отклонения от плана

- Блок «Проверка» плана ссылался на `out/adapt-gpt.ts`; используется `ui:import`.
- Фикстура DeepSeek появилась позже и сразу вошла в набор.
- Claude сцена 1 стала 5.1 с вместо 5 — длительность не короче действия.

## Не проверено

- Полный `pnpm check` монорепо (запускались только `test`/`lint`/`typecheck` render-worker).
- Визуальная проверка веб-страницы галереи после пересборки каталога.
- Первый серый кадр ролика — не перепроверялся.

## Блокеры и следующий шаг

- Блокеров нет. Следующий срез — `docs/workspace/plans/2026-11-19-ui-demo-meaning.md`:
  десять тем, два эталона, просмотр. Кандидат в правило — «поверхность без содержания».
