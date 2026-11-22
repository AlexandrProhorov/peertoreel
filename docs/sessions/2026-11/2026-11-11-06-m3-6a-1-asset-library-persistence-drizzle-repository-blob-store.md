## 2026-11-11 — M3.6a.1: Asset Library persistence (Drizzle repository + blob store)

**Статус:** DONE (M3.6b остаётся TODO). Ветка `feat/m3-animated-factory`; изменения не
закоммичены.

**Цель:** сделать библиотеку настоящей: строки в Postgres, байты в S3-совместимом хранилище,
повторный резолв из кэша без провайдера. Реальные Recraft/fal.ai/BiRefNet по-прежнему не
подключаются (M3.6b), ключи не нужны.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.6a) | Требуемое изменение (M3.6a.1) |
| --- | --- | --- |
| `AssetRepository` | Только `InMemoryAssetRepository`; данные живут в процессе | `DrizzleAssetRepository` в `packages/db`: `findByKey`/`findByContentHash`/`listByStyle`/`save` поверх `assets`+`asset_variants`, маппинг в обе стороны, ошибки БД не глотаются |
| `save` | Hash-хит возвращает запись; upsert по `(key, styleId)` не реализован | Транзакция: hash-хит → существующая запись; иначе upsert по `(key, style_id)`, upsert вариантов по `(asset_id, variant_id)`, удаление исчезнувших вариантов; повторный вызов не меняет число строк |
| `id` записи | `buildAssetId` в памяти/резолвере | Тот же `buildAssetId(source, key)` при чтении из БД (в таблице нет колонки `id` записи) |
| Хранилище байтов | Нет: файлы только в `public/assets/starter/`, resolver не делает I/O | Порт `AssetBlobStore` (`put`/`urlFor`/`get`) в `packages/assets`, `InMemoryAssetBlobStore` для тестов, `S3AssetBlobStore` в `packages/storage` поверх `ObjectStorage` |
| Сохранение | Нет | `AssetLibraryService.persist(resolution, bytes, mimeType)`: hash-хит → без `put`/`save`; иначе `put` в content-addressed ключ → `save`; URL варианта — presigned |
| Объектный ключ варианта | Starter: локальный `assets/starter/<file>.svg`; provider: content-addressed | При persist ключ варианта переписывается на `buildAssetObjectKey(contentHash, ext)`, байты и строка не расходятся; `Content-Type` — из `mimeType` |
| Засев Tier 0 | Вручную ничего: starter-записи строятся в памяти на каждый запуск | `assets:import` в `apps/worker`: `--public <dir>` (default `apps/render-worker/public`), идемпотентная запись 12 стартовых SVG в БД + S3, сводка added/existing/hash |
| Renderer CLI | `--resolve-assets [--provider=fake]` → data URI в props | + `--persist` (только с `--resolve-assets`): repository + blob store из env, Tier 0 — байты из `public/`, provider — из data URI; в props идёт presigned URL; манифест `assets.persisted` |
| Env | Renderer не знает про БД/S3 | `--persist` требует `DATABASE_URL` и `S3_*`; неполный env → понятная ошибка и exit 1, без тихого in-memory отката |
| Без `--persist` | M3.6a поведение | Не меняется: тот же in-memory резолв и data URI |
| Тесты | In-memory resolver, без БД/сети | Unit: маппинг/merge без БД, blob-store проксирование, library-service идемпотентен; integration (Testcontainers Postgres) — round-trip, idempotent save, hash-hit, `listByStyle`, удаление варианта |
| Документы | README/ROADMAP/ADR-0017 без persistence | README (import/persist/env), ROADMAP M3.6a.1 DONE + alias key→hash как предусловие M3.6b, ADR-0017 D10, SESSION_LOG |

### Что изменено

- `packages/db/src/assets-repository.ts` — `DrizzleAssetRepository`: `findByKey`,
  `findByContentHash`, `listByStyle`, транзакционный `save` (upsert `assets` по
  `(key, style_id)`, upsert вариантов по `(asset_id, variant_id)`, удаление исчезнувших
  вариантов). Чистые `assetRowValues`/`assetVariantRowValues`/`toAssetRecord`; `id`
  восстанавливается через `buildAssetId(source, key)`; невалидная строка или нарушение
  constraint'а падают с ключом ассета, а не деградируют в fallback. Импорт порта — только
  `import type` из `@peertoreel/assets`; `@peertoreel/contracts` переведён в `dependencies`.
- `packages/db/src/assets-repository.spec.ts` — маппинг/merge без БД (license, attribution,
  порядок вариантов, invalid row, пустой variants).
