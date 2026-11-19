# UI gallery

Песочница примитивов: один примитив, его контракт и его текст для модели — на одной
странице в дашборде (`/gallery`). Превью рисует не картинка, а настоящий `SpecRenderer`
внутри iframe, поэтому в кадре тот же React-рендерер, что и в роликах.

## Как это устроено

- `catalog.ts` — единственное описание примитива. Из него собираются и промпт режиссёра
  (`director/contract-brief.ts`), и `catalog.json` для Angular.
- `preview.ts` — синтетическая сцена из одного элемента: раскладка, стартовое состояние и
  второй cue (`type` / `fill` / `draw` / `drag`), чтобы поведение было видно.
- `app/main.tsx` — React-playground на `@remotion/player`. Angular присылает
  `postMessage({ channel: 'ui-gallery', type: 'preview', primitiveId, params, themeId })`,
  playground отвечает `ready` / `error`.
- `build.ts` — одна команда собирает обе половины.

## Пересобрать

```bash
pnpm --filter @peertoreel/render-worker ui:gallery
```

Команда пишет:

- `apps/web/src/app/features/gallery/data-access/catalog.json` — описание и дефолты;
- `apps/web/public/gallery/playground/` — бандл (`playground.js` ~1.1 MB, `playground.css`,
  woff2 Onest);
- `apps/web/public/gallery/assets/ui-emoji/` — PNG для `avatar` и `object`.

Сгенерированное лежит в репозитории: сборка веба не должна требовать React и Remotion.
Свежесть стережёт тест `gallery/catalog.spec.ts` — он падает, если `catalog.json` разошёлся
с `catalog.ts`.

## Что видно в интерфейсе

- 9 примитивов, которые получает режиссёр; `avatar` и `object` скрыты за тумблером, потому
  что ключ ассета приходит только из локальной библиотеки.
- Параметры с диапазонами и стартовыми значениями, переходы/состояния/операции и блок
  «текст для модели» — дословно те строки, что уходят в промпт.
- Настройки меняют превью сразу: значения проверяются теми же правилами, что и контракт
  (диапазон, enum, длина строки).
