# ROADMAP

Статусы: `TODO` · `DOING` · `BLOCKED` · `DONE`.
Оценки — планировочные, не измерения.

## Обзор

| ID | Milestone | Результат | Оценка | Статус |
|---|---|---|---|---|
| M0 | Walking Skeleton | Монорепо, infra, contracts, API+web, auth, CI | 30–45 ч | DOING |
| M1 | Publish Risk Spike | Один MP4 → R2 → private TikTok post → статус | 20–35 ч | TODO |
| M2 | Factory Core | Тема → research → script → TTS → visuals → render → QC → review → MP4 | 70–110 ч | TODO |
| M3 | Quality & Ops | Шаблоны, regeneration, cost dashboard, monitoring | 40–60 ч | TODO |
| M4 | Scale & Monetization | Batch, A/B, analytics, multi-platform | 40–80 ч | TODO |

MVP = M0 + M2 + manual export. M1 — опциональный risk spike.

## M0 — Walking Skeleton

| ID | Задача | Owner | Статус |
|---|---|---|---|
| M0.1 | Workspace, git, CI baseline | агент | DONE |
| M0.2 | Contracts package | пара | DONE |
| M0.3 | Local infrastructure | агент | DONE |
| M0.4 | API skeleton, DB, health | вы | DONE |
| M0.5 | Web shell и health page | агент | DONE |
| M0.6 | Worker, queue, SSE ping | вы | TODO |
| M0.7 | Auth и sessions | вы | TODO |
| M0.8 | Error model, observability, CI gates | пара | DONE |
| M0.9 | Render spike | агент | TODO |

## M0 acceptance

- `pnpm install` проходит.
- `pnpm infra:up` поднимает Postgres, Redis, S3.
- `pnpm db:migrate` применяет миграции.
- `pnpm dev` поднимает API и web.
- `/api/v1/health/live` и `/api/v1/health/ready` работают.
- Web показывает статус API/Postgres/Redis.
- `pnpm check` зелёный.
- CI зелёный.
- Секретов в репозитории нет.

## Следующие сессии

1. S0.2 — worker + BullMQ + SSE ping.
2. S0.3 — auth + sessions + baseline schema.
3. S0.4 — state machine skeleton + reviewer gate.