- `packages/db/src/assets-repository.integration.spec.ts` — Testcontainers Postgres
  (`postgres:18-alpine`) + `drizzle-kit` migrator: round-trip, идемпотентный save, hash-hit,
  `listByStyle`, удаление устаревшего варианта, unique `content_hash`, check `commercial_use`.
  Без Docker `describe.skipIf` пропускает файл.
- `packages/assets/src/blob-store.ts` — порт `AssetBlobStore` (`put`/`urlFor`/`get`/`exists`) и
  `InMemoryAssetBlobStore` (`putCount`, `objectKeys`).
- `packages/assets/src/library-service.ts` — `AssetLibraryService`: `persist` (проверка hash
  байтов, нормализация ключей вариантов в `buildAssetObjectKey`, hash-hit без `put`/`save`,
  presigned URL в `variants[*].url`), `withUrls` (проверяет ключ и наличие объекта у каждого
  варианта), `resolveAndPersist(request, readBytes)`. Строка под неконтент-адресуемым ключом —
  явная ошибка.
- `packages/assets/src/resolver.ts` — провайдерская ветка возвращает только что сгенерированную
  запись (с data URI), а не echo из репозитория: в БД нет колонки `url`, и байты иначе терялись.
- `packages/assets/src/library-service.spec.ts` — один `put` на hash, идемпотентность, URL из
  blob store, provider → cache без второго вызова провайдера, отказ при несовпадении байтов.
- `packages/storage/src/storage.ts` — аддитивный `ObjectStorage.objectExists` (HEAD; 404 →
  `false`, остальные ошибки пробрасываются).
- `packages/storage/src/asset-blob-store.ts` — `S3AssetBlobStore` поверх
  `putObject`/`presignGet`/`getObject`/`objectExists`; TTL по умолчанию 1 ч.
- `packages/storage/src/asset-persistence-env.ts` — одна Zod-схема env (`DATABASE_URL` + `S3_*`)
  и `parseAssetPersistenceEnv` для `assets:import` и `--persist`.
- `apps/worker/src/assets/import-runner.ts` — `runAssetImport` (правила засева без env/файлов) и
  его unit-тест; `apps/worker/src/assets/import.ts` + script `assets:import` — чтение
  `apps/render-worker/public` (`--public <dir>` от корня репо), сводка added/existing/hash.
  `DATABASE_URL`/`S3_*` обязательны, иначе ошибка.
- `apps/render-worker/src/asset-persistence.ts` — env-схема (Zod) и сборка
  `DrizzleAssetRepository` + `S3AssetBlobStore` + `AssetLibraryService`; `close()` закрывает pool.
- `apps/render-worker/src/asset-resolution.ts` — необязательный `persistence`:
  Tier 0 читает байты из `public/`, provider — из data URI, кэш — проверяет объект через
  `exists`; в props уходит presigned URL, в результате `persisted: boolean`.
- `apps/render-worker/src/cli.ts` — `--persist` (только с `--resolve-assets`), загрузка `.env`
  из корня, `finally` с закрытием pool, манифест `assets.persisted`.
- Зависимости: `packages/db` → `@peertoreel/contracts` (runtime), `@peertoreel/assets` (dev,
  type-only) и `testcontainers`/`@testcontainers/postgresql`; `packages/storage` →
  `@peertoreel/assets` (dev, type-only) и `zod`; `apps/worker` → `@peertoreel/assets`;
  `apps/render-worker` → `@peertoreel/db`, `@peertoreel/storage`, `dotenv`.
- Документы: README (раздел Persistence), ROADMAP (M3.6a.1 DONE + итог), ADR-0017 (D10,
  уточнён D9/Consequences), `apps/worker/AGENTS.md` (засев только через библиотеку),
  `apps/render-worker/AGENTS.md` (persistence — только на CLI-границе).

### Проверено

- `pnpm check` — зелёный (exit 0): contracts **154**, assets **60**, db **17** (включая 6
  Testcontainers-тестов), storage **9**, render-worker **103**, worker **121**, api 64, tiktok 28,
  web 124 — всего **680** тестов (+31 к M3.6a). Unit-тесты не поднимают Chrome, не ходят в
  сеть; integration-файл использует Testcontainers и пропускается без Docker.
- **Инфраструктура поднята:** Docker 29.9.2, Postgres/Redis/SeaweedFS healthy, миграции
  применены (схема `0008` уже содержала `assets`/`asset_variants`, новая миграция не понадобилась).
