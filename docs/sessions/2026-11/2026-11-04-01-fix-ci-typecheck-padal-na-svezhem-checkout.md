## 2026-11-04 — fix(ci): typecheck падал на свежем checkout

**Цель:** починить красный CI после коммита `992cad7` (render stage + stage retries).

**Причина:** `@peertoreel/db` и `@peertoreel/storage` публикуют только `dist` (`exports` → `dist/index.d.ts`).
Корневой `typecheck` собирал перед проверкой один `@peertoreel/contracts`, а `db`/`storage` в CI
не собирались — их `dist` не существует на чистом checkout. Отсюда `TS2307` в worker/api
и каскадные `TS7006` (`tx`, `table`, `eq` выводились как `any` из-за ненайденного `drizzle-orm`
через `@peertoreel/db`).

**Сделано:**

- `package.json` (root): новый скрипт `build:packages` (`pnpm --filter "./packages/*" build`).
  `typecheck`, `test` и `dev` теперь вызывают его вместо сборки одного `contracts`.
- `README.md`: таблица скриптов обновлена (`build:packages`, порядок сборки пакетов).
- Проверено на чистом состоянии (без `packages/*/dist` и без `*.tsbuildinfo`):
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — зелёные.

