# 2026-11-14 — M3.6b.6: raster-cutout (PNG-пайплайн)

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-m3-6b-6-raster-cutout-session.md`

## Цель

Закрыть разрыв между flux/`ImageProvider` (base64-PNG) и резолвером: декодировать PNG,
применить alpha-политику, обрезать прозрачные поля, сохранить как `png`/`raster-cutout` с
content hash и отдать рендереру data URI.

## Результат

- `packages/assets/src/raster-pipeline.ts` (новый): `decodePng` (8-bit truecolour, RGBA),
  `trimToAlpha` (alpha bounds, пустое изображение — ошибка), `encodePng`. Индексные и 16-bit
  PNG отклоняются typed-ошибкой.
- `TieredAssetResolver.generate` ветвится по `result.asset.encoding`: SVG-путь без изменений,
  `base64` → `storeRaster`. `raster-cutout` проходит `validateCutoutAlpha` (8–75 %),
  `empty`/`background_not_removed` → `InvalidAssetError` → `fallbackKey`/Tier 0; `png` без
  cutout-окна, но с trim.
- Hash считается по обрезанному PNG; вариант `image/png` с `.png`-ключом, data URI и
  `metadata: { provider, model, prompt, occupancy, trimmedFrom }`.
- `storeSvg`/`storeRaster` + общий `storeGenerated` — дедуп и сохранение в одном месте.
- Fake provider синтезирует детерминированный `24×24` RGBA-cutout (opaque-квадрат в
  прозрачной рамке) и отдаёт base64 PNG для `png`/`raster-cutout`.
- `PROVIDER_KINDS` расширен до `svg | png | raster-cutout`.

## Изменённые файлы

- `packages/assets/src/raster-pipeline.ts`, `raster-pipeline.spec.ts` — пайплайн и тесты.
- `packages/assets/src/resolver.ts`, `resolver.spec.ts` — ветвление, raster-тесты, fallback.
- `packages/assets/src/provider-fake.ts` — синтетический PNG.
- `packages/assets/src/library-service.spec.ts` — persist PNG с `.png`-ключом.
- `packages/assets/src/index.ts`, `package.json`, `pnpm-lock.yaml` — `fast-png`.
- `docs/adr/0017-asset-library-and-resolver.md` — D15.

## Решения

- Декодер — `fast-png` (pure JS), не `sharp`: без нативных бинарников в Windows/CI.
- Trim обязателен для обоих kind; hash по обрезанным байтам.
- `png` не проходит cutout-окно (может иметь непрозрачный фон).
- WebP/JPEG — вне scope, typed error и fallback; живых вызовов нет.

## Отклонения от плана

- Первый вариант fallback-тестов падал в типизированную ошибку: fallback ищется по тому же
  `kind`, а растровых Tier 0-записей в каталоге нет. Тесты используют same-kind fallback-запись;
  поведение «нет фолбэка → typed error» осознанное.
- Остальные пункты совпали с планом.

## Не проверено

- Живой flux/BiRefNet-ответ (нет `FAL_KEY`) — `Not verified`.
- Sticker-outline и центрирование не делались.

## Блокеры и следующий шаг

- Дальше: `cartoon-character` rig (M3.6b.7) или M3.6c дизайн-кит; плана нет.
- Хвост: 12 сиротских S3-объектов M3.6b.1, `--prune` не сделан.
