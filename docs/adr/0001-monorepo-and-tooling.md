# ADR-0001: pnpm monorepo and ESM contracts

- **Дата:** 2026-10-30
- **Статус:** accepted

## Контекст

Нужен один репозиторий для Angular, NestJS и будущего worker'а. Контракты должны быть
единственным источником правды и не дублироваться между приложениями.

## Решение

- pnpm workspaces, без Turborepo/Nx на старте.
- `packages/contracts` — ESM-пакет с Zod-схемами и типами.
- NestJS 12 и Angular 22 работают в ESM, поэтому dual build не нужен.
- Сборка contracts — `tsc`, без дополнительного bundler'а.
- Версии фиксируются lockfile; обновления — отдельными PR.

## Последствия

- Все приложения обязаны собирать contracts перед typecheck/test/build.
- Появляется шаг `pnpm --filter @peertoreel/contracts build` в dev/CI.
- Если появится CJS-потребитель, придётся добавить dual build или отдельный export.
- Turborepo можно добавить позже, когда сборка станет узким местом.
