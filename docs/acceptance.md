# Приёмка визуальных срезов M3.6

Обновлено: 2026-11-14 · ветка `feat/m3-animated-factory`.
Три ручных прогона ниже отвечают на вопрос «срез работает end-to-end», а не заменяют
юнит-тесты. `Not verified` означает, что проверку не запускали, — это не «зелёный».

## 1. wifi-wall — episode-конвейер с генерацией subject'ов

```bash
pnpm infra:up                      # Postgres + Redis + SeaweedFS
pnpm --filter @peertoreel/worker storyboard:episode -- \
  --topic "Почему Wi-Fi не проходит через стены" --slug wifi-wall --tts google
```

Ожидаемо:

- 7 сцен, 6 subject-слотов, 5 generated (`tier: provider`), 1–2 слота на Tier 0;
- в ledger — реальные вызовы DeepSeek (на 2026-11-13: 2 вызова, $0.005104), без оценок;
- повторная стадия читает кэш: новых строк `provider_usage` нет, `providerRequests: 0`;
- деградация: провайдер выключен/недоступен/бюджет → слоты на Tier 0, рендер доходит до конца,
  в артефакте видны `provider_failed` / `provider_disabled_by_budget`;
- ролик: 1080×1920, 30 fps, h264 + aac, `audioGaps` не больше прежнего (0.051 при 48.7 с).

Что смотреть глазами: главный предмет каждой сцены — фронтальная плоская проекция, без верхней
грани и «три четверти»; subject не мельче подписи; фон не съедает силуэт. Исторические артефакты —
`apps/worker/out/m3-6b-5` (storyboard) и `apps/render-worker/out/m3-6b-5` (сцены, галерея).
Визуальная оценка человеком на 2026-11-14: `Not verified`.

## 2. raster-cutout — резолвер и обрезка альфы

```bash
pnpm --filter @peertoreel/assets test -- src/resolver.spec.ts
pnpm --filter @peertoreel/assets test -- src/library-service.spec.ts
```

Ожидаемо:

- fake-провайдер отдаёт PNG 24×24 → `tier: provider`, `kind: raster-cutout`;
- hash считается по обрезанным байтам, `trimToAlpha` убирает прозрачные поля;
- пустой cutout и непрозрачный фон — не валидный cutout, слот уходит в fallback;
- `persist` кладёт PNG под content-addressed ключ, повторный resolve — из кэша.

Что смотреть глазами: у PNG прозрачный фон, объект обрезан по краю без белой рамки; в
`asset_variants` одна строка на обрезанные байты. Отдельного CLI-примера storyboard с
`raster-cutout` пока нет — приёмка живёт на уровне резолвера.

## 3. cartoon-character — процедурный ведущий

```bash
pnpm --filter @peertoreel/render-worker render-storyboard -- \
  --input examples/cartoon-character.json --out out/m3-6b-8
```

Ожидаемо:

- 5 сцен, везде `componentId: cartoon-character`, `source: implementation`;
- 0 params-диагностик; каждая сцена 1080×1920, 30 fps;
- эмоции различаются бровями, глазами и ртом; поза `wave` поднимает правую руку;
- манифест содержит `promptVersion`, `blueprintVersion`, `styleId`.

Сравнение кадров с принятым срезом M3.6b.7.1:

```bash
ffmpeg -y -i out/m3-6b-8/scene-0.mp4 -vf "select='eq(n,0)'" -vframes 1 out/m3-6b-8/frames/scene-0.png
# открыть рядом с out/m3-6b-7/frames/scene-0.png
```

`pnpm check` гоняет golden-тест `character.spec.ts`: сигнатура геометрии для 5 эмоций × 2 поз
совпадает с фикстурой, снятой до выноса blueprint. Любое расхождение — визуальное изменение,
а не рефакторинг.

Что смотреть глазами: рот совпадает с лицом (исторически он не следует за дыханием — так
принято в 7.1), брови симметричны, кисти не выходят за холст.

## Гигиена хранилища

```bash
pnpm --filter @peertoreel/worker assets:prune            # dry-run, по умолчанию
pnpm --filter @peertoreel/worker assets:prune -- --delete
```

Dry-run печатает объекты под `assets/` без строки в `asset_variants`; `--delete` удаляет только
их. Объект, на который есть строка, не удаляется никогда.
