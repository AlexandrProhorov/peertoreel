# SESSION LOG

## 2026-11-08 — M1.2a: живая загрузка в TikTok

**Результат:** OAuth sandbox-аккаунта и `FILE_UPLOAD` в TikTok впервые прошли end-to-end.

**Путь:**

- Приложение TikTok в Sandbox: client key/secret, Login Kit + Content Posting API, scopes
  `user.info.basic` + `video.publish`.
- Из-за требования HTTPS для Web поднят временный `cloudflared`-туннель к локальному API;
  redirect URI `https://<tunnel>/api/v1/accounts/tiktok/callback` зарегистрирован в Sandbox
  Login Kit. Туннель остановлен после подключения.
- OAuth: исправлен PKCE (`code_challenge`/`code_verifier`), затем ошибка `scope` — scopes
  включены в Sandbox. Подключён приватный аккаунт `@arapashwb55` (Куклуксмаксер).
- `tiktok:spike` на новом run `5a931675-aa79-4748-beb6-bede83a8eb53` («почему собака —
  лучший друг человека?»):
  - `creator_info/query` → privacy options включают `SELF_ONLY`;
  - draft 28 125 877 байт, 2 чанка (`HTTP 206`, затем `HTTP 201`);
  - `publish_id=v_pub_file~v2-1.7705630733150406678`;
  - `status=PUBLISH_COMPLETE`, `post_id` пустой — ожидаемо для `SELF_ONLY`
    (непубличный пост);
  - карточка получила `publish_id`, run остался в `SCHEDULED`.

**Проверки:**

- `pnpm check` — 356 тестов (contracts 58, tiktok 28, storage 3, db 3, web 113, worker 91,
  API 60), сборка проходит.
- `pnpm --filter @peertoreel/web test` после no-store/cache-buster для authorize — 113.
- Живой OAuth и upload — см. выше.

**Ограничения:**

- Приложение не прошло аудит: посты только `SELF_ONLY`, публичная публикация недоступна.
- Это spike, а не очередь `publish`: run state и publish card state не двигаются; кнопка
  публикации в UI, webhooks и rate limiter — M1.2b.
- Временный `trycloudflare.com` URL живёт только пока запущен процесс; для повторного OAuth
  нужен новый туннель/домен.

**Следующая сессия:** M1.2b — очередь `publish`, кнопка в publish card, `publish_id`/`post_id`
в карточке, статус/webhooks, rate limiter.

## 2026-11-08 — fix(accounts): PKCE для TikTok OAuth

**Симптом:** после нажатия «Подключить TikTok» страница TikTok показывала
«Something went wrong / correct the following: code_challenge».

**Причина:** приложение TikTok настроено на Desktop/localhost redirect (`http://localhost`),
а TikTok требует PKCE для такого flow. Наш authorize URL не содержал `code_challenge`, а
обмен кода — `code_verifier`.

**Сделано:**

- `packages/tiktok/src/pkce.ts`: `createCodeVerifier` (48 random bytes → base64url, 64 символа)
  и `createCodeChallenge` (hex SHA-256 — так требует Login Kit desktop guide TikTok).
- `TikTokApi.authorizeUrl(state, scopes, codeChallenge?)` добавляет
  `code_challenge` + `code_challenge_method=S256`; `exchangeCode(code, codeVerifier?)`
  отправляет `code_verifier`.
- OAuth state в Redis теперь хранит `{ userId, codeVerifier }` (JSON), а не голый userId;
  callback парсит его и передаёт verifier в обмен. Старые state без verifier отклоняются.
- Тесты: PKCE verifier/challenge, authorize URL, token exchange, OAuth state/callback.

**Проверено:**

- `pnpm --filter @peertoreel/tiktok test` — 28 тестов.
- `pnpm --filter @peertoreel/api typecheck` и `test` — 60 тестов.
- Живой `/accounts/tiktok/authorize` отдаёт URL с `code_challenge` и `code_challenge_method=S256`.

**Осталось:** повторить подключение в браузере. Если TikTok вернёт ошибку redirect URI —
проверить, что `http://localhost:3000/api/v1/accounts/tiktok/callback` зарегистрирован
в том же режиме (Sandbox/Production), что и используемый client key.

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

## 2026-11-08 — Roadmap M3 «Animated Factory» + план для агентов

**Цель:** после исследования нарезать ближайшие фичи, дополнить ROADMAP и подготовить
входные данные для агентных сессий. Реализация не начиналась.

**Сделано:**

- `ROADMAP.md`: новая веха **M3 — Animated Factory** (M3.1–M3.8, acceptance = эксперимент
  «−15°» из исследования §I.2); прежние M3/M4 перенумерованы в M4/M5 с сохранением
  содержания; остатки M2 распределены (retry Pixabay → M4.6, замена сцены → M4.4);
  «Следующие сессии» переписаны под новые слайсы.
- `docs/plans/2026-11-08-animated-factory-plan.md` — данные для агентов: правила сессии и
  Definition of Done, принятые решения D1–D8 со ссылками на исследование, карта данных
  (артефакты `storyboard_json`/`scene_clip`, очередь `scene-render`, схема раскадовки),
  нарезка 8 слайсов (оценки/зависимости), детальные брифы M3.1 (контракт + фикстура +
  ADR-0012) и M3.2 (Remotion render worker), средние M3.3–M3.5, краткие M3.6–M3.8;
  справочник начальной библиотеки компонентов (6 шт. с параметрами), карта кода для
  чтения, ограничения (лицензия Remotion, детерминизм, платные вызовы только моками в CI).

**Ключевые решения нарезки:**

- Один слайс = одна сессия (код + тесты + демо + docs + SESSION_LOG + theory-блок);
  детальные брифы только для ближайших слайсов, остальные — до меры, достаточной для старта.
- Продюсеры сцен пишут `video/mp4` в существующие ключи сцен и `kind: 'video'` в
  `visuals_json` — render-стейдж и FFmpeg-сборка не меняются (минимальный дифф).
- Очередь `scene-render` — не stage-очередь (payload `{runId, sceneIdx}`), оркестрация
  остаётся в `visuals`; ADR-0012 + обновление AGENTS §10 входят в слайс M3.1 (hard rule 8).

**Следующая сессия:** M3.1 — контракт `peertoreel.storyboard.v1` в contracts, перенос
`DerivedWord` в contracts, фикстура «−15°» (6 сцен), ADR-0012, AGENTS §10.

## 2026-11-08 — Исследование: программная анимация + AI video generation (research only)

**Цель:** техническое и экономическое исследование перехода от стоковых клипов (Pixabay) к
автоматизированному созданию оригинальных анимированных видео: AI-режиссёр (раскадровка) +
программный движок + точечные AI-ассеты/видео. Код не изменялся, зависимости не ставились.

**Сделано:**

- Анализ фактического кода пайплайна (стадии, контракты, worker, render, web) и точек
  расширения; зафиксированы расхождения AGENTS.md ↔ код (SSE vs polling, отсутствие модулей
  `scripts`/`projects`/`provider_usage`, `word_timings` вне contracts и др.).
- Веб-исследование пяти направлений: движки программной анимации (Remotion/Motion Canvas/
  Revideo/HyperFrames/GSAP/Lottie/Three.js/Blender), AI video/image generation API с
  ценами и региональными ограничениями (Sora закрыт, MiniMax H3, Veo 3.1, Kling, Seedance,
  FLUX/NB/Recraft), AI coding agents (OmniLottie: параметрический JSON 82–97% vs codegen
  0–12.7%), синхронизация (Whisper не нужен; MFA только для липсинка), инфраструктура.
- Итоговый отчёт: `docs/research/2026-11-08-ai-video-production-research.md`
  (разделы A–J + краткая выжимка); сырые отчёты потоков —
  `docs/research/ai-video-image-generation-apis-2026-11-08.md`,
  `C:\Temp\opencode\ai-animation-codegen-report-2026-11-08.md`.

**Ключевые выводы:**

- Движок — Remotion 4.0.x в изолированном render worker (React только там; Plan B — Revideo
  MIT); сцены рендерятся в mp4 и собираются **существующим** FFmpeg-конвейером без изменений
  (render уже потребляет `scene.asset.objectKey`).
- Основной путь генерации сцен — библиотека параметрических компонентов + Zod-раскадровка
  (`peertoreel.storyboard.v1`), codegen — аварийный люк в песочнице.
- Себестоимость: программный ролик $0.05–0.25, гибрид $0.8–4.5, полный AI-видео $6–18.
- Первый эксперимент: тема «−15°» (референс `docs/references/Screenshot_1.png`),
  5–6 различных сцен, ≤$0.5 (≤$2 с видео-сценой), ≤15 мин рендера.

**Следующая сессия (после согласования):** H1 — контракт `storyboard.v1` в contracts +
фиксстура раскадровки для темы «−15°».

## 2026-11-07 — M1.2a TikTok OAuth + token vault + upload spike

**Цель:** подключить TikTok через Login Kit, безопасно хранить токены и проверить реальный
`FILE_UPLOAD` до постройки очереди публикации.

**Сделано:**

- `packages/tiktok`: OAuth (`authorizeUrl`, code exchange, refresh, revoke), user info,
  `creator_info/query`, `video/init`, chunked upload, `status/fetch`; AES-256-GCM
  `TokenCipher`; `planChunks` по правилам TikTok; классификация ошибок
  `token/retryable/terminal`.
- Контракты `tiktok.ts`: метаданные аккаунта, callback query, creator info; подключены к web.
- БД: `tiktok_accounts` (`user_id`, `open_id`, шифрованные токены, expiry, scope, unique
  `(user_id, open_id)`), миграция `0007`.
- API `accounts/`: `GET /accounts/tiktok`, `GET /accounts/tiktok/authorize`,
  `GET /accounts/tiktok/callback`, `GET /accounts/tiktok/:id/creator-info`,
  `DELETE /accounts/tiktok/:id`. OAuth state живёт в Redis 10 минут; callback не требует
  cookie и разрешает пользователя по state.
- Refresh: `expires_in`/`refresh_expires_in` из ответа, ротация refresh-токена, Redis-лок
  на аккаунт, 503 при недоступном Redis.
