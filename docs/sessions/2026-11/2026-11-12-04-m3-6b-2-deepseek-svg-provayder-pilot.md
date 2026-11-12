# 2026-11-12 — M3.6b.2: DeepSeek SVG провайдер, контракты, CLI и пилот

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-12-m3-6b-2-deepseek-svg-session.md`

## Цель

Реальная генерация предметных SVG через DeepSeek за портом `ImageProvider`: адаптер, учёт
токенов/стоимости на attempt, allowlist-валидация и пилот 10×3×3.

## Результат

- `packages/contracts`: `LlmJsonClient`/`LlmJsonUsage`/`ProviderUsageSink` (`src/llm.ts`),
  `'llm'` в `ASSET_SOURCES`.
- `packages/providers`: `deepseek-client.ts` (один вызов = одна попытка, без ретраев) и
  `deepseek-svg.ts` (геометрический промпт 400×400, `thinking: enabled`, 3 кандидата,
  allowlist без `text`/`image`/`filter`/`mask`/`script`/внешних `href`/`url(`, ≤200 КБ,
  ≤500 элементов, один corrective retry, `InvalidAssetError`); леджер на attempt,
  `cost_usd` = токены × тариф из env, `ASSET_LLM_MAX_USD_PER_CALL`.
- `apps/worker`: `generateJson` использует тот же клиент, публичный API и ретраи сохранены.
- `packages/db`: `'llm'` в `asset_source`, миграция `0011` (`ADD VALUE ... BEFORE 'recraft'`).
- `apps/render-worker`: `--provider=deepseek-svg` (требует `--persist`, чтобы расход попал в
  `provider_usage`), `provider-config.ts`, пилот `pilot:deepseek-svg`.
- **Пилот:** 87/90 структурно пригодных (96.7%), `normalizeSvg` 87/90, `maxColorDistance = 0`,
  $0.207967 факт, средняя латентность 17 978 мс. Провал — `pirate` 6/9: пустой content при
  16k completion-токенов (`thinking` съедает бюджет вывода). 87 SVG + `pilot.md` +
  `gallery.html` в `apps/render-worker/out/m3-6b-2/pilot/`.
- `pnpm check` зелёный: 783 unit-теста (contracts 164, providers 26, assets 67, db 21,
  storage 9, tiktok 30, render-worker 107, worker 145, api 74, web 140).
- Миграция `0011` применена локально; `provider_usage` получила 90+ строк пилота.
- CLI acceptance: `render-storyboard --provider=deepseek-svg --persist` на новом ключе
  `pilot/robot` → `tier: provider`, `providerRequests: 1`, в БД `source: 'llm'`,
  `license: deepseek-api-terms`; повторный прогон → `tier: cache`, `providerRequests: 0`.

## Изменённые файлы

- `packages/contracts/src/{llm.ts,assets.ts,index.ts}`, `packages/assets/src/provider-usage.ts`.
- `packages/providers/src/{deepseek-client.ts,deepseek-svg.ts,deepseek-svg.spec.ts,index.ts}`.
- `packages/db/src/schema.ts`, `apps/api/drizzle/0011_boring_sinister_six.sql`.
- `apps/worker/src/llm/deepseek.ts`, `apps/worker/package.json`.
- `apps/render-worker/src/{asset-resolution.ts,cli.ts,provider-config.ts,pilot-deepseek-svg.ts}`.
- `.env.example`, `README.md`, `ROADMAP.md`, ADR-0015 (amendment), ADR-0017 (D12).

## Решения

- Тариф — фиксированный off-peak в env, обязателен при включённом провайдере (fail fast, не 0).
- Тени запрещены; `normalizeSvg` остаётся последним шагом перед хешем.
- `description`/`fallbackIcon`/`role` не добавлялись: `ImageProviderRequest.prompt` уже несёт
  описание предмета; дизайн-кит — M3.6c.
- `--provider=deepseek-svg` без `--persist` — ошибка (hard rule 7).

## Отклонения от плана

- Реальный расход оказался ~$0.0023 за кандидата, а не $0.0003 из PoC: `thinking: enabled`
  даёт длинные completion (пират — до 16k токенов). Это измеренный факт, а не оценка.
- Порт `LlmJsonClient` реализован в `packages/providers` (и переиспользован воркером), а не
  только воркером: CLI рендерера не может импортировать код другого приложения.

## Не проверено

- Визуальный балл 1–5 — только человеком (файлы готовы).
- Реальный R2/публичный домен, полный M3.6 acceptance (raster-cutout, `cartoon-character`).

## Блокеры и следующий шаг

- Органика + `thinking`: решить, поднимать `max_tokens`, отключать thinking для органики или
  подключать Recraft только для hero.
- Визуальный review 87 SVG и решение по гейту §8.2.
