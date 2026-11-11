# Peer to Reel — AI Content Factory

Peer to Reel — pipeline-платформа для производства коротких вертикальных видео: тема → исследование →
сценарий → озвучка → визуалы → рендер → QC → публикация.

**M0 — Walking Skeleton закрыт.** Текущий этап — **M2 — Factory Core**: работают стадии
`script`, `voiceover`, `visuals`, `render` и `qc` (до `REVIEW`), run detail с
восстановлением прогресса стадии, health-check с проверкой worker'а и вход по сессии.
**M1.1** добавляет publish card и ручной экспорт: одобренный черновик можно скачать,
скопировать подпись и отметить опубликованным вручную. **M1.2a** добавляет подключение
TikTok через Login Kit, шифрованный token vault и CLI-загрузку. **M1.2b** — очередь
`publish` и кнопка «Опубликовать в TikTok» в publish card со статусом и прогрессом;
webhooks, rate limiter и выбор аккаунта — M1.2c.

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
- TikTok accounts: `/accounts` в web; API `GET /accounts/tiktok`, `GET /accounts/tiktok/authorize`, callback `/accounts/tiktok/callback`
- Загрузка черновика в TikTok: `pnpm --filter @peertoreel/worker tiktok:spike -- --run <runId> --dry-run`
- Worker запускается вместе с `pnpm dev`

### Первый вход

При первом старте API создаёт администратора из `.env`, если таблица `users` пуста:

```bash
BOOTSTRAP_ADMIN_EMAIL=owner@peertoreel.local
BOOTSTRAP_ADMIN_PASSWORD=change-me-before-first-run
SESSION_TTL_HOURS=168
```

Остановить инфраструктуру:

```bash
pnpm infra:down
```

## Скрипты

| Команда | Что делает |
|---|---|
| `pnpm dev` | Собирает `packages/*` и запускает contracts (watch) + API + web + worker |
| `pnpm build` | Собирает все пакеты в топологическом порядке |
| `pnpm build:packages` | Собирает только `packages/*` (contracts, db, storage) |
| `pnpm lint` | oxlint по пакетам |
| `pnpm typecheck` | Собирает `packages/*`, затем TypeScript-проверка |
| `pnpm test` | Собирает `packages/*`, затем unit-тесты |
| `pnpm check` | lint + typecheck + test + build |
| `pnpm --filter @peertoreel/api db:generate` | Генерирует миграцию из `schema.ts` |
| `pnpm db:migrate` | Применяет миграции через drizzle-kit |
| `pnpm --filter @peertoreel/api db:studio` | Drizzle Studio для локальной БД |
| `pnpm infra:up` | Postgres + Redis + S3 |
| `pnpm infra:down` | Останавливает инфраструктуру |
| `pnpm --filter @peertoreel/render-worker render-fixture` | Рендерит 6 сцен фикстуры «−15°» в `apps/render-worker/out` |
| `pnpm --filter @peertoreel/render-worker render-storyboard -- --input examples/custom-storyboard.json --out out/custom` | Рендерит произвольный `storyboard.v1` из JSON (путь к примеру — от `apps/render-worker`) |
| `pnpm --filter @peertoreel/render-worker render-storyboard -- --input examples/recipe-showcase.json --out out/recipes` | Рендерит showcase из 5 рецептов с локальными subject-SVG |
| `pnpm --filter @peertoreel/worker storyboard:episode -- --topic "…" --slug dog-nose` | M3.5: DeepSeek → storyboard → сцены → FFmpeg-ролик с озвучкой (нужны ключи) |
| `docker build -f infra/render-worker.Dockerfile -t peertoreel-render-worker .` | Собирает образ render worker с закреплённым Chrome |

## Структура