- Web: `/accounts` — подключение, список, проверка creator info, отключение; ссылка в shell.
- Worker: `tiktok:spike` — читает `SCHEDULED` run + `draft_mp4`, аккаунт из vault,
  обновляет токен, вызывает creator info, `video/init` (`is_aigc: true`, `FILE_UPLOAD`),
  грузит чанки и опрашивает статус; `--dry-run` останавливается до загрузки.
- ADR-0011; AGENTS §2/§3/§5/§7/§9; ARCHITECTURE; README; ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 58, tiktok 26, storage 3, db 3, web 113, worker 91,
  API 59 (353 теста), сборка проходит; initial bundle 326.04 kB.
- `pnpm db:migrate` — применена `0007`, таблица `tiktok_accounts` и unique-индекс на месте.
- API после добавления модуля поднимается; `GET /accounts/tiktok` без сессии → 401, с сессией
  без ключей → `200 {accounts: []}` (список не требует TikTok-конфигурации),
  `GET /accounts/tiktok/authorize` с сессией без ключей → 503 с сообщением
  «TikTok не настроен: добавьте TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI, TOKEN_ENCRYPTION_KEY».
- Unit-тесты: cipher round-trip/tamper, chunking (включая пример 50 000 123 байт), OAuth
  state/callback, ротация токенов, ошибки/классификация, store/API accounts.

**Не проверено (нужны ключи TikTok):**

- Реальный OAuth: в `.env` нет `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
  `TIKTOK_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- Реальная загрузка `tiktok:spike` и статус `PUBLISH_COMPLETE` на приватном аккаунте.
- Очередь `publish`, кнопка публикации в publish card, webhooks, rate limiter — M1.2b.

**Найдено в официальной документации (2026-11-07):**

- Access token ≈2 часа, refresh ≈180 дней, refresh-токен ротируется; старые «24 ч / 365 дней»
  в AGENTS были неверны и исправлены.
- `post_info` требует `privacy_level`, `brand_content_toggle`; `is_aigc` — optional, мы всегда
  передаём `true`.
- Для `FILE_UPLOAD`: чанки 5–64 МБ, последний может быть больше, `total_chunk_count =
  floor(size/chunk_size)`, загрузка последовательная.
- `SELF_ONLY` не возвращает `publically_available_post_id` — null post id ожидаем для
  unaudited приложения.

**Следующая сессия:** добавить ключи, подключить приватный аккаунт, прогнать `--dry-run` и
реальную загрузку; затем M1.2b — очередь `publish` и кнопка в publish card.

### Теория сессии

- Сроки жизни токенов — данные ответа, а не константы: TikTok уже менял их, и hardcode
  ломает refresh-джоб.
- Refresh-токен одноразовый: два параллельных refresh инвалидируют друг друга, поэтому
  обновление сериализуется локом, а проигравший перечитывает строку.
- OAuth state в Redis, а не в cookie: callback приходит с tiktok.com, state одноразовый и
  привязан к пользователю.
- AES-256-GCM даёт и шифрование, и проверку целостности; версия в префиксе оставляет место
  для ротации формата.
- `FILE_UPLOAD` выбран раньше `PULL_FROM_URL`, потому что не требует подтверждённого домена;
  чанки считаются по правилам TikTok, а не «по 10 МБ на глаз».
- Ошибка TikTok классифицируется до ретрая: `access_token_invalid` → refresh, 429/5xx →
  backoff, spam/auth/media → terminal.
- Upload spike не трогает state machine: сначала проверяем реальный API, потом кодируем
  очередь и audit-переходы.
- Unaudited app — это ограничение продукта, а не баг: `SELF_ONLY` и приватный аккаунт до
  прохождения аудита.

## 2026-11-06 — M1.1 Publish card + manual export

**Цель:** первый срез публикации без TikTok API: карточка публикации, автоматическое создание
при `REVIEW → SCHEDULED`, скачивание черновика/текста/JSON и ручная отметка публикации.

**Сделано:**

- Контракты `publish.ts`: privacy levels, состояния карточки, `publishCardSchema`,
  `updatePublishCardRequestSchema` (title 1–150, 0–30 хештегов, nullable privacy/scheduled,
  `isAigc` не принимается от клиента), нормализация хештегов и дефолты из темы/заголовка
  сценария.
- БД: enum `publish_card_state`, таблица `publish_cards` (`run_id` unique, `is_aigc` check,
  `title` length check, nullable TikTok-поля), миграции `0005` (создание + backfill) и `0006`
  (truncate длинных заголовков + check).
- API: модуль `publish/` (`GET`/`PUT /runs/:id/publish-card`, `mark-exported`,
  `manual-publish`), автоматическая карточка в той же транзакции, что и `REVIEW → SCHEDULED`
  (`ON CONFLICT DO NOTHING`, заголовок из `script_json` с fallback на тему).
- Ручная публикация: `SCHEDULED → PUBLISHING → PUBLISHED` одной транзакцией с guard
  `state = 'SCHEDULED'` (два параллельных запроса не публикуют дважды), две audit-записи с
  reason «Ручной экспорт» и разными timestamp, карточка `published` + `published_at`.
  Прямые переходы в `PUBLISHING`/`PUBLISHED` через `/transitions` теперь 409: эти рёбра
  принадлежат publish card.
- Web: `PublishCardApiService`, route-scoped `PublishCardStoreService` (404 → пустая форма),
  `publish-card.component` с typed reactive form, бейджем `AI-generated: да`, privacy без
  default, скачиванием видео, копированием текста (clipboard + textarea fallback), JSON и
  ручной публикацией. Сырые кнопки `SCHEDULED → PUBLISHING`/`PUBLISHING → PUBLISHED` скрыты.
- `presignGet` умеет подписывать `Content-Disposition: attachment`; для `draft_mp4` отдаётся
  отдельный `downloadUrl`, а инлайновый `url` остаётся для `<video>` и «Открыть».
- Повторное одобрение нового черновика сбрасывает устаревший `exported_at`/`state=exported`,
  сохраняя title/hashtags/privacy/scheduled.
- ADR-0010, AGENTS §4/§5/§7/§9, ARCHITECTURE, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 55, storage 3, db 3, web 98, worker 91, API 41
  (291 тест), сборка проходит; initial bundle 325.79 kB.
- `pnpm db:migrate` — применены `0005` и `0006`; в БД есть enum, таблица, unique `run_id`,
  check `is_aigc = true`, check длины title; backfill создал карточки для старых
  `SCHEDULED`/`PUBLISHED` run'ов (у legacy-карточек только title из темы, хештеги пустые).
- Живой API (сессия из `.env`, значения не выводились):
  - `GET /runs/:id/publish-card` без сессии → `401`;
  - run в `REVIEW` → `404`, `PUT` по нему → `409`;
  - `POST /transitions {"to":"PUBLISHING"}` → `409` (ребро принадлежит publish card);
  - `PUT` по `SCHEDULED` → `200`; `#пород`, `собак`, `Пород` нормализованы до
    `["пород","собак"]`; `isAigc: false` в теле проигнорирован, ответ и БД `is_aigc = true`;
  - `manual-publish` на `PUBLISHED` run → `409`;
  - `mark-exported` дважды → `state=exported`, `exported_at` не сдвинулся;
  - artifacts для `draft_mp4`: инлайновый `url` без `Content-Disposition` (206, video/mp4),
    `downloadUrl` с `Content-Disposition: attachment; filename="peertoreel-draft-<id>.mp4"`;
  - после проверок demo-карточка сброшена в `draft` с заголовком сценария и хештегами
    `["пород","собак"]`, privacy/scheduled/exported пустые.
- Сквозной smoke на одноразовом run (создан, проведён по всем переходам до `SCHEDULED`,
  удалён после проверки):
  - карточка создана автоматически в транзакции `REVIEW → SCHEDULED`, title из темы,
    hashtags `["проверка","ручной","публикации"]`, privacy пустой, `isAigc=true`;
  - `manual-publish` → карточка `published` + `published_at`, run `PUBLISHED`,
    в истории ровно две записи `SCHEDULED → PUBLISHING` и `PUBLISHING → PUBLISHED`
    с reason «Ручной экспорт».
- Не проверено живьём: браузерный click-through (скачивание/буфер/JSON) — оставлен на ручной
  сценарий пользователя; логика покрыта unit-тестами API/store/компонента.

**Найдено и исправлено на ревью:**

- прямые `PUBLISHING`/`PUBLISHED` через `/transitions` больше не принимаются (409);
- backfill мог записать title длиннее 150 → миграция `0006` + check;
- конкурентный `manual-publish` → guard в `UPDATE ... WHERE state='SCHEDULED'`, проигравший
  получает 409; обычные переходы тоже проверяют `state = fromState` (проигравший получает
  409 вместо тихого перезаписывания);
- две audit-записи в одной транзакции имели одинаковый `created_at` → вторая сдвинута на 1 ms;
- устаревший `exported_at` после нового draft → сброс при повторном `REVIEW → SCHEDULED`;
- `markExported` не может понизить `published` до `exported`;
- после ошибки загрузки карточки появилась кнопка «Повторить загрузку»;
- карточка перезагружается при повторном появлении в `SCHEDULED` (store живёт в роуте,
  `setRelativeId` с тем же id — no-op) без дублирующего GET на первом монтировании;
- скачивание видео вынесено в отдельный `downloadUrl`, чтобы не ломать `<video>` и «Открыть».

**Ограничения / осознанно не сделано:**

- Backfill не может восстановить заголовок сценария (его не было на run) — legacy-карточки
  начинаются с темы и пустых хештегов.
- Уникальность `run_id` проверена миграцией и живой БД, отдельного Testcontainers-теста нет:
  в проекте пока нет такого паттерна.
- Нет TikTok OAuth, `tiktok_accounts`, `video/init`, webhooks, rate limiter,
  auto-scheduling, `provider_usage`, `scenes`, замены сцены.

**Следующая сессия:** M1.2 — TikTok OAuth + token vault + приватная публикация.

### Теория сессии

- Enum'ы БД дублируются в `schema.ts` литералами, потому что drizzle-kit загружает схему через
  CJS и не видит ESM-only contracts; `schema.spec.ts` ловит расхождение.
- Инвариант «одобрил → карточка есть» держится транзакцией: run, событие и `publish_cards`
  пишутся атомарно, поэтому промежуточного `SCHEDULED` без карточки не бывает.
- Медленное внешнее чтение (S3) вынесено до транзакции; его сбой деградирует до темы и не
  блокирует переход.
