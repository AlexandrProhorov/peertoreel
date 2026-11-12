## 2026-11-08 — fix(web): убрать протухающий Vite-кэш для `@peertoreel/contracts`

**Цель:** после добавления экспорта в контракты web больше не падает с
`does not provide an export named '<schema>'` и не требует ручной чистки `.angular/cache`.

**Причина:** Vite пре-бандлил `@peertoreel/contracts` в `apps/web/.angular/cache`, а ключ
кэша зависимостей не зависит от содержимого `packages/contracts/dist` — новый `dist` не
инвалидировал пре-бандл, поэтому ни перезапуск `pnpm dev`, ни Ctrl+Shift+R не помогали.

**Сделано:**

- `apps/web/angular.json`: `serve.options.prebundle.exclude: ["@peertoreel/contracts"]` —
  контракты собираются в чанки приложения, кэш зависимостей на них больше не влияет.
- `apps/web/package.json`: `zod` объявлен зависимостью web — исключённые контракты
  импортируют `zod`, и в pnpm-изоляции Vite не резолвил его из корня приложения
  (`Failed to resolve import "zod"`).
- `pnpm dev` запускает `contracts` в watch-режиме: dev-сервер web пересобирается на
  изменение `packages/contracts/dist`, перезапуск не нужен.
- `apps/web`: скрипт `clean` (удаляет `.angular/cache`) как аварийный выход.
- README: troubleshooting переписан под постоянное решение вместо ручной чистки кэша.

**Проверено:**

- Cold start после `pnpm --filter @peertoreel/web clean`: в `vite/deps` нет
  `@peertoreel_contracts.js`, есть `zod.js`; контракты внутри чанков приложения.
- Правка `packages/contracts/dist` при запущенном dev-сервере → `Changes detected` и
  пересборка; новое значение попало в чанк без перезапуска.
- Браузер: `/login` и ленивые маршруты грузятся без ошибок в консоли; нужный экспорт
  (`tiktokPublishAvailabilitySchema`) присутствует в чанках.
- `pnpm --filter @peertoreel/web typecheck`, `test` (124) и `build` — зелёные.

