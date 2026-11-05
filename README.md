# Kadence — AI Content Factory

Kadence — pipeline-платформа для производства коротких вертикальных видео: тема → исследование →
сценарий → озвучка → визуалы → рендер → QC → публикация.

**M0 — Walking Skeleton закрыт.** Текущий этап — **M2 — Factory Core**: работают стадии
`script`, `voiceover` и `render` (до `REVIEW`), run detail с восстановлением прогресса стадии,
health-check с проверкой worker'а и вход по сессии. Дальше — `visuals`, QC и публикация.

## Стек

- **Web:** Angular 22, standalone, zoneless, signals, Angular Material 3
- **API:** NestJS 12, REST, Zod-контракты
- **DB:** PostgreSQL 18 + Drizzle ORM / drizzle-kit
- **Queue/cache:** Redis 8, BullMQ 6
- **Storage:** Cloudflare R2 в production, SeaweedFS локально
- **Worker:** Node.js 24 + BullMQ worker
- **Media:** FFmpeg (render stage)
- **Monorepo:** pnpm workspaces

## Быстрый старт

Требования: Node.js 24+, pnpm 10+, Docker Desktop.

```bash
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:4200 (вход: `/login`)
- API health: http://localhost:3000/api/v1/health/ready — Postgres, Redis и worker
- API liveness: http://localhost:3000/api/v1/health/live
- Auth: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- Ping job: `POST /api/v1/system/ping` → `GET /api/v1/system/ping/:jobId`
- SSE progress: `GET /api/v1/system/ping/:jobId/events`
- Web: `/system` — кнопка запуска и live-прогресс
- Worker запускается вместе с `pnpm dev`

### Первый вход

При первом старте API создаёт администратора из `.env`, если таблица `users` пуста:

```bash
BOOTSTRAP_ADMIN_EMAIL=owner@kadence.local
BOOTSTRAP_ADMIN_PASSWORD=change-me-before-first-run
SESSION_TTL_HOURS=168
```

Реальный пароль хранится только в локальном `.env` (он в `.gitignore`); не коммить его.
После успешного входа эти переменные можно убрать. Существующие пользователи не
перезаписываются: bootstrap срабатывает только на пустой таблице.

Остановить инфраструктуру:

```bash
pnpm infra:down
```

## Скрипты

| Команда | Что делает |
|---|---|
| `pnpm dev` | Собирает `packages/*` и запускает API + web + worker |
| `pnpm build` | Собирает все пакеты в топологическом порядке |
| `pnpm build:packages` | Собирает только `packages/*` (contracts, db, storage) |
| `pnpm lint` | oxlint по пакетам |
| `pnpm typecheck` | Собирает `packages/*`, затем TypeScript-проверка |
| `pnpm test` | Собирает `packages/*`, затем unit-тесты |
| `pnpm check` | lint + typecheck + test + build |
| `pnpm --filter @kadence/api db:generate` | Генерирует миграцию из `schema.ts` |
| `pnpm db:migrate` | Применяет миграции через drizzle-kit |
| `pnpm --filter @kadence/api db:studio` | Drizzle Studio для локальной БД |
| `pnpm infra:up` | Postgres + Redis + S3 |
| `pnpm infra:down` | Останавливает инфраструктуру |

## Структура

```text
apps/
  api/          NestJS REST API
  web/          Angular dashboard
  worker/       BullMQ worker
packages/
  contracts/    Zod-схемы и общие типы
infra/          Docker Compose для локальной инфраструктуры
docs/adr/       Architecture Decision Records
apps/api/
  src/db/schema.ts   Drizzle-схема
  drizzle/           сгенерированные SQL-миграции
```

## Локальный S3

MinIO удалил community-образы из Docker Hub в 2026 году. Для локальной разработки используется
SeaweedFS с S3-совместимым API на `http://localhost:8333`. Production использует Cloudflare R2;
код работает через S3 API и не зависит от конкретного локального провайдера. Подробности —
в `docs/adr/0002-local-s3-seaweedfs.md`.

## Ограничения текущего этапа

- Нет стадии `visuals` (Pixabay) — рендер пока использует синтетический фон `testsrc2`.
- Нет QC и TikTok-интеграции.
- `topic-discovery` и `research` не автоматизированы: run создаётся с темой вручную.
- Auth-защита есть у `/system` и `/runs`; остальные бизнес-роуты появятся вместе со своими
  таблицами и сразу под `SessionAuthGuard`.
- Нет rate limit на логин и аудита неудачных попыток (запланировано).

Это осознанный срез M2: сначала проверяем production-путь до готового черновика, затем
добавляем визуалы, QC и публикацию.

## Troubleshooting

**`does not provide an export named '<schema>'` в консоли web.**
Vite пре-бандлит `@kadence/contracts` в `apps/web/.angular/cache`, и после добавления нового
экспорта в контракты кэш остаётся старым. Лечится так:

```bash
pnpm --filter @kadence/contracts build
# остановить web-дев-сервер, затем:
rm -rf apps/web/.angular/cache      # Windows: Remove-Item -Recurse -Force apps/web/.angular/cache
pnpm --filter @kadence/web dev
```

Дополнительно сделайте жёсткую перезагрузку вкладки (Ctrl+Shift+R): Vite отдаёт
оптимизированные зависимости с `immutable`-кэшем.

Если ошибка повторяется при каждом изменении контрактов, запускайте web без пребандлинга —
тогда локальный пакет отдаётся как обычный ESM и кэш не участвует:

```bash
pnpm --filter @kadence/web exec ng serve --port 4200 --prebundle=false
```