- `ON CONFLICT DO NOTHING` делает повторное одобрение идемпотентным и сохраняет правки
  пользователя.
- Запрос не содержит `isAigc`, сервер пишет `true`, а check constraint в БД — вторая линия
  защиты продуктового правила.
- `exported_at` фиксирует первую выгрузку и не двигается повторно; `published` не
  понижается до `exported`.
- Кросс-доменная ссылка с `download` не работает без `Content-Disposition`; отдельный
  подписанный `downloadUrl` даёт настоящий download и не мешает инлайновому `<video>`.
- Условный `UPDATE ... WHERE state = 'SCHEDULED'` — это compare-and-set: проверка состояния
  перед транзакцией не защищает от двух одновременных запросов. По той же причине одобрение
  нового черновика сбрасывает устаревший `exported_at`, иначе UI врёт про выгрузку.
- Web-слой трактует 404 как доменное состояние «карточки ещё нет», а не как ошибку; форма
  остаётся управляемой, а первый `PUT` создаёт строку.
- Ручная публикация — две audit-записи на существующих рёбрах вместо нового перехода: история
  остаётся полной, а `PUBLISHING` не может остаться тупиком.

## 2026-11-05 — M2.5 QC + review gate

**Цель:** автоматическая проверка черновика перед human gate: длительность, громкость,
синхронизация, стоп-слова, `is_aigc`, читаемость; отчёт в UI; «Одобрить» только после
успешного/предупреждающего QC.

**Сделано:**

- Контракты `qc.ts`: `qcReportSchema` (`verdict`, checks, metrics, createdAt), проверки
  `duration/loudness/sync/stop_words/aigc/readability`.
- Очередь/стадия `qc` (`REVIEW → REVIEW`, concurrency 1), worker и failure handling.
- `qc.processor.ts`: качает draft, `ffprobe` (длительности и разрывы аудио-пакетов),
  `loudnorm`-замер, правила, `qc_report.json` в S3 + artifact.
- `render` теперь удаляет старый `qc_report` и объект при новом draft: отчёт всегда
  относится к текущему файлу.
- API: `GET /runs/:id/qc` (404, пока отчёта нет), `StorageService.getObject`.
- Web: `qcReport` в detail store, `stageToRun` показывает QC до отчёта, блокирует
  «Одобрить» при `fail`; QC-карточка с verdict/checks/metrics и «Перепроверить»;
  комментарий и danger-зона не конфликтуют с гейтом.
- ADR-0009, AGENTS §4/§6/§9, ARCHITECTURE, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 40, storage 3, db 2, web 67, worker 91, API 25
  (228 тестов), сборка проходит.
- Живой QC на run `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`:
  - до запуска `GET /runs/:id/qc` → 404;
  - `POST /stages/qc` → job completed; `qc_report` создан;
  - verdict `warn`: `loudness=-14.6 LUFS, true peak=-1.0 dBTP` — единственный warn;
  - duration 47.9 s, sync pass (разрыв 0.088 s), stop-words pass, AIGC pass,
    readability 131.5 слов/мин — pass;
  - run остался в `REVIEW`, «Одобрить» доступно (warn ≠ fail).
- QC не меняет состояние run'а и не вызывает LLM.

**Осталось:**

- S1 — TikTok publish risk spike.
- Retry/next-candidate на transient-ошибки скачивания Pixabay.
- Ручная замена сцены в review.
- `provider_usage`/cost ledger и `scenes` table — отдельные milestone'ы.

## 2026-11-05 — feat(web): иерархия действий на run-странице

**Зачем:** блок действий был плоским списком кнопок, а комментарий и регенерация висели
всегда. Пользователю было неясно, что делать в первую очередь.

**Сделано:**

- Карточка стадии получила надпись «Следующий шаг»; её кнопка «Запустить» — primary
  (`mat-flat-button`).
- `REVIEW`: primary-кнопка «Одобрить»; блок «Перегенерировать» свёрнут в `<details>`;
  «Остановить с ошибкой» — отдельная красная danger-зона, тоже свёрнутая.
- Комментарий теперь показывается только внутри danger-зоны, а не всегда.
- Back-переходы (`Переделать бриф`, `Вернуться к сценарию`, `Перегенерировать визуалы`,
  `Вернуть на ревью`) — secondary (`mat-stroked-button`), отдельным рядом.
- `FAILED`: primary «Повторить стадию», без danger-зоны.
- `DRAFT / SCHEDULED / PUBLISHING`: один filled primary-переход, secondary — только
  возвраты, danger — свёрнут.
- Stage-owned переходы по-прежнему скрыты, чтобы не было кнопок без запуска job'а.
- Бюджет component styles поднят с 4 kB до 5 kB: run-page вырос до ~4.4 kB CSS; initial
  bundle не изменился.

**Проверено:**

- `pnpm --filter @peertoreel/web typecheck`, `test` (64), `build` — без предупреждений.
- `pnpm check` — зелёный: contracts 37, storage 3, db 2, web 64, worker 79, API 23
  (208 тестов).
- Живой click-through не выполнялся (не передаю сессию/пароль через инструменты);
  шаблон и состояния собраны typecheck/build, логика переходов покрыта store-тестами.

**Дальше:** ручная замена сцены в review и более строгий дизайн карточки черновика —
после проверки текущей иерархии пользователем.

## 2026-11-05 — feat(visuals): anchor + tags + relevance ranking, убрана кнопка «Перерендерить»

**Зачем:** на dog-run подбор давал кошек, людей и абстракции вместо собак. Причина —
селектор игнорировал теги и порядок выдачи Pixabay и выбирал самый вертикальный/крупный
клип. На запрос `dog owner hugging oxytocin brain` приходили 2 собаки, пара и 2 кота;
выбирался кот. На `scientist dog experiment...` в выдаче не было собаки, выбирался учёный.

**Сделано:**

- В `scriptSchema` добавлен optional `visualAnchor` — главный визуальный субъект ролика
  (`dog`, `black hole`). Для старых сценариев anchor выводится эвристикой: самый частый
  униграм/биграм в `visualDirection`. Для текущего dog-run heuristic дал `dog`.
- Промпт сценария теперь просит `visualAnchor` и короткие (2–4 слова) конкретные
  `visualDirection` без абстракций.
- Pixabay provider парсит `tags` и запоминает `rank` (позицию в выдаче).
- `selectStockAsset`:
  - фильтрует кандидатов по anchor-тегам (например, `dog`);
  - rank стал главным сигналом релевантности, вертикальность/разрешение — вторичными;
  - если primary-запрос не дал anchor-совпадений, visuals делает fallback-запрос только
    по anchor;
  - если единственный релевантный клип уже использован, сначала пробуется anchor-запрос,
    и только потом допускается повтор.
- `visuals_json` meta теперь содержит `visualAnchor`, а scene-artifact meta — теги
  выбранного ассета.
- Из блока регенерации убрана кнопка «Перерендерить»: она запускала только render на тех
  же визуалах и в обычном review-флоу только путала. Рендер остаётся карточкой стадии на
  `VISUALS_READY`; после ошибки — «Повторить стадию».

**Проверено на dog-run `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`:**

- Финальный прогон: 8 сцен, 8 тематических ассетов — 5 разных видео с собаками и 3 фото
  с собаками, fallback-сцен 0. `visualAnchor=dog`, `providerRequests=8`, `cacheHits=13`.
- Кадры на 5 / 15 / 25 / 40 s: собака у миски, собака на улице, собака в снегу,
  человек с собакой на прогулке.
- Draft: 47.9 s, 14 579 335 байт, video/audio одинаковой длины; аудио непрерывно.
- `pnpm check` — зелёный: contracts 37, storage 3, db 2, web 64, worker 79, API 23
  (208 тестов), сборка проходит.

**Ограничение:** один промежуточный прогон при холодном кеше/вариативной выдаче Pixabay дал
3 fallback-сцены; повторный прогон с прогретым кешем выбрал собак для всех 8 сцен. Если
это повторится, следующим шагом стоит добавить retry/next-candidate на transient download
errors.

**Ещё осталось:** иерархия кнопок в UI (kнопка «Перерендерить» убрана, но блок
регенерации всё ещё требует UX-прохода) и ручная замена сцены в review.

## 2026-11-05 — fix(worker): пропуски озвучки на границах сцен

**Симптом:** в draft «почему собака лучший друг человека» голос пропускал ~3 секунды
между словами на 21–24 s и 26–29 s; субтитры продолжали идти, к 38 s рассинхрон пропадал.

**Разбор:**

- `script_json`, `word_timings` и ASS были корректны и монотонны. Слова `лучше`
  (23.394–23.661) и `лучше нас` (29.443–30.081) стояли на своих местах.
- В draft-аудио `ffprobe` показал два реальных разрыва PTS:
  `20.992 → 23.917` и `26.285 → 29.288`. В voiceover MP3 разрывов не было.
- Разрывы совпадали с границами сцен визуального трека. `buildVisualConcatArgs`
  склеивал сегменты через concat demuxer с `-c copy`; на стыках оставались DTS-разрывы,
  и muxer выбрасывал куски аудио.
- Проверено отдельно: CFR-перекодировка склейки (`fps=30`, libx264) даёт непрерывный
  visual track 48.832 s / 1465 кадров; финальный render — 47.9 s без 3-секундных разрывов.
  Экспериментальный `setpts=N/(30*TB)` в финальном фильтре, наоборот, обрезал видео до
  22.5 s, поэтому убран.

**Сделано:**

- `buildVisualConcatArgs` теперь перекодирует concat в CFR вместо `-c copy`.
- Из `buildRenderArgs` убран `setpts`; остаётся `fps=30` и обычный scale/crop/ass.
- Обновлены тесты аргументов `visual-track` и `ffmpeg`; добавлен `ffmpeg.spec.ts`.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 64, worker 71, API 23
  (199 тестов), сборка проходит.
- Повторный render run'а `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`: 47.9 s, video/audio
  одинаковой длины, аудио-пакеты непрерывны на 20–30 s. Остался один разрыв 88 ms на
  44.9 s (AAC/loudnorm), не сравнимый с исходными 3 s.
- Run снова в `REVIEW` с исправленным черновиком.

## 2026-11-05 — fix(web): рабочие кнопки регенерации

