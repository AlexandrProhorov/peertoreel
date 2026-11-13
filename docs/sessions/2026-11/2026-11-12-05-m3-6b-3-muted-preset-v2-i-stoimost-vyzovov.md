# 2026-11-12 — M3.6b.3: приглушённый preset v2, скругления и стоимость вызовов

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** M3.6b.2 + фидбек визуального review

## Цель

Убрать «детский рисунок» и лишние токены: приглушённая палитра, скругления, детализация без
обводок, `thinking: off` и лимит вывода.

## Результат

- `packages/contracts/src/style.ts`: пресет `studio_flat_2d_v2` (16 слотов: ink/surface/paper/
  amber/sky/coral/sage/danger, ~40–50% насыщенности) — новый `DEFAULT_STYLE_PRESET_ID`;
  `studio_flat_2d_v1` сохранён. v2 — дефолт в storyboard-стиле, `assets.style_id` (миграция
  `0012` меняет только DEFAULT).
- Tier 0: `recolor:starter` (quantize с `paddingRatio: 0`, идемпотентно) перекрасил 12 SVG,
  `assets:import` добавил 12 строк под v2; v1-строки не тронуты.
- Промпт: `rx/ry ≥ 8%` меньшей стороны, фон без `rx`, без обводки мелких деталей,
  8–15 примитивов, 3–5 цветов из палитры, `<!-- PLAN -->`.
- Вызов: `thinking: disabled`, `max_tokens: 1600`, температура 0.4.
- Пилот 10×1×3: **30/30 годных**, `maxColorDistance = 0`, **$0.014573** (≈$0.00049/кандидат,
  4.7× дешевле), completion 259–1 327 токенов, средняя латентность 3 344 ms.
- `pnpm check` зелёный: 783 теста. Миграции `0011`/`0012` применены.

## Изменённые файлы

- `packages/contracts/src/style.ts`, `packages/assets/src/style.spec.ts`.
- `packages/db/src/schema.ts`, `apps/api/drizzle/0012_mysterious_magdalene.sql`.
- `packages/providers/src/deepseek-svg.ts` (+ spec), `apps/render-worker/public/assets/starter/*`
  (12 файлов).
- `apps/render-worker/src/{recolor-starter.ts,pilot-deepseek-svg.ts}`, `package.json`.
- `README.md`, `ROADMAP.md`, ADR-0015 (amendment), ADR-0017 (D13), `.env.example` не менялся.

## Решения

- Палитра — значения заказчика, 16 слотов; нормализация по-прежнему сводит любой цвет к
  ближайшему слоту, поэтому модель просят использовать 3–5.
- Пресет версионируется (v2), а не перезаписывается: `assets_key_style_unique` не даёт менять
  байты под тем же `(key, style_id)`.
- `thinking` выключен; при необходимости сложную органику можно вернуть точечно.
- Tier 0 перекрашивается авторским шагом, импорт — обычный идемпотентный `assets:import`.

## Не проверено

- Визуальная оценка v2 человеком: 30 SVG в `out/m3-6b-3/pilot/`, `gallery.html`.
- Поведение на длинных сериях (>10 объектов) и консистентность между роликами.

## Блокеры и следующий шаг

- Визуальный review v2: скругления и палитра.
- `--prune` старых S3-объектов (12 сирот M3.6b.1) остаётся на потом.
- Остаток M3.6b: raster-cutout, `cartoon-character`, третья тема.
