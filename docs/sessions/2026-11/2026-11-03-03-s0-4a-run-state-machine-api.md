## 2026-11-03 — S0.4a Run state machine (API)

**Цель:** первые бизнес-таблицы после auth и серверно-проверяемая машина состояний run'а
с историей переходов.

**Сделано:**

- `packages/contracts/src/run.ts`: стадии (8), состояния (11), таблица разрешённых переходов,
  `canTransition`, `stageForState`, схемы `run`, `runDetail`, `runEvent`, `createRun`,
  `transitionRun`. Таблица переходов — единственный источник правды и для API, и для будущего UI.
- Drizzle: enum `run_state`, `run_stage`; `runs` (`created_by` → users, topic, state,
  current/failed stage, failure_reason, resume_state) и `run_events`
  (from/to, stage, reason, append-only). Миграция `0003_nostalgic_korvac.sql` применена.
- API `runs/`: `RunsRepository` (создание и каждый переход — одна транзакция с записью
  события), `RunsService` (валидация перехода, `409` на запрещённое ребро, `400` на
  `FAILED` без причины), `RunsController` под `SessionAuthGuard`.
- Endpoints: `POST /runs`, `GET /runs` (50 последних), `GET /runs/:id` (+ история),
  `POST /runs/:id/transitions`.
- `FAILED` один на все стадии: `failed_stage` + `failure_reason` + `resume_state`;
  retry — обычный переход `FAILED → resume_state`. ADR-0005, `AGENTS.md` §4/§5/§9 обновлены.
- Enum'ы в `schema.ts` продублированы литералами (drizzle-kit грузит схему через CJS и не
  видит ESM-only contracts); `schema.spec.ts` падает при расхождении со схемами контрактов.

**Проверено:**

- Тесты: контракты 18 (было 12), API 22 (было 13), worker 2, web 21; `pnpm check` зелёный.
- `pnpm db:migrate` применил `0003`; в БД появились `runs`, `run_events`, enum'ы.
- curl-сценарий на живом API (с cookie):
  - `POST /runs` → `201`, `state: DRAFT`, `currentStage: topic_discovery`;
  - `DRAFT → RESEARCHING` → `200`, `currentStage: research`;
  - `RESEARCHING → REVIEW` → `409 CONFLICT`;
  - `RESEARCHING → FAILED` без причины → `400`;
  - `RESEARCHING → FAILED` с причиной → `failedStage: research`, `resumeState: RESEARCHING`;
  - `FAILED → DRAFT` → `409`; `FAILED → RESEARCHING` → `200`, поля ошибки очищены;
  - `GET /runs` без cookie → `401`; `GET /runs/not-a-uuid` → `400`.
- В БД: `run_events` содержит создание (`null → DRAFT`), оба перехода и retry; тема сохранена
  как 17 символов (UTF-8 без искажений).

**Осталось (S0.4b):**

- Web: список run'ов, карточка с историей, кнопки разрешённых переходов, гейты
  `SCRIPT_READY` и `REVIEW` с комментарием.
- Нет `run_stages`/`artifacts` — появятся со стадийными исполнителями (S1).
- Нет пагинации и фильтров по состоянию: 50 последних достаточно для M0.