```text
apps/
  api/          NestJS REST API
  web/          Angular dashboard
  worker/       BullMQ worker
  render-worker/ Remotion scene renderer (React только здесь)
packages/
  contracts/    Zod-схемы и общие типы
  db/           Drizzle-схема и database handle
  storage/      S3-совместимое хранилище
  tiktok/       OAuth, шифрование токенов и Content Posting API
infra/          Docker Compose для локальной инфраструктуры
docs/adr/       Architecture Decision Records
apps/api/
  src/db/schema.ts   Drizzle-схема
  drizzle/           сгенерированные SQL-миграции
```

## Render worker

`apps/render-worker` — отдельный Node.js процесс с Remotion: он рендерит сцены
`peertoreel.storyboard.v1` в беззвучные mp4 1080×1920/30 (h264, `yuv420p`, BT.709). React
существует только здесь; финальную сборку, субтитры и QC по-прежнему делает FFmpeg в
`apps/worker`.

```bash
# shortcut для встроенной фикстуры «−15°»
pnpm --filter @peertoreel/render-worker render-fixture
pnpm --filter @peertoreel/render-worker render-fixture -- --scene 0

# любой валидный storyboard.v1 (путь считается от apps/render-worker)
pnpm --filter @peertoreel/render-worker render-storyboard -- --input examples/custom-storyboard.json --out out/custom
pnpm --filter @peertoreel/render-worker render-storyboard -- --input examples/custom-storyboard.json --scene 1 --out out/custom

# showcase рецептов M3.4: hook-hero, fact-object, comparison, process, cta
pnpm --filter @peertoreel/render-worker render-storyboard -- --input examples/recipe-showcase.json --out out/recipes
```

Примеры для рендера: `apps/render-worker/examples/custom-storyboard.json` (low-level
`programmatic`, тема «город теплее загородной зоны») и `examples/recipe-showcase.json`
(пять рецептов M3.4 с предметными SVG). Params каждого компонента описаны в
`packages/contracts/src/storyboard.components.ts`; некорректные значения заменяются дефолтом
**с диагностикой** в логе и манифесте. Неизвестный компонент без реализованного fallback
завершает CLI ошибкой.

**Рецепты — данные, не код.** Каталог (5 рецептов × 2 варианта, слоты, слои, camera hint)
лежит в `packages/contracts/src/storyboard.recipes.ts`; сцена выбирает его через
`implementation: { type: 'recipe', recipeId, variant, slots }`. Слот `subject` принимает только
ключ из `STARTER_ASSET_KEYS`; ключи и теги описаны в `STARTER_ASSET_CATALOG`, файлы — в
`apps/render-worker/public/assets/starter/` (12 плоских SVG без запечённого текста). Слой
`image`/`subject` резолвит их через `staticFile` (`src/assets.ts`) и общий `camera.ts`.

Результат — `apps/render-worker/out/scene-<idx>.mp4`, `render-fixture.json` для shortcut'а
или `manifest.json` для `render-storyboard` (компонент, source, `recipeId`/`variant`, params и
slot diagnostics, длительности и время рендера). Docker-образ:
`infra/render-worker.Dockerfile`.

### Asset Library и resolver (M3.6a)

Стартовый SVG-пак — это Tier 0 библиотеки, а не единственный источник. Контракт и порты
(`AssetRecord`, `AssetVariant`, `AssetLicense`, `AssetRequest`, `AssetResolution`,
`AssetResolver`, `ImageProvider`, typed-ошибки) живут в `packages/contracts/src/assets.ts`,
реализация — в `packages/assets`. ADR — `docs/adr/0017-asset-library-and-resolver.md`.

- **Порядок резолва:** starter → cache (по `key`/тегам) → provider (только при
  `allowProvider: true` и включённом провайдере) → `fallbackKey` → typed error. Одинаковый
  запрос даёт одинаковый результат; без флага провайдер не вызывается.
- **Идентичность байтов:** SHA-256 нормализованных байтов, дедупликация по `contentHash`,
  объектный ключ `assets/<hash[0..1]>/<hash>/<name>` (`buildAssetObjectKey`).
