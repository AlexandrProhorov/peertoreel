## 2026-11-11 — M3.6a: Asset Library core, Resolver и style preset

**Статус:** DONE (M3.6b остаётся TODO). Ветка `feat/m3-animated-factory`; изменения не
закоммичены.

**Цель:** сделать стартовый пак одним из источников библиотеки, а не единственным: metadata и
content hash, DB-схема, детерминированный `AssetResolver` (Tier 0 → кэш → fake provider →
fallback → typed error), лицензионный guard, чистая SVG-нормализация с OKLab-квантованием
палитры, `studio_flat_2d_v1` и передача resolved asset URL в renderer через input props.
Реальные Recraft/fal.ai/BiRefNet-вызовы в этой сессии не выполняются (нет ключей) — это M3.6b.

### Таблица «текущее поведение → требуемое изменение» (до правок)

| Область | Текущее поведение (M3.5) | Требуемое изменение (M3.6a) |
| --- | --- | --- |
| Модель ассета | 12 SVG + `STARTER_ASSET_CATALOG` (path/tags/license `'authored'`) в contracts | `AssetRecord`/`AssetVariant`/`AssetLicense`/`AssetSource`/`AssetKind` в `contracts/src/assets.ts`; starter — один из `AssetSource`, а не единственный источник |
| Хранение | Ничего: только файлы в `public/assets/starter/` | Таблицы `assets`/`asset_variants` (unique content hash, `commercial_use` check), миграция, content-addressed ключ `assets/<hash[0..1]>/<hash>/<name>` |
| Resolver | `SubjectLayer` берёт путь из каталога напрямую | `TieredAssetResolver`: starter → cache (key/tags) → provider (только `allowProvider`) → `fallbackKey` → typed error; одинаковый запрос → одинаковый результат |
| Дедупликация | По логическому ключу каталога | SHA-256 байтов; одинаковые байты → один record/variant, `cacheHit: true` |
| Лицензии | Поле `'authored'` в каталоге, проверок нет | `commercialUse: true` обязателен (DB check + `AssetLicenseError`); starter проходит |
| Нормализация SVG | Нет: внешний SVG рендерился бы как есть | `svgo` cleanup, удаление full-bleed `<rect>`, padding viewBox 8%, OKLab-квантование fill/stroke/stop-color в `assetPalette`; чистая функция без DOM |
| Растр | Нет | Чистые `alphaOccupancy`/`alphaBounds` над RGBA; декодирование PNG/trim/стикер — M3.6b (явный `UnsupportedAssetKindError`) |
| Провайдер | Нет | Порт `ImageProvider` в contracts + `createFakeImageProvider` (локальные SVG, usage, нулевые реальные расходы) |
| Стиль | `style.palette` в каждом JSON, `assetPalette` отсутствует | `STYLE_PRESETS`/`studio_flat_2d_v1` (palette + assetPalette + typography + effects); optional `assetPalette` в `storyboardStyleSchema`; showcase на пресете |
| Input props renderer | `{ scene, style, resolved, wordTimings? }` | + `assets?: Record<string, { url: string }>`; компонент не ходит в сеть |
| `SubjectLayer` | Всегда `resolveAssetKey(assetKey)` + `assetUrl` | Сначала `assets[assetKey].url`, иначе прежний локальный путь; неизвестный ключ без injection — ошибка |
| CLI | `render-storyboard --input/--scene/--out` | + `--resolve-assets [--provider=fake]`: resolver → data URI в input props; манифест фиксирует tier/usage |
| Манифест | componentId/source/recipe/param+slot diagnostics | + сводка resolved assets (key, tier, cacheHit, contentHash) и usage |
| Storage | `buildArtifactKey` | + `buildAssetObjectKey` (аддитивно, тот же формат, что у resolver/DB) |
| Тесты | starter SVG existence/text-free, assets key classifier | + hash/dedup, порядок resolver, license guard, fallback, no-network, OKLab на фиксированных цветах, SVG-нормализация, style preset, `assets` input props |
| Документы | ADR-0012…0016, ROADMAP M3.6 TODO | ADR-0017; ROADMAP M3.6a DONE / M3.6b TODO; README asset library |