- `assets:import` первый прогон: **12 добавлено**, 12 `assets` / 12 `asset_variants` в БД, все
  `object_key` — `assets/<hh>/<hash>/<hash>.svg`, `mime_type image/svg+xml`, 256×256.
  Второй прогон: `добавлено 0, уже было 12` — ни строк, ни повторных загрузок.
- Presigned URL (dog-snout): HTTP **200**, `Content-Type: image/svg+xml`, 965 байт, SHA-256
  скачанных байтов **совпадает** с `content_hash`; `objectExists` → `true` для существующего
  ключа и `false` для отсутствующего (HEAD, без 500).
- `render-storyboard --resolve-assets --persist` (showcase): 5 сцен за **80.0 с**, резолв
  `dog-snout`/`scent-wave` → `tier: starter`, манифест `assets.persisted: true`,
  `objectKey` content-addressed. `ffprobe` всех клипов: h264, 1080×1920, 30/1, `yuv420p`,
  `bt709`/`bt709`/`bt709` — формат не изменился.
- **Provider + `--persist` (после фикса блокера):** отдельный storyboard из 3 сцен с
  `subject/robot` (ключа нет в Tier 0) прогнан через настоящий CLI с `--provider=fake --persist`.
  Первый прогон: `tier: provider`, `providerRequests: 1`, `costUsd: 0`, манифест
  `persisted: true`; скачанные по presigned URL байты — 283 байта SVG, SHA-256 совпадает с
  `content_hash` (раньше здесь загружался пустой объект). Второй прогон того же входа:
  `tier: cache`, `cacheHit: true`, `providerRequests: 0`, `costUsd: null` — провайдер не вызван.
  Тестовая строка и объект удалены, в БД снова 12 записей.
- Ошибки CLI: `--persist` без `--resolve-assets` → сообщение и exit 1. Неполный env
  валидируется `parseAssetPersistenceEnv` (unit-тест перечисляет отсутствующие переменные);
  тихого in-memory отката нет.

### Не проверено / ограничения

- **Живой R2 не проверялся** — только локальный SeaweedFS. Прод-бакет и его CORS/домен —
  отдельная проверка.
- **Реальные платные провайдеры** (Recraft/FLUX.2/BiRefNet) по-прежнему не вызывались: ключей
  нет, это M3.6b. Persistence проверен на Tier 0 и fake provider.
- **Data-URI fallback при исчерпанном presigned TTL не реализован:** TTL 1 ч, рендер шёл 80 с.
  Если рендер когда-нибудь превысит TTL, URL нужно перевыпускать до старта, а не полагаться на
  data URI; это осознанное решение, не дефолт.
- **Content-Type для PNG/WebP** не проверялся живым объектом (растр — M3.6b); живой SVG отдаёт
  `image/svg+xml`.
- **Alias key→hash** остаётся не реализованным: hash-хит возвращает запись-владельца, новый
  ключ не становится адресуемым. Это предусловие M3.6b до подключения платного провайдера.
- **Hash-хит не обновляет metadata.** Повторный `assets:import` после правки тегов/лицензии в
  каталоге вернёт существующую строку как есть (по плану hash-хит = dedup, а не upsert
  метаданных). Изменённые теги применятся только после удаления строки; отдельный
  metadata-refresh можно добавить в M3.6b.
- **Persist рассчитан на один набор байтов на запись:** варианты должны делить hash записи.
  Отдельные байты для `outline`-варианта требуют явного API (M3.6b), сейчас это ошибка.
- **Docker-образ render-worker** не пересобирался (код образа не менялся).
- **Стоимость:** реальных расходов нет (`costUsd: null` у Tier 0; fake provider — 0).

### Review-фиксы (после read-only reviewer-прохода)

- **Блокер: провайдерские байты терялись.** Резолвер писал строку в БД и возвращал её echo без
  `url` (в таблице нет колонки URL), поэтому `--persist --provider=fake` не мог достать data URI,
  падал на `exists` и оставлял «отравленную» строку; `AssetLibraryService` при этом мог загрузить
  пустой объект (не было проверки хэша). Исправлено: резолвер возвращает только что
  сгенерированную запись (data URI сохраняется), `ensureBytes` проверяет SHA-256 присланных
  байтов до `put`, добавлен тест с репозиторием, который отбрасывает URL (как Drizzle), и живой
  прогон CLI `--provider=fake --persist`.
- **`withUrls` больше не подписывает непроверенное:** каждый вариант должен иметь
  контент-адресуемый ключ и существующий объект, иначе явная ошибка (ADR D10).
- **DB-адаптер:** `save` отвергает неканонический `id` и пустой список вариантов; сообщения об
  ошибках — на английском, как в остальном пакете.
