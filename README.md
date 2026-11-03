# Kadence — AI Content Factory

Kadence — pipeline-платформа для производства коротких вертикальных видео: тема → исследование →
сценарий → озвучка → визуалы → рендер → QC → публикация.

Сейчас проект находится на этапе **M0 — Walking Skeleton**. Реализованы фундамент,
health-check, локальная инфраструктура, async-путь через BullMQ и вход по сессии.
AI-стадии и TikTok появятся в следующих milestone'ах.

## Стек

- **Web:** Angular 22, standalone, zoneless, signals, Angular Material 3
- **API:** NestJS 12, REST, Zod-контракты
- **DB:** PostgreSQL 18 + Drizzle ORM / drizzle-kit
- **Queue/cache:** Redis 8, BullMQ 6
- **Storage:** Cloudflare R2 в production, SeaweedFS локально
- **Worker:** Node.js 24 + BullMQ worker
- **Media:** FFmpeg (следующий milestone)
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
- API health: http://localhost:3000/api/v1/health/ready
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
BOOTSTRAP_ADMIN_PASSWORD=kadence-dev-password
SESSION_TTL_HOURS=168
```

После успешного входа эти переменные можно убрать. Существующие пользователи не
перезаписываются: bootstrap срабатывает только на пустой таблице.

Остановить инфраструктуру:

```bash
pnpm infra:down
```

## Скрипты

| Команда | Что делает |
|---|---|
| `pnpm dev` | Собирает contracts и запускает API + web |
| `pnpm build` | Собирает все пакеты в топологическом порядке |
| `pnpm lint` | oxlint по пакетам |
| `pnpm typecheck` | TypeScript-проверка |
| `pnpm test` | Unit-тесты |
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

- Нет AI-провайдеров.
- Нет TikTok-интеграции.
- Нет загрузки медиа.
- Auth-защита есть только у `/system`; остальные бизнес-роуты появятся вместе со своими
  таблицами и сразу под `SessionAuthGuard`.
- Нет rate limit на логин и аудита неудачных попыток (запланировано).

Это сознательно: M0 проверяет фундамент, health и базовый async-путь.