- **Лицензии:** `commercialUse: true` обязателен; `false` отклоняется и в resolver, и
  check-constraint'ом таблицы `assets`.
- **Нормализация:** `normalizeSvg` (svgo, удаление full-bleed `<rect>`, padding viewBox 8%,
  OKLab-квантование `fill`/`stroke` в `style.assetPalette`) и чистые alpha-проверки растра
  (`alphaOccupancy`/`alphaBounds`; декодирование PNG — M3.6b).
- **Стиль:** `studio_flat_2d_v1` в `packages/contracts/src/style.ts` (palette, `assetPalette`,
  typography, effects). Showcase использует его; старые `flat_2d_motion`-входы не меняются.

```bash
# resolver → data URI в Remotion input props (Tier 0, без сети)
pnpm --filter @peertoreel/render-worker render-storyboard -- \
  --input examples/recipe-showcase.json --out out/m3-6a --resolve-assets

# offline fake ImageProvider для ключей вне Tier 0
pnpm --filter @peertoreel/render-worker render-storyboard -- \
  --input examples/recipe-showcase.json --out out/m3-6a --resolve-assets --provider=fake
```

Манифест в этом режиме добавляет `assets.resolutions` (key, tier, cacheHit, contentHash,
objectKey) и `assets.usage`. Renderer получает только `assets: Record<key, { url }>`; компоненты
не ходят в S3/сеть, а неизвестный ключ без подстановки по-прежнему падает.

### Persistence: Postgres + S3 (M3.6a.1)

Библиотека больше не живёт только в памяти: `DrizzleAssetRepository`
(`packages/db/src/assets-repository.ts`) пишет `assets`/`asset_variants`, а байты лежат за
портом `AssetBlobStore` (`packages/assets`) в `S3AssetBlobStore` (`packages/storage`) поверх
`ObjectStorage`. Объектный ключ — `assets/<hash[0..1]>/<hash>/<hash>.<ext>`, `Content-Type`
берётся из варианта. Повторный persist тех же байтов не делает второй `put` и не создаёт строк.
ADR — `docs/adr/0017-asset-library-and-resolver.md` (D10).

Нужны `DATABASE_URL` и `S3_*` (в `.env`); неполный env — ошибка, а не тихий in-memory режим.

```bash
# засеять Tier 0 (12 стартовых SVG), идемпотентно — можно запускать повторно
pnpm --filter @peertoreel/worker assets:import
pnpm --filter @peertoreel/worker assets:import -- --public apps/render-worker/public

# рендер с записью в БД/S3: в props уходят presigned URL (TTL 1 ч)
pnpm --filter @peertoreel/render-worker render-storyboard -- \
  --input examples/recipe-showcase.json --out out/m3-6a-1 --resolve-assets --persist
```

`assets:import` печатает добавленные/уже существующие записи и content hash; второй прогон
пишет `добавлено 0, уже было 12`. В манифесте `--persist` появляется
`assets.persisted: true`, а `objectKey` в `assets.resolutions` — content-addressed.

### M3.5 — эпизод из темы

`apps/worker` содержит spike-скрипт, который проходит путь тема → DeepSeek → `storyboard.v1` →
Remotion-сцены → FFmpeg (озвучка, loudnorm, ASS):

```bash
pnpm --filter @peertoreel/worker storyboard:episode -- \
  --topic "Почему у собак мокрый нос?" --slug dog-nose

# если квота ElevenLabs исчерпана — только для спайка
pnpm --filter @peertoreel/worker storyboard:episode -- \
  --topic "Почему у собак мокрый нос?" --slug dog-nose --tts google
```

