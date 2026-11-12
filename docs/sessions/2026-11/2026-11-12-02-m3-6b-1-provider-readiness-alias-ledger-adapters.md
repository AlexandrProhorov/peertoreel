## 2026-11-12 — M3.6b.1: provider readiness — alias key→hash, ledger, адаптеры без платных вызовов

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-11-m3-6b-1-provider-readiness-session.md`

## Цель

Сделать библиотеку ассетов готовой к платному провайдеру без единого платного вызова:
alias `key → hash`, metadata-refresh, ledger `provider_usage`, Tier 0 в палитре
`studio_flat_2d_v1`, скелеты Recraft/FLUX.2 с оффлайн-тестами.

## Что изменилось (было → стало)

| Область | Было | Стало |
| --- | --- | --- |
| Hash-хит под другим ключом | возвращал запись-владельца, ключ не адресуем | `asset_aliases (key, style_id, content_hash)`; resolve → `tier: cache`, `providerRequests: 0` |
| Повторный импорт | metadata не обновлялась | refresh `tags`/`license`/`metadata` только при реальном изменении; иначе ни одной записи |
| Расходы | только `AssetUsage` в ответе | append-only `provider_usage` в момент `generate`, `cost_usd` nullable |
| Tier 0 | 12 SVG вне палитры, хранились как есть | нормализованы в `studio_flat_2d_v1.assetPalette`, хранятся нормализованными |
| Провайдеры | только fake в `packages/assets` | `packages/providers`: recraft (SVG) + flux (raster), `enabled` из ключа, fake HTTP |

## Изменённые файлы

- `packages/contracts/src/assets.ts` — `AssetAlias`, `ProviderUsageEntry`, `palette` в
  `ImageProviderRequest`, `units` в `ImageProviderResult`.
- `packages/db/src/schema.ts` + `0010_powerful_wong.sql` — `asset_aliases`, `provider_usage`.
- `packages/db/src/assets-repository.ts` — `findByAlias`/`saveAlias`.
- `packages/db/src/provider-usage-writer.ts` — `DrizzleProviderUsageWriter`.
- `packages/assets/src/{repository,resolver,library-service,provider-usage}.ts` — alias-шаг,
  metadata-refresh, порт и декоратор леджера.
- `packages/providers/**` — новый пакет, чистые мапперы, фикстуры, тесты.
- `apps/render-worker` — writer в `--persist`, `recordingImageProvider` вокруг fake,
  палитра в спеке стартовых иконок; 12 SVG перезаписаны нормализованными.
- `docs/adr/0017-...` (D3/D5/D11), `ROADMAP.md`, `README.md`, `SESSION_LOG.md`,
  `docs/state/current.md`.

## Решения

- Alias — отдельная таблица без FK: удалённые байты дают `null`, а не ghost-запись.
- Metadata-refresh сравнивает канонический JSON и набор тегов: идентичный re-import не пишет.
- Леджер — декоратор провайдера, а не код резолвера: `costUsd` копируется, не считается.
- Порт `ProviderUsageWriter` в `packages/assets`, реализация в `packages/db`.

## Проверено

- `pnpm check` зелёный: 767 тестов, 105 файлов (contracts 164, assets 67, providers 10,
  tiktok 30, web 140, db 21, storage 9, render-worker 107, worker 145, api 74).
- Живой прогон на Postgres+SeaweedFS: alias → `cache`, `providerRequests: 0`, одна alias-строка,
  `assets`/`asset_variants` остались 12/12; правка `tags` обновила запись без новых строк;
  один вызов fake → одна строка `provider_usage` с `cost_usd = 0` (после проверки строки удалены).
- `assets:import` дважды: `добавлено 12` → `добавлено 0, уже было 12`; `object_key` сменились.
- Showcase: 5 сцен, 79.5 с, `assets.persisted: true`; `ffprobe` 1080×1920/30, h264, `yuv420p`,
  BT.709.

## Не проверено

- Реальные Recraft/fal.ai/BiRefNet вызовы — нет ключей, M3.6b.2.
- Живой R2 (только SeaweedFS), визуальный review перекрашенных иконок.

## Сироты S3 (не удалялись)

`assets/87/87cfe2a4…`, `52/52674f99…`, `b5/b50c3d9b…`, `6e/6ea0f5a6…`, `d8/d8cc78c3…`,
`f3/f3dabf3f…`, `2b/2bdf066b…`, `fb/fb6857b6…`, `93/93dc4421…`, `43/43ff74d1…`,
`37/3746405f…`, `f6/f6bf72fa…` (полные ключи в выводе импорта до нормализации).

## Отклонения от плана

- Миграция — `0010`, а не `0009`: `0009` уже занята episode-миграцией (`0008` — assets).
- Ledger включён в render-worker CLI (`--persist`), а не в `apps/worker`: единственный вызов
  провайдера сегодня там; worker провайдера не вызывает.
- Root `AGENTS.md` §2 обновлён отдельным коммитом после M3.6b.1 (в середине сессии не правился).

## Блокеры и следующий шаг

- M3.6b.2: `RECRAFT_API_KEY`/`FAL_KEY`, сетевой доступ, бюджет, PNG decode (`sharp`/`pngjs`),
  пост-проверка «нет текста» и визуальный review.