**Симптом:** на `REVIEW` кнопки «Перегенерировать визуалы» и «Перерендерить» только меняли
состояние run'а и не запускали стадию. «Перегенерировать визуалы» вела в `VISUALS_READY`
(состояние *после* визуалов), а «Перерендерить» — в `RENDERING`, откуда render уже не
стартовал. В итоге видео не менялось.

**Сделано:**

- Из машины состояний убран тупиковый переход `REVIEW → RENDERING`; render всегда
  запускается из `VISUALS_READY`.
- На `REVIEW` появился отдельный блок «Перегенерировать» с четырьмя действиями:
  - «Перегенерировать сценарий» — `REVIEW → SCRIPT_READY → RESEARCHING`, запускает script
    и останавливается на гейте `SCRIPT_READY`;
  - «Перегенерировать озвучку» — voiceover → visuals → render, возврат в `REVIEW`;
  - «Перегенерировать визуалы» — visuals → render, возврат в `REVIEW`;
  - «Перерендерить» — только render из текущих визуалов.
- Цепочка стадий стартует следующую после `completed` предыдущей; при `failed` цепочка
  очищается. Кнопки заблокированы, пока стадия выполняется.
- Сырые переходы, которые принадлежат процессорам стадий (`RESEARCHING → SCRIPT_READY`,
  `VOICE_READY → VISUALS_READY`, `VISUALS_READY → RENDERING` и т.п.), скрыты из блока
  «Действия», чтобы не было кнопок без запуска job'а.
- `VISUALS_READY → VOICE_READY` теперь тоже запускает visuals + render, а не просто меняет
  состояние.
- Регенерация visuals исключает `providerAssetId` из предыдущего `visuals_json`. Иначе
  24-часовой кеш Pixabay возвращал тот же список, селектор выбирал тот же лучший клип, и
  видео выглядело идентичным.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 64, worker 70, API 23
  (198 тестов), сборка проходит.
- Живая регенерация run'а `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47`:
  - до: asset ids `30470,240531,217708,185938,179597,275593,156318,14869`;
  - после: `26493,189018,217708,133189,251873,5631,15305,156318` — 7 из 8 клипов
    сменились, один переиспользован; `cacheHits=8`, `providerRequests=8`;
  - render завершился, run снова в `REVIEW`, черновик пересобран.
- Отдельно проверен путь «Перерендерить»: `REVIEW → VISUALS_READY → render → REVIEW`,
  draft обновился.
- Живой browser click-through не выполнялся; цепочка покрыта тестами
  `run-detail-store.service.spec.ts`.

**Найдено по ходу:** на старом run'е в `VOICE_READY` не было карточки «Подбор визуалов» —
web-дев-сервер держал старый Vite-прекеш `@peertoreel/contracts` без `VOICE_READY → visuals`.
Кеш `.angular/cache` очищен, web-дев-сервер перезапущен; проверено, что отдаваемый
`@peertoreel_contracts.js` содержит `VOICE_READY: "visuals"`. Лейбл `VOICE_READY → SCRIPT_READY`
переименован в «Вернуться к сценарию», чтобы не обещать регенерацию сценария.

## 2026-11-05 — fix(web): черновик над историей, без встроенных плееров для сцен

**Симптом:** на `/runs/:id` черновик был внутри блока артефактов ниже истории; в консоли
браузера — `404 Not Found` и `scene-5: ERR_CONTENT_LENGTH_MISMATCH` при загрузке стоковых
клипов.

**Сделано:**

- Порядок блоков на run-странице: действия → **Черновик** → история → артефакты.
- Черновик вынесен в отдельную карточку с плеером и ссылкой «Открыть»; из списка
  артефактов он исключён, чтобы не дублировать видео. Счётчик артефактов показывает
  оставшиеся файлы.
- Встроенные `<video>` для `visual_clip` убраны. 8 одновременных запросов к стоковым
  клипам больше не уходят из списка артефактов; у них осталась только ссылка «Открыть».
  Это устраняет `ERR_CONTENT_LENGTH_MISMATCH` при перезаписи сцены во время повторного
  запуска visuals и лишние 404 от устаревших/истёкших presigned URL.
- Аудиоплеер для озвучки сохранён.

**Проверено:**

- Все presigned URL артефактов run'а `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47` отдают
  `HEAD 200` и `Range: bytes=0-1 → 206` с корректным `Content-Length`; размеры совпадают
  с `artifacts.size_bytes`.
- `pnpm check` — зелёный: 192 теста, сборка web проходит.
- Живой browser click-through не выполнялся (не передаю пароль/сессию через инструменты);
  проверка ограничена API-ссылками, typecheck/build и store-тестом.

## 2026-11-05 — M2.4 Стадия `visuals` (Pixabay) и render из реальных сцен

**Цель:** закрыть M2.4: `VOICE_READY → VISUALS_READY`, Pixabay за портом `StockProvider`,
кеш 24 ч, реальные тайминги сцен, `visuals_json`, render из стоковых сцен и fallback на
`testsrc2` для старых run'ов.

**Сделано:**

- Контракты: `visuals` добавлен в очереди, `STAGE_REQUIRED_STATE`/`STAGE_PRODUCED_STATE`/
  `STAGE_OF_QUEUE`/`STAGE_FOR_STATE`; `stageQueueNameSchema` теперь выводится из
  `STAGE_QUEUES`; `VOICE_READY → visuals` даёт кнопку и гидрацию прогресса без изменений
  в web-архитектуре.
- Новый `packages/contracts/src/visuals.ts`: `StockProvider`, `StockAsset`,
  `StockSearchRequest`, `VisualScene`, `VisualsArtifact` и Zod-схемы сценария/манифеста.
  `ARTIFACT_TYPES` дополнен `visuals_json`, `visual_clip`, `visual_image`.
- `apps/worker/src/visuals/beat-timings.ts`: hook → beats → CTA по `word_timings`
  (нормализация регистра/пунктуации), непрерывные границы сцен; при расхождении —
  плановый fallback (hook 3 с, beat `durationSec`, CTA 3 с, масштаб на реальный конец
  аудио). Пустой alignment — ошибка стадии.
- `apps/worker/src/stock/`: Pixabay-провайдер, Redis-кеш поиска 24 ч, in-process
  sliding-window limiter 100/60 с, классификация ошибок, лимиты скачивания (видео 50 МБ,
  фото 15 МБ), проверка `content-type`, timeout/abort. `ioredis` добавлен прямой
  зависимостью worker'а.
- `apps/worker/src/stages/visuals.processor.ts`: сцены `beats + 2`, видео приоритетом, фото
  как fallback, только выбранный ассет в S3, детерминированные ключи
  `runs/<runId>/visuals/scene-<idx>`, `visuals_json`, удаление устаревших сцен, progress
  10 → 80 → 90 → 100. Повторный запуск идемпотентен.
- Worker `main.ts`: очередь `visuals` с `concurrency: 1`, Redis-кеш Pixabay, graceful
  shutdown кеша; общая обёртка превращает терминальные ошибки провайдеров
  (`retryable: false`) в `UnrecoverableError`; `handleFinalFailure` помечает run `FAILED`
  сразу на такой ошибке.
- `apps/worker/src/media/visual-track.ts`: беззвучные сегменты 1080×1920/30 fps, видео
  `-stream_loop -1` + `-t`, фото `-loop 1`, fallback `testsrc2`, concat demuxer.
  `render.processor.ts` передаёт `visuals.mp4` в `renderDraft`; без `visuals_json`
  сохраняется старый `testsrc2`. `meta.background` — `visuals` или `fallback_testsrc2`,
  плюс `visualSources`.
- Web: `stageTitle`/`stageHint` для visuals, подписи артефактов, store-тест
  `VOICE_READY → visuals` и гидрации. Новых страниц/сторов нет.
- Документация: `docs/adr/0008-visuals-stock-provider.md`, `AGENTS.md` §3/§4/§5/§6/§9,
  `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`.

**Проверено:**

- `pnpm check` — зелёный: contracts 36, storage 3, db 2, web 61, worker 67, API 23
  (192 теста), build web/API/worker проходит.
- Живой e2e на существующем run `e3e7cd1a-efa0-4ba4-a22e-ff078b282f47`
  («почему у собак мокрый нос»):
  - `REVIEW → VOICE_READY → VISUALS_READY`: 8 сцен, все 8 — Pixabay video; манифест 5839
    байт, `providerRequests=14`, `cacheHits=2`; 8 артефактов `visual_clip`.
  - Повторный запуск visuals: по-прежнему 8 `visual_clip` и 8 уникальных `object_key`,
    один `visuals_json` — дублей нет.
  - Render: job completed, run вернулся в `REVIEW`; `draft.mp4` 28 095 425 байт,
    `ffprobe`: 1080×1920, 30 fps, h264+aac, 51.7 с; в `artifacts.meta` —
    `background: visuals`, 8 `visualSources`.
  - Старый `draft_mp4` перезаписан по тому же ключу; лишних строк/объектов нет.
- `PIXABAY_API_KEY` был в локальном `.env`; реальные вызовы Pixabay выполнены, ключ не
  логировался и в артефакты не попадал.

**Ограничение ручной проверки:** живой click-through в браузере не выполнялся, чтобы не
передавать пароль/сессионную cookie через инструменты. Кнопка/гидрация покрыты
`run-detail-store.service.spec.ts`, web build/typecheck зелёные. Пользователь может
визуально проверить карточку `/runs/:id` при следующем заходе.

**Осталось:**

- Полный `provider_usage`/cost ledger — отдельный milestone, сейчас в `visuals_json` только
  реальные счётчики запросов и кеша.
- Таблица `scenes` — только когда review UI начнёт запрашивать отдельные сцены.
- Проверка качества подбора Pixabay на нескольких темах (сейчас проверена одна тема).
- SSE прогресса стадий вместо polling — по-прежнему M3-кандидат.

## 2026-11-05 — Закрытие M0 и актуализация документации

**Цель:** закрыть M0 по acceptance и убрать расхождения между кодом, README,
ARCHITECTURE и ROADMAP.

**Сделано:**

- ROADMAP: M0 → `DONE`, M2 → `DOING`; acceptance дополнен проверкой worker'а и уточнением
  про CI/секреты. Добавлена дата закрытия M0.
- README: убран устаревший статус «M0, AI-стадий нет»; описаны реальные стадии
  `script/voiceover/render`, S3-артефакты, readiness с worker'ом и актуальные ограничения.
  Пример bootstrap-пароля заменён на placeholder, добавлено напоминание про `.env`.