Драфт режиссёра (`draft.json`) не содержит таймингов: окна сцен выводятся из реальной
озвучки. Результат — `apps/worker/out/episodes/<slug>/episode.mp4`, `storyboard.json`,
`voiceover.mp3`, `word_timings.json`, `subtitles.ass`, `scenes/` и `manifest.json` (LLM usage,
TTS provider, длительности, ffprobe). `--tts google` — бесплатный fallback только для спайка;
production-стадия voiceover остаётся на ElevenLabs, провайдер фиксируется в манифесте.

### Episode-режим в очередях и UI (M3.5.1)

У run'а есть `mode: 'pipeline' | 'episode'`. Episode-run идёт двумя стадиями:

- `episode_plan` (`DRAFT → SCRIPT_READY`): DeepSeek-драфт, Google TTS, `storyboard_json`,
  Pixabay-картинки только в subject-слоты, `voiceover_mp3`, `word_timings`, `subtitles_ass`,
  `episode_manifest`. Дальше run стоит на гейте сценария.
- `episode_render` (`SCRIPT_READY → REVIEW`): Remotion через subprocess
  `render-storyboard --assets`, concat визуалов, FFmpeg loudnorm + ASS, `draft_mp4`.

UI-сценарий: на странице прогонов включите «Дешёвый эпизод (Google TTS + Pixabay)» и создайте
run. В `DRAFT` нажмите «Сгенерировать эпизод», после `SCRIPT_READY` откроется превью
раскадровки: текст каждой сцены, часть (хук/основная часть/призыв), рецепт и вариант, миниатюра
Pixabay или бейдж «Tier 0». Ошибка загрузки превью не блокирует «Отрендерить эпизод». На
`REVIEW` доступны «Одобрить» и «Вернуться к сценарию»; QC не запускался — это осознанное
исключение прототипа, pipeline-прогон по-прежнему требует пройденный QC.

Картинки берутся из Pixabay: сначала по тегам стартового ключа, если там пусто — по описанию
сцены с `lang: ru`; на слот не больше двух запросов. Если не нашлось ничего пригодного, сцена
остаётся на Tier 0. Нужны `DEEPSEEK_API_KEY` и `PIXABAY_API_KEY`; ElevenLabs в episode-режиме
не вызывается. Повторный запуск переиспользует готовые артефакты и не повторяет
LLM/TTS/Pixabay-вызовы. `render-storyboard --assets <map.json>` — ручной путь проверить
инъекцию картинок без БД: инжектированные URL побеждают Tier 0, остальное резолвится как
раньше (в манифесте `assets.injected`). DeepSeek-генерация ассетов вместо Pixabay — открытый
вопрос, в этот слайс не входит.

## Локальный S3

Для локальной разработки используется SeaweedFS с S3-совместимым API на `http://localhost:8333`. Production использует Cloudflare R2;
код работает через S3 API и не зависит от конкретного локального провайдера. Подробности —
в `docs/adr/0002-local-s3-seaweedfs.md`.

## TikTok (M1.2a/M1.2b)