### Что изменено

- `docs/adr/0017-asset-library-and-resolver.md` — D1–D9: контракт/порты в contracts,
  реализация в `packages/assets`, метаданные и таблицы, content hash как идентичность байтов,
  фиксированный порядок resolver, обязательная нормализация, input props renderer-а, preset как
  данные, лицензионная политика, граница M3.6a/M3.6b.
- `packages/contracts/src/assets.ts` — `AssetKind`/`AssetSource`/`AssetLicense`/`AssetVariant`/
  `AssetRecord`/`AssetRequest`/`AssetResolution`/`AssetUsage`, `AssetResolver` и `ImageProvider`,
  typed-ошибки, `parseAssetRequest`, `buildAssetObjectKey`.
- `packages/contracts/src/style.ts` — `STYLE_PRESETS` + `studio_flat_2d_v1` (palette,
  `assetPalette`, typography, effects); `STORYBOARD_STYLE_IDS` расширен аддитивно;
  `storyboardStyleSchema` получил optional `assetPalette`.
- `packages/db/src/schema.ts` — `assets`/`asset_variants` (unique `(key, style_id)`, unique
  `content_hash`, check `commercial_use = true`, GIN по тегам) + миграция
  `apps/api/drizzle/0008_outstanding_toro.sql`, сгенерированная drizzle-kit.
- `packages/storage/src/storage.ts` — `buildAssetObjectKey` (тонкая обёртка над контрактом, без
  изменения существующего API).
- `packages/assets` (новый пакет, svgo 4.1.0):
  - `content-hash.ts` — SHA-256 строк/байтов (идентичность нормализованных байтов);
  - `repository.ts` — `AssetRepository` + `InMemoryAssetRepository` (dedup по hash, clone);
  - `starter.ts` — Tier 0 строится из `STARTER_ASSET_CATALOG` и реальных байтов;
  - `resolver.ts` — `TieredAssetResolver`: starter → cache (key/tags) → provider (только
    `allowProvider`) → fallback → typed error; фильтрация по `kind`; лицензионный guard;
  - `normalize-svg.ts` — svgo, удаление full-bleed `<rect>` до оптимизации (svgo превращает
    rect в path), padding viewBox 8%, OKLab-квантование fill/stroke/stop-color;
  - `oklab.ts` — sRGB↔OKLab, ближайший слот палитры, детерминированный tie-break;
  - `normalize-raster.ts` — чистые `alphaOccupancy`/`alphaBounds`/`validateCutoutAlpha`;
  - `provider-fake.ts` — offline `ImageProvider` с детерминированным synthetic SVG и usage;
  - `style.ts` — `buildStoryboardStyle`/`applyStylePreset`/`assetPaletteFor`.
- `apps/render-worker`:
  - `props.ts` — `assets?: Record<string, { url }>` в input props;
  - `assets.ts` — `subjectAssetSource`: injected URL → локальный ключ → typed error;
  - `SubjectLayer`/`RecipeLayers`/`SceneObjects`/`SceneComposition`/`render.ts` — прокидывают
    `assets`, компоненты не ходят в сеть;
  - `asset-resolution.ts` — CLI-мост resolver → data URI; `cli.ts` — `--resolve-assets`,
    `--provider=fake|none`, манифест `assets.resolutions`/`assets.usage`;
  - `examples/recipe-showcase.json` переведён на `studio_flat_2d_v1` + `assetPalette`.
- README (раздел Asset Library), ROADMAP (M3.6a DONE, M3.6b TODO, acceptance),
  ADR-0012 (раздел M3.6a), `apps/render-worker/AGENTS.md`, `apps/worker/AGENTS.md`, корневой
  `AGENTS.md` (§3 ADR-0017, §5 таблицы, §9 тесты), `SESSION_LOG.md`.

### Проверено

