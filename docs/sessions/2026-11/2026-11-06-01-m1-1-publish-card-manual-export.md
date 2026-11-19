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