- ARCHITECTURE: текущий срез M0 → «M0 закрыт, M2 в работе»; worker забирает jobs из
  `system/script/voiceover/render`; S3 используется для артефактов; readiness проверяет
  Postgres/Redis/worker; обновлены следующие архитектурные шаги.
- Web shell: футер `Pipeline foundation · M0` → `Pipeline core · M2`.
- `pnpm install --frozen-lockfile` и `pnpm db:migrate` проходят.
- `pnpm check` — зелёный: contracts 29, storage 3, db 2, web 60, worker 19, API 21 (134 теста).
- `GET /health/live` → 200; `GET /health/ready` → 200,
  `checks: { database: 'up', redis: 'up', worker: 'up' }`.
- `POST /system/ping` → job `completed` за ~487 мс, прогресс через SSE 10 → 50 → 90 → 100.
- Сканирование tracked-файлов не нашло секретов; `.env` в `.gitignore`, в репозитории только
  `.env.example` и placeholder'ы.

**Ограничение:** удалённый CI-run не проверялся (нет `gh`, репозиторий недоступен через
публичный GitHub API); workflow `ci.yml` повторяет локальные гейты, которые прошли.

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

## 2026-11-04 — Рефакторинг web data layer (ADR-0007)

**Цель:** убрать дублирование в сторах и api-сервисах, разделить состояние списка и одного
run'а, починить потерю прогресса стадии при навигации.

**Сделано:**

- `core/api/base-api.service.ts`: `BaseApiService` — base URL, `withCredentials`, валидация
  ответа через структурный `ResponseSchema<T>` (без зависимости web от `zod`).
- `core/state/base-store.ts`: `BaseStore` — счётчики `loading`/`pending`, нормализация
  ошибок, `query(source)` для отменяемых чтений и `command(key, factory)` для одноразовых
  мутаций с дедупликацией. Relative id встроен в тот же класс (`setRelativeId`).
- Все api-сервисы переведены на `BaseApiService`; `startStage` теперь валидирует ответ через
  `enqueueStageResponseSchema`.
- `health` → `system` → `auth` переведены на `BaseStore`. `AuthStore.login` использует
  `pending` (login-страница обновлена), `restore()` получил `shareReplay`, чтобы guard и
  страница действительно делили один `/auth/me`.
- `RunsStoreService` удалён. Вместо него:
  - `RunsListStoreService` — scoped на роут `''`, создание run возвращает `Promise<Run | null>`;
  - `RunDetailStoreService` — scoped на роут `:id`, `setRelativeId`, detail + artifacts,
    переходы и наблюдение за стадией.
- Прогресс стадии восстанавливается с сервера при открытии run'а: `stageForProgress(run.state)`
  → `GET /runs/:id/stages/:stage/job`, `queued/active` продолжают polling, `404` — это «job'ы
  нет», `completed/failed` обновляют run один раз без повторной гидрации.
- Удалены `clearCreated()`, `clearStageJob()`, `created`-сигнал, `OnDestroy` и `loadedId`
  из страниц. Остался один `effect` в `RunPageComponent` — привязка route id к `setRelativeId`.
- В `packages/contracts` добавлен `stageForProgress` (+ тест): `RENDERING → render`, потому
  что render переводит run в `RENDERING` до завершения FFmpeg.
- `apps/web/tsconfig.json`: включены `strict` и `noUncheckedIndexedAccess`.
- `toErrorMessage`: `ZodError` больше не показывает в UI простыню JSON; добавлен
  `isHttpStatus` для ожидаемого 404.
- `/health/ready` проверяет не только Postgres/Redis, но и наличие BullMQ worker'а:
  `SystemQueue.getWorkersCount()` → `checks.worker: 'up' | 'down'`. Нет worker'а — readiness
  возвращает 503 и `status: degraded`. На странице «Состояние системы» появилась карточка
  Worker (`Подключён` / `Недоступен`).
- Документация: `docs/adr/0007-web-data-layer.md`, §8/§9 `AGENTS.md`, `apps/web/README.md`.

**Найдено и исправлено по ходу:**

1. Разделения сторов было недостаточно: root-store продолжал поллить стадию, пока страница
   чистила UI через `ngOnDestroy`. Решение — scoped store + гидрация с сервера, а не кэш
   инстансов.
2. `STAGE_FOR_STATE` не покрывает `RENDERING`, поэтому после F5 прогресс рендера исчезал.
   Добавлен отдельный контрактный helper, не смешивающий «что можно запустить» и «что уже
   выполняется».
3. Терминальный снапшот может прийти раньше, чем воркер запишет `FAILED`/следующее состояние.
   Стор делает один `reload()` без повторного наблюдения и сохраняет причину падения в `error`.
4. `defaultIfEmpty` должен стоять после `takeUntilDestroyed`, иначе отмена команды при
   уничтожении стора превращалась в `EmptyError`; добавлен тест.
5. `RunsStoreService.created` был причиной редирект-петли; теперь навигация живёт в `.then`
   промиса `create()`, а не в эффекте на глобальном сигнале.

**Проверено:**

- `pnpm --filter @peertoreel/contracts build` + `test` — 29 тестов.
- `pnpm --filter @peertoreel/api test` — 21 тест (включая readiness с worker down).
- `pnpm --filter @peertoreel/web typecheck` — без ошибок.
- `pnpm --filter @peertoreel/web test` — 12 файлов, 60 тестов.
- `pnpm --filter @peertoreel/web lint` и `build` — без ошибок; initial bundle 323.34 kB raw /
  ~90.6 kB transfer (production build).
- `GET /api/v1/health/ready` при живом worker'е — 200,
  `checks: { database: 'up', redis: 'up', worker: 'up' }`.
- `pnpm check` — зелёный: contracts 29, storage 3, db 2, web 60, worker 19, API 21 (134 теста).

**По ходу ручной проверки (после рефакторинга):**

- Ping завис в `queued`, SSE отдавал `queued 0`, потому что dev-воркер (`tsx watch`) остался
  без дочернего процесса — вероятно, после пересборки `@peertoreel/contracts`. В Redis
  `bull:system:wait` было 3 job'а, `bull:system:active` — 0.
- После перезапуска watcher'а (`touch apps/worker/src/main.ts` или рестарт `pnpm dev`) воркер
  забрал очередь; ping прошёл `10 → 50 → 90 → 100 → completed`, SSE отдал те же снапшоты.
- Это не дефект web-слоя: `queued 0` — корректный начальный снапшот, пока job никто не
  потребляет. После `pnpm check`/пересборки contracts нужно проверять, что worker жив.

**Осталось:**

- SSE для прогресса run'а вместо polling (M2), `rxResource` для detail-экрана — кандидат M3.
- M2.4 — стадия `visuals` (Pixabay) вместо синтетического фона.

## 2026-11-04 — M2.3 Стадия `render` в очереди (цикл замкнут до REVIEW)

**Цель:** собрать черновик видео из уже готовых артефактов на воркере, а не руками.

**Сделано:**

- Контракты: очередь `render`, `STAGE_REQUIRED_STATE.render = VISUALS_READY`,
  `STAGE_PRODUCED_STATE.render = REVIEW`, `STAGE_FOR_STATE.VISUALS_READY = 'render'`.
- `apps/worker/src/stages/render.processor.ts`: читает `voiceover_mp3` и `word_timings` из S3,
  заново собирает ASS из таймингов (чтобы пересборка всегда совпадала со звуком), генерирует
  фоновый клип `testsrc2` по длине речи, зовёт `renderDraft` (1080×1920, 30 fps, loudnorm
  двумя проходами), грузит `draft.mp4` в S3, пишет артефакт и переводит
  `VISUALS_READY → RENDERING → REVIEW`. Временный каталог удаляется в `finally`.
- UI: кнопка «Сборка черновика» из состояния «Визуалы готовы»; карточка стадии остаётся
  видимой во время выполнения (новый сигнал `activeStage`) даже когда состояние уже
  `RENDERING`.

**Найдено и исправлено по ходу:**

1. **Повторный запуск возвращал старый job.** `jobId` детерминирован (`render-<runId>`),
   поэтому `Queue.add` с тем же id отдавал уже упавший job, и стадия не выполнялась.
   Исправление: `StagesQueue.enqueue` удаляет существующий job, если он в `completed`/`failed`.
2. **`resume_state` указывал на промежуточное состояние.** Стадия переводит run в
   `RENDERING` до рендера, поэтому падение (ENOENT FFmpeg) сохраняло `resume_state = RENDERING`,
   и «Повторить стадию» возвращало в состояние, из которого стадия не запускается.
   Исправление: `failRun` принимает `resumeState` и получает `STAGE_REQUIRED_STATE[stage]`.
3. **Воркер не видел FFmpeg.** У процесса не было его в `PATH`. Добавил в `.env`
   `FFMPEG_BIN`/`FFPROBE_BIN` абсолютными путями и переменные в `.env.example`.

**Проверено (run «Как работает вакцина», 59 с озвучки):**

- Первый запуск упал на `spawn ffmpeg ENOENT` → UI показал `FAILED` со стадией «Рендер» и
  причиной, `resume_state = VISUALS_READY` — путь ошибки отработал как задумано.
- После фиксов: «Повторить стадию» → `VISUALS_READY` → «Запустить» → прогресс 0 → 25 → 40 →
  `REVIEW`. Артефакт `draft_mp4` 51.5 МБ, `<video>` в карточке: `1080×1920`, `59.5 s`,
  `readyState 4`.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Осталось:**

- Визуалы (Pixabay) — сейчас фон синтетический `testsrc2`, отсюда и 51 МБ на минуту.
- `provider_usage` и SSE прогресса вместо опроса.
- Очистка объектов S3 при удалении run'а.

## 2026-11-04 — Настоящая причина «залипающей» кнопки: редирект-петля

**Симптом (уточнён пользователем):** создать черновик через «Создать run», затем нажать
«← Все прогоны» → URL на мгновение меняется на `/runs`, но страница сразу возвращается к
run'у. Помогает только reload.

**Причина:** `RunsPageComponent` в конструкторе подписан на `store.created()` — сигнал
«последний созданный run». После создания он остаётся заполненным в root-store, поэтому при
возврате в список компонент создаётся заново, эффект снова видит `created` и делает
`router.navigate(['/runs', created.id])`. Получалась петля: список → run → список → run.