- `pnpm check` — зелёный (exit 0): contracts **154** теста, assets **50**,
  render-worker **102**, worker 119, web 124, api 64, storage 3, db 5, tiktok 28 (всего **649**).
  Тесты не запускают Chrome, `renderMedia` и не ходят в сеть.
- Showcase с `--resolve-assets`: 5 сцен за **79.5 с**; резолвлены `dog-snout` и `scent-wave`
  как `tier: starter`, `cacheHit: false`, SHA-256 совпадает с реальными файлами; usage
  `provider: null, providerRequests: 0, cacheHits: 0, costUsd: null`. В манифесте появился блок
  `assets`. После review-фиксов сцена 0 повторно отрендерена (**20.6 с**) с тем же резолвом.
- `ffprobe` всех 5 клипов showcase: `h264`, 1080×1920, 30/1, `yuv420p`, `bt709`/`bt709`/`bt709` —
  формат не изменился.
- Регрессия входов: fixture (6 сцен, **137.1 с**) и `examples/custom-storyboard.json`
  (4 сцены, **78.2 с**) рендерятся без `--resolve-assets`, как раньше.
- Resolver: starter hit, tag match, cache hit, provider generation + нормализация + dedup,
  fallback, no-network при `allowProvider: false`, отказ `commercialUse: false` (starter и
  provider), `UnsupportedAssetKindError` для png, детерминизм одинаковых запросов.
- M3.5 storyboards резолвятся: `dog-nose` (7 сцен) — `dog-snout`, `scent-wave`, `thermometer`;
  `brick-house` (6 сцен) — `brick-wall`, `brick`; все `tier: starter`, без сети.
- Нормализация: удалён full-bleed rect, геометрия (`cx/cy/r`) не изменилась, viewBox
  `0 0 100 100` → `-8 -8 116 116`, все fill/stroke попадают в `assetPalette`,
  `maxColorDistance < 0.01` на тестовых цветах.
- **Инфраструктура поднялась** (вопреки ожиданию): `docker info` доступен, Postgres/Redis/
  SeaweedFS healthy. `pnpm db:migrate` применил `0008`; живыми INSERT'ами проверены unique
  `assets_content_hash_unique` и check `assets_commercial_use_true` (оба отклонили плохие
  строки), тестовые строки удалены.

### Review-фиксы (после read-only reviewer-прохода)

- **Resolver:** неподдерживаемый `kind` теперь skip, а не abort — `fallbackKey` всё ещё
  применяется; в typed-ошибки добавлен `InvalidAssetError`, чтобы `InvalidSvgError` от
  провайдера не утекал после оплаченного вызова; tie-break по тегам и сортировка замен
  переведены на code-unit сравнение (без `localeCompare`); `request.assetPalette` теперь
  реально используется; `AssetRecord.id` строится через `buildAssetId(source, key)`.
- **Object key:** `buildAssetObjectKey(hash, ext)` — имя файла снова чистая функция хэша
  (`<hash>.<ext>`), один blob не может получить два ключа.
- **Нормализация:** full-bleed rect больше не удаляется внутри
  `<defs>/<clipPath>/<mask>/<pattern>/<symbol>/<marker>`; полностью прозрачные `#RRGGBB00`
  не квантуются (иначе скрытая геометрия становилась видимой); `readSvgViewBox` отдаёт реальные
  размеры, поэтому `asset_variants.width/height` стартовых SVG — 256, а не выдуманные 1024.
- **Renderer CLI:** `--provider` валидируется всегда; `tier` типизирован
  `AssetResolutionTier`; `costUsd` не превращается в 0, если хотя бы один резолв не измерен;
  boundary-тест запрещает импорт `@peertoreel/assets`/`asset-resolution` из core render path.
- **Данные:** Tier 0 явно объявлен единственным исключением «нормализация перед хранением»
  (author-файлы хранятся как есть); выравнивание их палитры под `studio_flat_2d_v1` вынесено в
  M3.6b.
