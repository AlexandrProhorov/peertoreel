## 2026-11-08 — Переименование Kadence → Peer to Reel

**Цель:** уйти от бренда `kadence` (конфликт с Kadence Themes/kadencewp.com и HR-брендом
Kadence International) до старта M3.1, пока контракт раскадровки не отгружен.

**Сделано:**

- 137 файлов: скоупы `@kadence/*` → `@peertoreel/*`, корневой пакет `peertoreel`,
  `pnpm-lock.yaml` перегенерирован через `pnpm install`.
- Cookie `kadence_session` → `peertoreel_session`; id контракта
  `peertoreel.storyboard.v1`; bootstrap-админ `owner@peertoreel.local`.
- UI: `<title>`, meta description, бренд в шапке (марка `P2R`), футер,
  «Вход в Peer to Reel»; спека `App` обновлена.
- Инфра: compose-проект `peertoreel`, Postgres user/db `peertoreel`, volumes
  `peertoreel-*`, bucket и ключи S3 `peertoreel`; CI и env-дефолты синхронно.
- Локальная инфра пересоздана: старые контейнеры и volumes `kadence-*` удалены вручную
  (проект compose переименован, поэтому `down -v` их уже не находил), затем `up -d`,
  `db:migrate`, bucket создан init-джобой.
- `docs/ignore/**` (gitignored research/prompts) намеренно не трогали — там исторический
  материал.

**Найденный баг (не связан с переименованием):** в `tiktok-token.service.spec.ts`
фикстура `now` была захардкожена на `2026-11-07T10:00:00Z`. После этой даты токен в
фикстуре считается протухшим: тест «fresh token» падал по ассерту, а «waits for another
refresh» висел до таймаута. Заменил на `new Date()` — оба теста снова зелёные.

**Проверки:**

- `pnpm lint` — ок (осталось одно старое warning про неиспользуемый `TikTokAccount`
  в `tiktok.controller.ts`).
- `pnpm typecheck` — ок.
- `pnpm test` — 353 теста: storage 3, contracts 58, tiktok 26, db 3, web 113, worker 91,
  api 59.
- `pnpm build` — ок.
- Smoke на живом API: `/api/v1/health/live` → 200; `/api/v1/health/ready` → database,
  redis, worker `up`; `POST /api/v1/auth/login` → 200 и `Set-Cookie: peertoreel_session=…`.

**Git:** история не переписывалась, переименование — один коммит. Осталось:
переименовать репозиторий на GitHub в `peertoreel`, обновить remote и сделать push.

**Локальная папка:** `Rename-Item` не сработал — каталог держит процесс OpenCode
(`access denied` даже на пустой папке). Переехали копией: `robocopy` без
`node_modules/dist/.angular/.idea`, затем `pnpm install`, `pnpm typecheck` и `pnpm test`
в новой папке (353 теста зелёные), после чего `session_move`. Пустой каталог `Kadence`
остаётся заблокированным до перезапуска приложения — удалить после рестарта.