Reload «лечил» потому, что стор пересоздавался и `created` был `null`.

**Сделано:**

- `RunsStoreService.clearCreated()` — сбрасывает сигнал.
- `RunsPageComponent` в эффекте: `clearCreated()` вызывается до навигации, поэтому повторного
  редиректа нет.
- Откатил `--no-hmr` в `dev`/`start` (был добавлен по ошибочной диагностике HMR) и убрал
  соответствующий абзац из README. Кнопка возврата осталась отдельным методом
  `goToRuns()` с `navigateByUrl`.

**Проверено в браузере (ровно сценарий из жалобы):**

- «Создать run» → попадаем на `/runs/:id` → «← Все прогоны» → путь остаётся `/runs`,
  форма на месте; в течение 4 секунд после клика путь не меняется (проверял каждый 150 мс).
- Повторный вход в тот же run из списка и возврат — тоже остаётся на `/runs`.
- Ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Урок:** прежде чем винить HMR/кэш, проверяйте, не остаётся ли в root-store сигнал, который
провоцирует навигацию при повторном создании компонента. Мой прошлый разбор был неверным.

## 2026-11-04 — Фикс кодировки после PowerShell-правок

**Симптом:** в UI надписи стадий показывались иероглифами (`Р“РµРЅРµСЂР°С†РёСЏ…`).

**Причина:** часть правок я делал через PowerShell (`Get-Content -Raw` → `-replace` →
`Set-Content`). `Get-Content` без `-Encoding` читает UTF-8 как ANSI, поэтому кириллица
превратилась в mojibake и в таком виде записалась обратно. Пострадали четыре файла:

- `apps/web/.../run-page.component.ts` — `stageTitle`, `stageHint`;
- `apps/worker/src/stages/transition.ts` — два сообщения об ошибках;
- `apps/worker/src/stages/voiceover.processor.ts` — два сообщения;
- `apps/worker/src/stages/script.processor.ts` — одно сообщение.

**Сделано:**

- Все строки восстановлены (правки через `edit`, который пишет UTF-8 корректно).
- Заодно поправлена склеенная строка в `runStage()` (`{    const run = …`).
- Для проверки написан разовый сканер (вне репозитория), который ищет mojibake по
  сигнатурам `Р+continuation` / `вЂ`; после правок — `no mojibake`.

**Проверено:**

- Браузер: карточка run'а показывает «Генерация озвучки», подсказку про ElevenLabs,
  бейдж «Сценарий готов», артефакт «Сценарий», ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Правило на будущее:** файлы с кириллицей не редактировать через `Set-Content`/`-replace`
в PowerShell 5.1 — только `edit`/`write`, либо `-Encoding utf8` на чтении и записи.

## 2026-11-04 — Фикс «залипающей» кнопки «Все прогоны»

**Симптом:** после полного прогона стадий ссылка возврата на список перестаёт реагировать.

**Разбор:**

- Роутинг не виноват: `routerLink="/runs"` тоже не срабатывал, а `navigateByUrl` в обработчике
  выполнялся без ошибок и без смены URL.
- Причина — HMR дев-сервера: компонент подменяется в открытой вкладке, обработчики кликов
  остаются от старой версии. После `reload` кнопка работает.
- Побочный эффект того же класса: страница run'а иногда рендерилась пустой (только ссылка
  назад), хотя запросы `/runs/:id` и `/artifacts` уходили и отвечали 200.

**Сделано:**

- `RunPageComponent.goToRuns()` — отдельный метод с `router.navigateByUrl('/runs')` вместо
  `routerLink`; в разметке `<button type="button" class="run__back">`.
- `RunsStoreService.clearStageJob()` — сбрасывает снапшот последней стадии; вызывается в
  `goToRuns()` и в `ngOnDestroy`, чтобы «completed 100%» не висел при возврате.
- `apps/web/package.json`: `dev` и `start` теперь `ng serve --port 4200 --no-hmr`. Полная
  перезагрузка вместо подмены компонентов — этот класс «мёртвых» обработчиков исчезает.
  *(Откатано: причина была в редирект-петле, см. запись выше; скрипты снова без `--no-hmr`.)*
- README, раздел Troubleshooting: описано, что делать при «UI не реагирует».

**Проверено:**

- Свежая вкладка: клик по кнопке → `URL /runs`, список и форма создания на месте, ошибок нет.
- Повторное открытие run'а: прогресс стадии отсутствует, состояние и артефакты на месте.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

## 2026-11-04 — M2.1c Кнопки стадий и прогресс в UI

**Цель:** запускать стадии из интерфейса, а не через curl, и видеть их прогресс.

**Сделано:**

- Контракты: `STAGE_FOR_STATE` (`RESEARCHING → script`, `SCRIPT_READY → voiceover`) — один
  источник правды и для кнопок в UI, и для будущих проверок.
- Web API: `startStage()` (POST), `stageJob()` (GET) с Zod-валидацией снапшота.
- Store: `runStage(id, stage)` через `exhaustMap`, затем опрос `timer(0, 1500)` до
  `completed`/`failed` (`takeWhile`), сигналы `stageJob`/`stageRunning`; по завершении —
  перезагрузка run'а, артефактов и списка; при `failed` — текст ошибки из `failedReason`.
- Карточка run'а: блок «Генерация сценария» / «Генерация озвучки» с кнопкой «Запустить»,
  прогресс-баром и процентами; кнопка блокируется, пока стадия выполняется.
- Двойной запуск невозможен: `stageRunning()` + `exhaustMap`.