- **Осознанно не меняли:** alias-строки key→hash (hash-хит возвращает запись-владельца;
  документировано в ADR-0017 D3 и вынесено в M3.6b до подключения платного провайдера);
  unique `content_hash` оставлен глобальным (нормализация палитро-зависима, поэтому
  межстилевые коллизии возможны только у style-independent байтов); `mime_type` остаётся
  `text` (read-path валидирует контракт); named/rgb-цвета не конвертируются — нормализатор
  ограничен hex-выходом наших провайдеров, это записано в ADR.

### Не проверено / ограничения

- **Реальные платные вызовы не выполнялись:** `RECRAFT_API_KEY`/`FAL_KEY` отсутствуют.
  Recraft V4/V4.1, FLUX.2 и BiRefNet — только контракт `ImageProvider` и fake; выдавать их за
  проверенные нельзя.
- **Raster-cutout:** декодирование PNG, trim/центрирование и стикер-контур не реализованы;
  M3.6a даёт только чистые alpha-функции и `UnsupportedAssetKindError` для `raster-cutout`.
- **`cartoon-character`, третья тема** и полный acceptance M3.6 — M3.6b.
- **R2/Postgres adapter:** таблицы и миграция есть, БД-проверки выполнены, но `AssetRepository`
  в M3.6a только in-memory; запись в R2 и чтение из БД — M3.6b.
- **Docker-образ render-worker** не пересобирался (код образа не менялся).
- **Пиксельный паритет** старого showcase с новым пресетом не сравнивался: смена палитры —
  осознанное изменение кадров; проверены формат, длительности и отсутствие регрессии входов.
- **Стоимость:** реальных расходов нет (fake provider, `costUsd: 0`); ledger — M3.7.

### Теория сессии

- **Библиотека начинается с идентичности байтов.** SHA-256 нормализованных байтов — это и ключ
  дедупликации, и путь в объектном хранилище; «одинаковый ассет под двумя именами» физически не
  создаёт вторую копию.
- **Порядок resolver — это политика стоимости.** Сначала бесплатный Tier 0, потом кэш, и только
  при явном `allowProvider` — провайдер. Флаг по умолчанию `false` превращает «забыли выключить
  генерацию» из счёта в ноль.
- **Fallback — данные, а не catch-блок.** `fallbackKey` проверяется тем же кодом, что и основной
  ключ, поэтому лицензия и kind проверяются и на запасном пути.
- **Лицензия — инвариант, а не поле.** `commercialUse: false` отклоняется resolver-ом и
  check-constraint'ом БД: два независимых барьера на одну ошибку.
- **Нормализация — чистая функция.** svgo + OKLab не знают про React, файлы и сеть; поэтому
  палитру можно проверить на фиксированных цветах обычным unit-тестом.
- **OKLab важнее RGB.** Евклидово расстояние в RGB врёт на тёмных и жёлтых оттенках; OKLab даёт
  «ближайший слот, который выбрал бы иллюстратор».
- **Порядок шагов SVG-нормализации значим.** Full-bleed rect удаляется до svgo, потому что
  оптимизатор превращает `<rect>` в `<path>` и фон становится неотличим от геометрии.
- **Renderer не резолвит.** Он получает `assets: Record<key, { url }>`; резолвер, БД и S3
  остаются снаружи, а локальный ключ — только совместимый fallback для M3.3–M3.5.
- **Style preset — данные.** `studio_flat_2d_v1` даёт palette/assetPalette/typography, поэтому
  showcase и будущие темы не копируют цвета по файлам.
- **Честная граница milestone.** Инфраструктура и контракты без реальных провайдеров — это
  M3.6a; «M3.6 DONE» без Recraft/fal.ai/BiRefNet было бы ложью.

### Следующая сессия

M3.6b — реальные `ImageProvider`-адаптеры (Recraft Vector, FLUX.2 `[klein]`/`[pro]` + BiRefNet
v2), raster-cutout нормализация с PNG decode, `Variant`-версии в БД/R2, `cartoon-character` rig,
третья тема и полный acceptance M3.6.

---

