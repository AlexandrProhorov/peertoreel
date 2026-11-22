# 2026-11-18 — Галерея примитивов в вебе (iframe-песочница)

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** продолжение `docs/workspace/plans/2026-11-17-ui-demo-story-loop.md`

## Цель

Дать вебу вкладку, где видно все примитивы пилота: название, назначение, параметры и
дословный текст для модели, плюс живое превью тех же компонентов.

## Результат

- Вкладка `/gallery` в дашборде (`Примитивы` в навигации, под `authGuard`).
- `catalog.ts` стал единственным описанием примитива: из него собираются и `buildContractBrief()`,
  и `catalog.json` для Angular. Отдельной копии промпта больше нет.
- Playground — React на `@remotion/player` в iframe; Angular присылает
  `postMessage({channel:'ui-gallery', type:'preview'})`, playground отвечает `ready`/`error`.
- Настройки меняют превью сразу: числа клампятся в диапазон, enum проверяется, строка режется
  по `maxLength`.
- `avatar` и `object` скрыты тумблером: модель их не получает, у превью — локальные PNG.
- Исправлено по ходу проверки: статический `iframe [src]` Angular блокировал как
  недоверенный resource URL (NG0904) — теперь путь проходит через `bypassSecurityTrustResourceUrl`;
  таблица параметров больше не ломает верстку (`display: grid` на `td`), выпадающие списки
  показывают дефолты (`[selected]` на опциях), `flush()` не читает `viewChild` до готовности view.

## Изменённые файлы

- `apps/render-worker/src/ui-demo/gallery/{catalog,preview,build}.ts`, `app/main.tsx`, `README.md` — песочница.
- `apps/render-worker/src/ui-demo/director/contract-brief.ts` — промпт собирается из галереи.
- `apps/render-worker/package.json` — `ui:gallery`, зависимости `@remotion/player`, `esbuild`.
- `apps/web/src/app/features/gallery/**` — фича: каталог (zod), store, params, protocol, страница, превью.
- `apps/web/src/app/app.routes.ts`, `app.component.html` — маршрут и ссылка в навигации.
- `apps/web/public/gallery/**`, `apps/web/src/app/features/gallery/data-access/catalog.json` — сгенерировано.

## Решения

- Снимок данных, а не API: `apps/web` не должен зависеть от React/Remotion, а API — импортировать
  код рендерера.
- Сгенерированное лежит в репозитории; тест `gallery/catalog.spec.ts` падает, если `catalog.json`
  разошёлся с `catalog.ts`.
- Бандл `playground.js` (~1.1 MB) — статический ассет, в initial bundle не попадает.

## Отклонения от плана

- План Story Loop не менялся: срез закрывает последние два пункта DoD косвенно, но не заменяет
  просмотр роликов (разнообразие композиций по-прежнему не измерено).

## Не проверено

- В DevTools-скриншотах проверены `label` и `object` (тёмная и lime-темы); `track`, `grid`,
  `thumb`, `line` глазами не смотрели.
- `pnpm check` целиком не запускался; проверки — по пакетам.

## Блокеры и следующий шаг

- Нет. Кандидат: то же превью на параметрах из реального прогона директора.
