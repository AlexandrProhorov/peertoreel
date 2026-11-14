# 2026-11-14 — M3.6b.8: freeze, CharacterBlueprint, acceptance и prune

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-freeze-blueprint-session.md`

## Цель

Закрыть M3.6b.7.1: вынести геометрию персонажа в `CharacterBlueprint`, зафиксировать приёмочный
runbook и убрать сиротские объекты S3 — без изменения внешнего вида персонажа.

## Результат

- `CharacterBlueprint` (`packages/contracts/src/character.ts`): canvas 400×700, `view: 'front'`,
  bounds (голова/шея/торс/плечи/кисти), 14 anchors, `drawOrder` и 5 z-зон
  (`behind-body`, `behind-head`, `over-body`, `over-hair`, `above-face`). Геометрия губ и волос — там же.
- `characterLayers` строит фигуры из blueprint. Golden-тест: digest геометрии для 5 эмоций × 2 поз
  совпадает с фикстурой, снятой до рефакторинга (10/10).
- Побайтовый паритет: сцена 0, отрендеренная кодом HEAD (`4d50869`) и новым, дала идентичный
  MP4 (`8810B756…`), т.е. рефакторинг пиксель-в-пиксель.
- Версии: `SVG_PROMPT_VERSION = 'v3.1'` + хэш system-промпта и `blueprintVersion` в
  `provider_usage.meta`; `promptVersion`/`blueprintVersion`/`styleId` в манифесте рендера.
- `assets:prune` (apps/worker): `ObjectStorage.listKeys`, `DrizzleAssetRepository.listObjectKeys`,
  чистая логика `planAssetPrune`/`pruneAssetObjects` в `packages/assets`. Dry-run по умолчанию.
- Удалено 24 сироты (12 из M3.6b.1 + поздние прогоны); после удаления 27 объектов, 0 сирот.
- `docs/acceptance.md`: три приёмки (wifi-wall, raster-cutout, cartoon-character) с командами.
- `pnpm check` зелёный: contracts 177, providers 40, assets 88, render-worker 120, worker 145,
  web 140, api 74, db 21, storage 9.

## Изменённые файлы

- `packages/contracts/src/character.ts`, `character.spec.ts`, `index.ts` — blueprint и тесты.
- `apps/render-worker/src/character.ts`, `character.spec.ts` — рендер из blueprint, golden.
- `apps/render-worker/src/cli.ts` — версии в манифесте.
- `packages/providers/src/deepseek-svg.ts`, `deepseek-svg.spec.ts` — promptVersion/promptHash/blueprintVersion.
- `packages/assets/src/prune.ts`, `prune.spec.ts`, `index.ts` — логика prune.
- `packages/storage/src/storage.ts` — `listKeys`.
- `packages/db/src/assets-repository.ts` — `listObjectKeys`.
- `apps/worker/src/assets/prune.ts`, `package.json` — CLI `assets:prune`.
- `docs/acceptance.md`, `docs/state/current.md`, `SESSION_LOG.md` — runbook и статус.

## Решения

- Blueprint — единственный источник координат; эмоции (browY, eyeRy, pupilDy, вид рта) остаются
  в рендерере: это выражение, а не тело.
- Golden-фикстура — digest канонического JSON (сортировка ключей), чтобы порядок полей не влиял.
- Рот исторически не следует за `bob`; сохранено ради пиксельного паритета, зафиксировано комментарием.
- Prune удаляет только объекты без строки в `asset_variants`; объект со строкой не трогается никогда.
- `promptHash` фиксирует точный system-промпт (с палитрой), версия — семейство правил.

## Отклонения от плана

- Сирот было 24, а не 12: после M3.6b.1 добавились объекты raster и acceptance-прогонов.
  Пользователь подтвердил удаление всех 24.
- Сравнение с `out/m3-6b-7/frames` дало SSIM 0.996–0.998 (кадры сняты с другого номера кадра
  и в 360×640), поэтому паритет доказан побайтовым рендером, а не этими JPEG.

## Не проверено

- Визуальная оценка персонажа человеком — `Not verified` (кадры не пересматривались заново).
- Веб-интеграция DeepSeek SVG — `Not verified`, кода нет.

## Блокеры и следующий шаг

- Блокеров нет. Тег `m3.6b-acceptance` на коммите M3.6b.8.
- Дальше: `docs/workspace/plans/2026-11-14-web-deepseek-visuals-session.md` (M3.6b.9), затем 7.2.