- **`ObjectStorage.objectExists`:** `isNotFoundError` экспортирован и покрыт тестом (404/
  `NotFound`/`NoSuchKey` → `false`, 403/сеть → проброс).
- **Интеграционный тест:** `beforeEach` очищает `assets` (варианты каскадом), поэтому кейсы не
  зависят от порядка и не проверяют глобальные счётчики.
- **`assets:import` стал тестируемым:** правила вынесены в `runAssetImport`
  (`apps/worker/src/assets/import-runner.ts`), CLI отвечает только за env/файлы/stdout.
  Unit-тест: первый прогон 12 added и 12 `put`, второй — 0 added, 12 existing, `putCount` не растёт.
- **Один env-контракт:** `parseAssetPersistenceEnv` (+ Zod-схема) переехал в
  `packages/storage`; `assets:import` и `--persist` валидируют одинаково.
- **Границы:** boundary-тест render-worker теперь запрещает в core path также
  `@peertoreel/db`/`@peertoreel/storage`; тест второго прогона считает `save` через
  `CountingRepository`, а не только `putCount`.
- **Утечка pool:** `--persist` строит `ObjectStorage` до `createDatabase`, поэтому падение
  конструктора хранилища не оставляет открытый pool.
- **ADR/теория поправлены:** резолвер действительно пишет строку провайдера до загрузки байтов;
  persist это чинит (`exists` → `put`), а не «всегда пишет байты первыми».

### Теория сессии

- **Порядок записи зависит от того, кто владеет решением.** Import пишет байты первым, а
  провайдерская ветка резолвера — сначала строку (это часть контракта M3.6a). Поэтому
  persistence обязан «долечить» отсутствующий объект, а рендер — отказаться подписывать строку
  без байтов; иначе порядок превращается в скрытый 404.
- **Эфемерные поля не переживают round-trip.** `url` — не данные: адаптер его не возвращает.
  Код, который рассчитывает получить data URI обратно из репозитория, ломается только на
  настоящей БД и только на провайдерской ветке; поэтому fake, отбрасывающий URL, полезнее fake,
  который его сохраняет.
- **Хэш — единственный идентификатор загрузки.** `findByContentHash` + `exists` превращают
  повторный импорт в чтение: ни второго объекта, ни второй строки. Логический ключ — это
  метаданные, а не адрес файла.
- **Content-addressed ключ делает аплоад идемпотентным.** Тот же хэш всегда даёт тот же ключ,
  поэтому повторный `put` физически не создаёт копию; `exists` нужен только чтобы не платить за
  лишний запрос.
- **Транзакция — граница согласованности строк, но не объектов.** Postgres гарантирует
  атомарность `assets`+`asset_variants`; S3 — только идемпотентность content-addressed ключа.
  Согласованность между ними даёт не порядок «объект→строка» сам по себе, а проверка
  `exists` + хэш на каждом persist и явная ошибка на рендере.
- **Два unique-констрейнта — две разные политики.** `(key, style_id)` — «одна логическая
  запись на стиль», `content_hash` — «одни байты живут один раз». Hash-хит имеет приоритет;
  конфликт между ними (новый ключ с чужим хэшем) должен падать, а не перезаписывать владельца.
- **Presigned URL — производное значение, а не данные.** В БД нет колонки `url`: TTL-ссылка
  живёт в props/манифесте, а хранится только ключ. Поэтому «второй resolve» дёшев — это
  переподпись, а не повторный резолв.
- **Порт отделяет библиотеку от S3.** `packages/assets` знает только `put/urlFor/get/exists`;
  Drizzle и AWS SDK остаются в `db`/`storage`, а `import type` не тянет рантайм-зависимость.
- **Тестовая инфраструктура — часть проверки.** Unit-тесты на in-memory fake доказывают логику,
  но уникальные индексы и check-constraint'ы существуют только в Postgres, поэтому интеграционный
  тест идёт через Testcontainers, а не через «поверим в миграцию».
- **Идемпотентность проверяется счётчиками, а не глазами.** «Добавлено 12 → 0», 12 строк в БД,
  один `put` на hash и неизменное число `save` — это наблюдаемые числа, которые можно сравнить
  между прогонами.

### Следующая сессия

M3.6b — реальные `ImageProvider`-адаптеры (Recraft Vector, FLUX.2 `[klein]`/`[pro]` + BiRefNet
v2) поверх уже работающей библиотеки, alias key→hash до первого платного вызова, raster-cutout
нормализация с PNG decode, `cartoon-character`, третья тема и полный acceptance M3.6.