Нужен аккаунт на [TikTok for Developers](https://developers.tiktok.com/):

1. Создать приложение, добавить **Login Kit** и **Content Posting API**.
2. Запросить scopes `user.info.basic` и `video.publish`.
3. Зарегистрировать redirect URI `http://localhost:3000/api/v1/accounts/tiktok/callback`.
4. Добавить в `.env`:

```bash
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:3000/api/v1/accounts/tiktok/callback
# 32-byte key, generate once and keep stable:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
TOKEN_ENCRYPTION_KEY=...
WEB_APP_URL=http://localhost:4200
```

5. Перезапустить API и открыть `/accounts`, подключить приватный тестовый аккаунт.
6. На run-странице в `SCHEDULED` выбрать приватность (для неaudited приложения — `SELF_ONLY`),
   сохранить карточку и нажать **«Опубликовать в TikTok»**. Прогресс и статус приходят из
   очереди `publish`; после успеха run переходит в `PUBLISHED`.
7. CLI-загрузка остаётся для отладки:

```bash
pnpm --filter @peertoreel/worker tiktok:spike -- --run <runId> --dry-run
pnpm --filter @peertoreel/worker tiktok:spike -- --run <runId>
```

Неaudited приложение не может постить в публичный аккаунт; для публичной публикации нужен
аудит TikTok (M4). Токены хранятся зашифрованными; access живёт ≈2 ч, refresh ≈180 дней и
ротируется при каждом обновлении.

## Ограничения текущего этапа

- `visuals` использует Pixabay: только вертикальные клипы/фото, кеш поиска 24 ч, лимит
  100 запросов/60 с. Если ассет не найден или скачать его не удалось, сцена собирается с
  fallback-фоном `testsrc2` — стадия не падает из-за одной сцены.
- Для реального подбора визуалов нужен `PIXABAY_API_KEY` в `.env`; без него стадия
  завершится понятной ошибкой.
- `qc` проверяет длительность, громкость, синхронизацию, стоп-слова, `is_aigc` и темп речи.
  Отчёт `qc_report` показывается в карточке run'а; «Одобрить» недоступно без отчёта и при
  verdict `fail`. `warn` — advisory.
- **TikTok: подключение, очередь и кнопка есть.** После «Одобрить» run переходит в
  `SCHEDULED` и получает publish card: заголовок, хештеги, приватность, напоминание о
  публикации. Кнопка «Опубликовать в TikTok» сохраняет карточку и ставит job в очередь
  `publish`; прогресс и статус видны в карточке, успех переводит run в `PUBLISHED`. Ручной
  экспорт и ручная отметка остаются как fallback. `is_aigc` всегда `true`.
  Webhooks, rate limiter, выбор аккаунта и автошедулинг — M1.2c.
- `post_id` из TikTok приходит JSON-числом int64 и может терять точность в браузере/БД;
  webhooks в M1.2c вернут строку.
- Нет TikTok app audit: публичная публикация недоступна, только `SELF_ONLY`.
- `topic-discovery` и `research` не автоматизированы: run создаётся с темой вручную.
- Auth-защита есть у `/system` и `/runs`; остальные бизнес-роуты появятся вместе со своими
  таблицами и сразу под `SessionAuthGuard`.
- Нет rate limit на логин и аудита неудачных попыток (запланировано).

Это осознанный срез: production-путь до готового черновика уже работает, QC и ручной
экспорт закрывают публикацию до подключения TikTok (M1.2).

## Troubleshooting

**`does not provide an export named '<schema>'` в консоли web.**

Причина: Vite пре-бандлил `@peertoreel/contracts` в `apps/web/.angular/cache`, а ключ этого
кэша не зависит от содержимого `packages/contracts/dist`. Новый экспорт появлялся в `dist`,
но браузер продолжал получать старый пре-бандл. Постоянное решение уже в репозитории:

- `apps/web/angular.json` → `serve.options.prebundle.exclude: ["@peertoreel/contracts"]`:
  контракты не пре-бандлятся, а собираются в чанки приложения вместе с кодом web. Поэтому
  новый экспорт подхватывается обычной пересборкой, без инвалидации кэша зависимостей.
- `apps/web/package.json` → `zod` объявлен зависимостью web: исключённые контракты
  импортируют `zod`, и Vite резолвит его из корня приложения (в pnpm-изоляции транзитивная
  зависимость оттуда не видна).
- `pnpm dev` запускает `contracts` в watch-режиме (`tsc --watch`), а dev-сервер web
  пересобирается на изменение `packages/contracts/dist` — перезапуск не нужен.

Если кэш всё же испортился (например, после смены версии Angular или зависимостей):

```bash
pnpm --filter @peertoreel/web clean   # удаляет apps/web/.angular/cache
pnpm dev
```

Если в web добавляется ещё один workspace-пакет, добавьте его в `prebundle.exclude` и
объявите его runtime-зависимости в `apps/web/package.json` — иначе вернётся та же ошибка
или `Failed to resolve import`.