**Проверено в браузере (три новых run'а):**

- «Почему мы видим молнию раньше грома»: `DRAFT → RESEARCHING` → «Запустить» → прогресс
  `active 10% … completed 100%` → `SCRIPT_READY`, артефакт «Сценарий» появился сам.
- Далее «Генерация озвучки» → `active 10%` → `VOICE_READY`, артефактов стало 4
  (Сценарий, Субтитры, Тайминги слов, Озвучка).
- «Зачем котам усы»: тот же путь, ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Наблюдения:**

- Опрос раз в 1.5 s: у быстрых стадий (5–10 s) видно 1–2 промежуточных значения и финальные
  100% — для реального рендера (1–3 мин) этого достаточно.
- После завершения артефакты подтягиваются автоматически, без перезагрузки страницы.

**Осталось:**

- Стадия `render` (следующий шаг): mp3 + тайминги + ASS из S3 → `draft_mp4` → `REVIEW`.
- `provider_usage` и SSE вместо опроса.

## 2026-11-04 — M2.1b Артефакты в UI

**Цель:** увидеть произведённые файлы там же, где состояние run'а, без curl и docker.

**Сделано:**

- `RunsApiService.artifacts(id)` — `GET /runs/:id/artifacts` с Zod-валидацией.
- `RunsStoreService`: сигнал `artifacts`, загрузка через `forkJoin(run, artifacts)` внутри
  существующего `detailRequests`; ошибка списка артефактов не ломает карточку run'а
  (`catchError → []`), после перехода список обновляется вместе с run'ом.
- `data-access/artifact-labels.ts`: русские названия типов, `formatBytes`, `isVideo`,
  `isAudio`, сортировка по порядку стадий.
- Карточка run'а: блок «Артефакты (N)» — тип, стадия, размер, дата, ссылка «Открыть»;
  для `video/*` — встроенный плеер, для `audio/*` — аудиоплеер.

**Проверено в браузере:**

- Run «Как работает вакцина» (`VOICE_READY`): 4 артефакта — Сценарий (2.3 КБ), Субтитры
  (15.1 КБ), Тайминги слов (9.0 КБ), Озвучка (930.7 КБ), аудиоплеер присутствует.
- Run «Как строились пирамиды»: «Черновик видео» 32.6 МБ, `<video>` подхватил объект из S3 —
  `readyState 4`, `duration 37.5 s`, `1080×1920`.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 35, db 2, storage 3 (106 тестов).

**Наблюдения:**

- Подписанные ссылки отдаются только авторизованным (сам эндпоинт под guard'ом), живут 1 час.
- `readyState 0` сразу после рендера — нормально: метаданные подгружаются асинхронно.
- Для JSON-артефактов пока только ссылка «Открыть»; встроенный просмотр добавим, если
  понадобится (CORS у бакета сейчас не настроен, `fetch` из браузера не пройдёт).

## 2026-11-04 — M2.2 Стадии `script` и `voiceover` в очереди (слайс B)

**Цель:** первые настоящие стадии пайплайна: не `tsx`, а job'ы в BullMQ, с артефактами
в S3, переходами run'а и классификацией ошибок.

**Сделано:**

- Контракты `stages.ts`: `STAGE_QUEUES`/`STAGE_JOB_NAMES` (`script`, `voiceover`),
  `STAGE_REQUIRED_STATE`/`STAGE_PRODUCED_STATE`, `stageJobId()`, схемы job data/result/
  snapshot и `stageQueueNameSchema`.
- Worker: `stages/transition.ts` (`loadRun`, `transitionRun` в транзакции с `run_events`,
  `failRun` с `resume_state`), `stages/save-artifact.ts` (upsert по `object_key`),
  процессоры `script.processor.ts` (LLM → `script_json` → `SCRIPT_READY`) и
  `voiceover.processor.ts` (TTS → mp3 + word timings + ASS → `VOICE_READY`).
- `main.ts`: три воркера (system, script ×2, voiceover ×1), общий `StageDeps` (db, storage,
  env, logger), помечание run'а `FAILED` только на последней попытке.
- Worker env: `DATABASE_URL`, `S3_*`, `FFMPEG_BIN`, ключи провайдеров (опциональны при
  старте — стадия падает с понятным сообщением, если ключа нет).
- API: `StagesQueue` (очередь на стадию), `StagesService` (проверка состояния перед
  запуском), `POST /runs/:id/stages/:stage` (202) и `GET /runs/:id/stages/:stage/job`
  (статус, прогресс, результат, причина падения).

**Проверено (живой прогон, run «Как работает вакцина»):**

- `POST /runs/:id/stages/script` → job `script-<runId>`, прогресс 10 → 100, результат
  `SCRIPT_READY` и артефакт `script_json` (2393 байта) в S3.
- `POST /runs/:id/stages/voiceover` → `VOICE_READY`, три артефакта: `voiceover_mp3`
  952 990 байт, `word_timings` 9211 байт, `subtitles_ass` 15 463 байта.
- `GET /runs/:id` — история: `DRAFT → RESEARCHING → SCRIPT_READY → VOICE_READY` с
  правильными стадиями; `GET /runs/:id/artifacts` — 4 артефакта, ссылка на mp3
  скачивается (200, 952 990 байт), `ffprobe`: 59.49 s, 128 kbps.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 32, db 2, storage 3 (103 теста).

**Найденные грабли:**

- BullMQ запрещает `:` в кастомном `jobId` — первый вариант `script:<runId>` дал 500;
  формат заменён на `script-<runId>`, тест это фиксирует.
- `tsx watch` и `nest start --watch` не перезапускаются при изменении `packages/contracts`
  в `dist` — после правки контрактов нужно тронуть файл в `src` приложения.

**Осталось:**

- `provider_usage` (стоимость вызовов) и SSE прогресса стадий для UI.
- Стадия `render` в очереди и кнопки запуска стадий в web.
- Очистка объектов S3 при удалении run'а.

## 2026-11-04 — M2.1 Storage + artifacts (слайс A)

**Цель:** превратить спайки в инфраструктуру: общий доступ к БД, S3-хранилище и реестр
артефактов, чтобы worker мог писать результаты стадий, а UI — их читать.

**Сделано:**

- Новый пакет `packages/db`: схема Drizzle переехала из `apps/api/src/db/`, добавлен
  `createDatabase(url)` (pool + drizzle), тест паритета enum'ов перенесён туда же.
- Таблица `artifacts` (`run_id`, `stage`, `type`, `object_key`, `content_type`, `size_bytes`,
  `meta`), уникальный `object_key`, индекс `(run_id, stage)`. Миграция `0004` применена.
- Новый пакет `packages/storage`: `ObjectStorage` (`put/get/delete/presignGet`) поверх
  SeaweedFS/R2 и `buildArtifactKey(runId, stage, name)`.
- API: `StorageModule` (глобальный), `ArtifactsRepository`, `RunsService.artifactsFor()`,
  `GET /api/v1/runs/:id/artifacts` — список с подписанными ссылками (1 час).
  Env получил `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY/FORCE_PATH_STYLE`.
- Worker: зависимости `@peertoreel/db`, `@peertoreel/storage`, `drizzle-orm`, `pg`; скрипт
  `src/storage-spike.ts` — загрузка файла, запись артефакта, проверка подписанной ссылки и
  roundtrip.
- ADR-0006, обновлены `AGENTS.md` (§2, §3, §8) и `ARCHITECTURE.md`.

**Проверено:**

- `storage-spike`: файл 34 216 005 байт загружен в SeaweedFS по ключу
  `runs/655c3b06…/render/draft.mp4`, строка `artifacts` записана, `presignGet` вернул
  ссылку, скачивание по ней — 200 и тот же размер, `getObject` — roundtrip ok.
- Повторный запуск: «уже записан (тот же id), объект перезаписан»; в БД по-прежнему одна
  строка и 34 216 005 байт — идемпотентность на уровне `object_key`.
- `GET /runs/:id/artifacts` с cookie: 200, один артефакт `draft_mp4`/`render`, ссылка
  отдаёт ровно 34 216 005 байт.
- `pnpm check` — зелёный: contracts 23, API 20, worker 19, web 32, db 2, storage 3 (99 тестов).

**Решения:**

- Миграции остались в `apps/api/drizzle`; worker их не применяет (см. ADR-0006).
- Артефакты пишет тот, кто произвёл файл; API только читает и подписывает ссылки.
- Локальный диск — scratch для FFmpeg, не место хранения.

**Осталось (слайс B):**

- Стадия `voiceover` в очереди: job по переходу `SCRIPT_READY → VOICE_READY`, запись
  `voiceover.mp3` + `word_timings.json` как артефактов, `provider_usage`, SSE прогресса run'а.
- Очистка объектов S3 при удалении run'а (сейчас каскад чистит только строки).

## 2026-11-04 — S0.6 Script generation (R2b): тема → скрипт → видео

**Цель:** закрыть последнее звено «под ключ» — из строки темы получить готовый MP4, без ручного
текста.

**Сделано:**

- `packages/contracts/src/script.ts`: `scriptBeat` (text, visualDirection, durationSec),
  `script` (title, hook, beats 2–12, cta), `scriptSpeechText()` (hook → beats → cta одной
  строкой для TTS), `scriptPlannedDurationSec()` (плановые оценки, не тайминги).
- `apps/worker/src/llm/deepseek.ts`: OpenAI-совместимый клиент `generateJson(schema, …)`.
  `response_format: json_object`, `thinking: disabled` (иначе модель тратит весь лимит на
  `reasoning_content` и возвращает пустой `content`), Zod-валидация, до 3 попыток на
  невалидный JSON, `LlmError` с классификацией retryable (429/5xx) и без ретраев на 401/403/402.
- `apps/worker/src/script/prompt.ts`: системный и пользовательский промпты (RU-сценарий,
  5–8 beat'ов, английские ключевые слова для стокового поиска, без кликбейта).
- `apps/worker/src/script/script-spike.ts`: тема → скрипт → озвучка (`with-timestamps`) →
  ASS-караоке → рендер.

**Проверено (реальный прогон на теме «Почему небо синее»):**

- Скрипт: 7 beat'ов, 494 символа, 399/400 токенов, 2.9 s; заголовок «Почему небо синее:
  простое объяснение», хук «Солнечный свет кажется белым, но это не так», осмысленные
  `visualDirection` (`prism splitting light into rainbow`, `sunset red orange sky`, …).
- Озвучка: 600 KB за 2.6 s, 78 слов, речь заканчивается на 37.48 s.
- Рендер: 6.4 s, MP4 1080×1920/30 fps, h264+aac, 37.5 s, 34 MB (тестовая таблица почти
  не сжимается — на реальном стоке будет кратно меньше).
- Кадр на 18.0 s: «Поэтому синий цвет как» с подсветкой «цвет» — синхрон с озвучкой.
- Громкость итогового файла: −14.62 LUFS, true peak −1.19 dBTP.
- `pnpm check` — зелёный: контракты 23, API 22, worker 19, web 32.

**Решения и наблюдения:**

- `durationSec` от LLM — только план (46 s против реальных 37.5 s). Таймлайн строится по
  character alignment от TTS, а не по оценке модели.
- Модель `deepseek-flash` — reasoning-модель: без `thinking: disabled` ответ приходит с пустым
  `content` и `finish_reason: length`. Это зафиксировано в клиенте.
- Стоимость: токены пишутся из `usage` (399/400), денег DeepSeek в ответе не отдаёт —
  в `provider_usage` будем хранить токены и считать цену по прайсу на момент вызова.

**Осталось:**

- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Визуалы: пока синтетический `testsrc2`; реальный Pixabay — стадия `visuals`.

## 2026-11-03 — S0.5 Render + TTS spike (R1 / R2a)

**Цель:** снять два главных риска — «соберём ли мы вообще вертикальное видео» и «получим ли
осмысленную озвучку с таймингами» — до начала работ по M2.

**Сделано:**

- `apps/worker/src/media/karaoke.ts` — ASS-караоке из пословных таймингов: фразы по 4 слова,
  активное слово жёлтым (`\c&H00FFFF&\b1`), холст 1080×1920, `MarginV=320` под UI платформы,
  экранирование `{}` и `\`, тайм-коды в сантисекундах.
- `apps/worker/src/media/loudnorm.ts` — двухпроходный loudnorm: разбор JSON-замера FFmpeg,
  фильтр второго прохода с `measured_*` и `linear=true`.
- `apps/worker/src/media/ffmpeg.ts` — сборка видео: `scale`+`crop` до 1080×1920, `fps=30`,
  `ass`, loudnorm, libx264/CRF 21, AAC 128k/48 kHz, `+faststart`, `-shortest`. Запуск через
  `spawn` с массивом аргументов (`shell: false`), таймаут и `FfmpegError` со stderr.
- `apps/worker/src/tts/elevenlabs.ts` — `POST /v1/text-to-speech/{voice_id}/with-timestamps`,
  Zod-валидация ответа, `TtsError` с `retryable` (429/5xx — да, 401/403/404 — нет).
- `apps/worker/src/tts/word-timings.ts` — слова из character alignment.
- Спайк-скрипты `media/render-spike.ts` (синтетические входы) и `tts/tts-spike.ts`
  (реальная озвучка → ASS → MP4 → ffprobe); запуск через `tsx`.

**Проверено:**

- R1 (синтетика): MP4 1080×1920, 30 fps, h264+aac 48 kHz, 2.70 s, 902 KB;
  −14.0 LUFS; кадр на 1.0 s — «караоке» подсвечено жёлтым, кириллица рендерится.
- R2a (ElevenLabs, `eleven_multilingual_v2` + premade-голос `Xb7hH8MSUJpSbSDYk0k2`):
  озвучка 89 KB за 791 ms, 11 слов, последнее слово кончается на 5.53 s;
  итог 1080×1920, 30 fps, 5.60 s, 1.84 MB; кадр на 2.10 s — жёлтым «воздуха», точно по
  таймингу 2.02–2.44.
- Двухпроходный loudnorm: −14.44 LUFS, true peak −1.43 dBTP (однопроходный давал −15.4).
- `pnpm check` — зелёный: контракты 18, API 22, worker 14, web 32.

**Найденные ограничения провайдера:**

- Бесплатный план ElevenLabs не даёт использовать library-голоса через API
  (`402 paid_plan_required`); premade-голоса работают. `voices_read` у ключа должен быть
  включён, иначе список голосов не читается.
- Free tier — некоммерческая лицензия, а default-голоса удаляются 31.12.2026. Для
  публикуемого контента нужен минимум Starter ($5–6/мес, 30k кредитов ≈ 30 мин TTS).
- Ключ DeepSeek в `.env` пока заглушка (401) — R2b не начат.

**Осталось:**

- R2b: генерация скрипта через DeepSeek (нужен рабочий ключ).
- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Перенести спайки в стадийные job'ы worker'а и `artifacts` — после R3.

## 2026-11-03 — S0.4b Reviewer gate UI

**Цель:** довести машину состояний до пользователя: список прогонов, карточка run'а, гейты
`SCRIPT_READY`/`REVIEW`, история переходов.

**Сделано:**

- Web `features/runs/`: `RunsApiService` (list/detail/create/transition, `withCredentials`),
  `RunsStoreService` (`switchMap` на чтение, `exhaustMap` на создание и переход, сигналы
  `runs/selected/allowed/loading/pending/error/created`), `run-labels.ts`
  (подписи состояний, стадий, действий перехода).
- `allowed` считается той же функцией `allowedTransitions` из контрактов, что и на сервере:
  UI физически не может предложить запрещённое ребро.
- Страницы: `/runs` — форма создания + список с бейджами; `/runs/:id` — состояние, стадия,
  карточка ошибки (`failed_stage` + причина + подсказка про повтор), кнопки переходов,
  обязательный комментарий для `FAILED`, история `run_events`.
- Роут `runs` под `authGuard`, ссылка «Прогоны» в shell.
- Найдено и исправлено на ревью: форма создания была без `[formGroup]`, поэтому `(ngSubmit)`
  не срабатывал и браузер делал нативный submit (перезагрузка страницы, run не создавался).
  Форма переведена на `NonNullableFormBuilder` + `formGroup`/`formControlName`.

**Проверено:**

- `pnpm --filter @peertoreel/web typecheck` и `test` — успешно, web 32 теста (было 21).
- Браузер, авторизованной сессией:
  - `/runs` показывает список (включая созданные через API) и форму;
  - создание из UI → `201`, редирект на `/runs/:id`;
  - `Начать исследование` → Исследование, `Принять бриф` → Сценарий готов,
    `Утвердить сценарий` → Озвучка готова (гейт работает);
  - `Остановить с ошибкой` без комментария → сообщение «укажите причину», запроса нет;
  - с комментарием `ElevenLabs 429` → FAILED, карточка «Стадия Озвучка остановлена»,
    доступна только кнопка «Повторить стадию»;
  - «Повторить стадию» → Озвучка готова, история 6 записей, console errors — 0.
- `pnpm check` — зелёный: контракты 18, API 22, worker 2, web 32; initial bundle 320 kB.

**Осталось:**

- Vite-прекеш: после добавления новых экспортов в `@peertoreel/contracts` дев-сервер web нужно
  перезапускать с очисткой `apps/web/.angular/cache`, иначе `does not provide an export named …`.
- Нет пагинации/фильтров, нет автоперезагрузки списка, нет optimistic-обновления.

**Следующая сессия:** S1 — publish risk spike (TikTok private publish + manual export).

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

## 2026-11-01 — Angular feature structure: api/ + data-access/

**Цель:** сделать навигацию по web data layer явной и закрепить соглашение в документации.

**Сделано:**

- `features/health/data/**` разложен по папкам `api/` (транспорт) и `data-access/` (store и
  его domain helper).
- `HealthApi` → `HealthApiService`, `HealthStore` → `HealthStoreService`; файлы
  `health-api.service.ts` / `health-store.service.ts`, тесты — рядом (`*.spec.ts`).
- В `AGENTS.md` переписан раздел Frontend data layer (пути, имена классов, тесты рядом с
  исходниками). Для NestJS явно зафиксировано: модульные файлы остаются в одной папке, без
  `controllers/services/repositories`.
- Структура отражена в `apps/web/README.md`, `ARCHITECTURE.md` и `.opencode/agents/reviewer.md`.

**Проверено:**

- `pnpm check` — lint, typecheck, tests (contracts 3, API 3, web 8), build: успешно.
- Поведение и тестовые сценарии не менялись — только перемещение файлов и переименование классов.

## 2026-10-30 — S0.1 Bootstrap & health vertical slice

**Цель:** запускаемый монорепо, в котором web видит здоровье API, а API проверяет Postgres и Redis.

**Сделано:**

- Создан pnpm workspace, корневые tsconfig/prettier/editorconfig.
- Создан `@peertoreel/contracts` с Zod-схемами health и error.
- Создан `apps/api` на NestJS 12: config, Postgres, Redis, health, error filter, миграции.
- Создан `apps/web` на Angular 22: shell, health page, API client, store, Material 3.
- Поднят `infra/docker-compose.yml`: PostgreSQL 18, Redis 8, SeaweedFS S3.
- Применена миграция `0001_init.sql`.
- Добавлен CI workflow.
- MinIO заменён на SeaweedFS из-за удаления community-образов; решение записано в ADR-0002.
- Frontend data layer приведён к правилу: `*.api.ts` — только транспорт, `*.store.ts` — состояние.
  `HealthApi` возвращает `Observable<ReadinessResponse>` без `firstValueFrom`/`catchError`;
  `HealthStore` использует `Subject` + `switchMap` + `catchError` + `takeUntilDestroyed`.
  503 readiness обрабатывается в store как degraded domain data.
- Правила frontend data layer зафиксированы в `AGENTS.md`.

**Проверено:**

- `pnpm db:migrate` — applied 0001_init.sql.
- `pnpm --filter @peertoreel/contracts build` — успешно.
- `pnpm --filter @peertoreel/api typecheck` — успешно.
- `pnpm --filter @peertoreel/api test` — 3 теста.
- `pnpm --filter @peertoreel/web typecheck` — успешно.
- `pnpm --filter @peertoreel/web build` — успешно.
- `docker compose ... up -d --wait` — Postgres, Redis, storage healthy.

- `GET /api/v1/health/live` → 200, `status: ok`.
- `GET /api/v1/health/ready` → 200, `database: up`, `redis: up`.
- При остановленном Redis readiness → 503, `status: degraded`, `redis: down`.
- После старта Redis readiness снова → 200.
- Web в браузере: health page отображает API/PostgreSQL/Redis и uptime.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — успешно.
- `pnpm test`: contracts 3, API 3, web 8.
- API/store tests: URL/method/mapping, 503 degraded, normalized error, switchMap cancellation.

**Осталось проверить:**

- CI на GitHub после первого push.
- `git init` и remote (делает пользователь).

## 2026-11-02 — Drizzle foundation

**Цель:** заменить самописный migration runner на Drizzle ORM + drizzle-kit до появления
первой бизнес-таблицы.

**Сделано:**

- Добавлены `drizzle-orm` и `drizzle-kit`.
- Создана схема `apps/api/src/db/schema.ts` с `app_meta`.
- `DatabaseService` создаёт `pg.Pool` и `NodePgDatabase`.
- Добавлен `drizzle.config.ts`.
- Сгенерирована миграция `0000_nifty_living_mummy.sql`; для существующей локальной БД
  сделана идемпотентной (`CREATE TABLE IF NOT EXISTS`).
- Custom-миграция `0001_drop_legacy_migrations.sql` удалила старую `schema_migrations`.
- Удалены `src/db/migrate.ts` и старый SQL-мигратор.
- `db:migrate` теперь применяет Drizzle-миграции; добавлены `db:generate` и `db:studio`.
- Решение зафиксировано в `docs/adr/0003-drizzle-orm.md`.

**Проверено:**

- `drizzle-kit migrate` применил 2 миграции.
- В БД остались `app_meta` и `drizzle.__drizzle_migrations`; `schema_migrations` удалена.
- `app_meta` сохранила `schema_version = 1`.
- `pnpm --filter @peertoreel/api typecheck` и `test` прошли.
- `pnpm check` — lint/typecheck/test/build зелёные.
- Health endpoint работает через Drizzle (`select 1`): `GET /api/v1/health/ready` → 200.
- Повторный `db:generate` пишет `No schema changes`.

## 2026-11-02 — S0.2a Worker + BullMQ + ping job

**Цель:** отдельный worker, очередь `system` и end-to-end ping через Redis.

**Сделано:**

- Создан `apps/worker` (ESM, TS): config/env, Redis connection options, ping processor, main.
- В contracts добавлены `SYSTEM_QUEUE`, `PING_JOB`, ping schemas и status snapshot.
- В API добавлен `SystemModule`: `POST /api/v1/system/ping`, `GET /api/v1/system/ping/:jobId`.
- Добавлен `ZodValidationPipe` для валидации body на границе.
- `Queue.add` использует `jobId = requestId`, `attempts: 3`, exponential backoff,
  `removeOnComplete/removeOnFail: 100`.
- Worker обновляет progress 10 → 50 → 90 → 100, возвращает типизированный результат.
- Worker закрывается по `SIGINT`/`SIGTERM`.
- Root `pnpm dev` запускает api + web + worker.

**Проверено:**

- `pnpm check` — lint/typecheck/test/build зелёные.
- Tests: contracts 7, API 3, worker 2, web 8.
- `POST /api/v1/system/ping` с `requestId=demo-1` дважды → оба ответа `jobId=demo-1`.
- `GET /api/v1/system/ping/demo-1` → `status: completed`, `progress: 100`,
  result содержит `requestId`, `processedAt`, `durationMs`.
- В Redis существует один job hash `bull:system:demo-1`; дубль не создан.
- Worker обработал job и залогировал `job completed`.

## 2026-11-02 — S0.2b SSE progress + web ping UI

**Цель:** показать прогресс job в реальном времени и дать пользователю кнопку запуска.

**Сделано:**

- API: `SystemEventsService` на BullMQ `QueueEvents`; SSE endpoint
  `GET /api/v1/system/ping/:jobId/events`.
- SSE отправляет начальный snapshot, затем live-события `waiting/active/progress/completed/failed`
  и завершает поток на `completed`/`failed`.
- Web: feature `features/system/` по структуре `api/` + `data-access/` + `pages/`.
- `SystemApiService`: POST enqueue, GET snapshot, SSE через `EventSource`.
- `SystemStoreService`: `exhaustMap` на запуск, `switchMap` на SSE, сигналы
  `jobId/status/progress/result/error/running/history`.
- Страница `/system`: кнопка запуска, progress bar, job ID, результат, история событий.
- Навигация в shell: «Очередь».

**Проверено:**

- `pnpm --filter @peertoreel/web typecheck` и `test` — успешно.
- Web tests: 12 (включая SystemApiService и SystemStoreService).
- SSE вручную: `GET /api/v1/system/ping/demo-sse-4/events` отдал `active 90` и
  `completed 100` с result.
- Браузер: `/system` → «Запустить ping» → job завершился, UI показал 100%,
  request ID, время обработки и длительность; console errors нет.
- `pnpm check` — будет финально прогнан после документации.

**Следующая сессия:** S0.3 — auth + sessions + baseline schema.
