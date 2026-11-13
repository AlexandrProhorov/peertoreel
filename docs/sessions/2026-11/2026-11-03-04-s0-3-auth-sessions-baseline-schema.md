## 2026-11-03 — S0.3 Auth + sessions + baseline schema

**Цель:** вход в систему на серверных сессиях, первые бизнес-таблицы `users`/`sessions`,
закрытый доступ к рабочему API и UI логина.

**Сделано:**

- `packages/contracts/src/auth.ts` — `userRole`, `authUser`, `loginRequest`, `authSession`
  (`login`/`me` response). Zod, единственный источник правды для API и web.
- Drizzle-схема: `user_role` enum (`admin` | `editor`), `users`
  (email unique, argon2 hash, `is_active`, timestamps), `sessions`
  (`token_hash` unique, `expires_at`, индексы по user и expiry, cascade на удаление юзера).
  Миграция `0002_fluffy_marvel_zombies.sql` сгенерирована и применена.
- API `auth/`: `AuthService`, `PasswordService` (`@node-rs/argon2`, Argon2id 19 MiB/t=2/p=1),
  `UsersRepository`, `SessionsRepository`, `SessionAuthGuard`, `CurrentUser`,
  `AdminBootstrapService`.
- Сессия: 32 случайных байта в `peertoreel_session` (httpOnly, SameSite=Lax, Secure в prod),
  в БД только `sha256(token)`, TTL `SESSION_TTL_HOURS` (168 ч), `last_seen_at` не чаще
  раза в 5 минут. Логин при неизвестном email тратит хеш на decoy-пароль.
- Endpoints: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`.
- `/system` закрыт `SessionAuthGuard`; web шлёт cookie (`withCredentials` + `EventSource`
  с `withCredentials`).
- `cookie-parser` подключён в `main.ts`; env получил `SESSION_TTL_HOURS`,
  `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.
- Web `features/auth/`: `AuthApiService`, `AuthStoreService` (signals, `exhaustMap` на логин,
  `restore()` с дедупликацией запроса), `authGuard`, страница `/login` с типизированной
  формой и состояниями loading/error. Shell показывает пользователя и «Выйти».
- Состояние сессии вынесено в `core/auth/session-state.service.ts`; guard и кнопка «Выйти»
  грузят auth-фичу динамическим `import()`, иначе `@peertoreel/contracts` с Zod попадал в
  initial bundle (809 kB → 320 kB).
- ADR-0004 (серверные сессии), обновлены `README.md`, `ARCHITECTURE.md`, `AGENTS.md` §5.

**Проверено:**

- `pnpm --filter @peertoreel/contracts build`, `api typecheck` — успешно.
- Тесты: contracts 12, API 13, worker 2, web 21.
- `pnpm check` — зелёный (lint/typecheck/test/build), initial bundle 320.21 kB при бюджете
  500 kB.
- `pnpm db:migrate` — миграция `0002` применена; в БД `users`, `sessions`, `user_role`.
- API вручную (curl):
  - неверный пароль → `401 UNAUTHORIZED`, тело в едином error envelope;
  - верный пароль → `200`, `Set-Cookie: peertoreel_session=…; HttpOnly; SameSite=Lax`;
  - `GET /auth/me` с cookie → `200`, без cookie → `401`;
  - `POST /system/ping` без cookie → `401`, с cookie → `202`;
  - SSE `/system/ping/:jobId/events` без cookie → `401`, с cookie → `event: job` + `completed`;
  - `POST /auth/logout` → `204`, после него `/auth/me` → `401`, строк в `sessions` — 0.
- В БД: `password_hash` = `$argon2id$v=19$m=19456…`, `token_hash` не совпадает с cookie
  (хранится sha256), `role=admin`.
- Браузер: `/health` без сессии → redirect на `/login`; вход `owner@peertoreel.local` →
  `/health` с «Owner»/«Выйти» в шапке; `/system` → ping прошёл (100%, 471 мс) без console
  errors; «Выйти» → `/login`, защищённые роуты снова редиректят.

**Осталось / осознанно не сделано:**

- Нет rate limit и lockout на логин, нет аудита неудачных попыток, нет MFA.
- Нет cron-очистки истёкших сессий (только на старте приложения).
- Клиент доверяет локальному сигналу пользователя: истечение сессии обнаруживается ответом
  `401` на реальном запросе, без фонового refresh.
- В dev-сервере Angular пришлось очистить `.angular/cache` — Vite пре-бандлил старый
  `@peertoreel/contracts` без `loginResponseSchema`.

**Следующая сессия:** S0.4 — state machine skeleton + reviewer gate.

