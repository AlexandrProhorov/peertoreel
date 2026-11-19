# 2026-11-15 — M3.6b.9: DeepSeek SVG в episode_plan через веб-стадию

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-web-deepseek-visuals-session.md`

## Цель

Включить генерацию subject-ассетов в episode-стадии: `VISUALS_SOURCE=deepseek-svg`, resolver,
persist, ledger, лимит на прогон, fallback на Tier 0 и статусы в превью.

## Результат

- Env воркера (Zod): `VISUALS_SOURCE` (`pixabay` по умолчанию), тарифы `LLM_*_USD_PER_MTOK`,
  `ASSET_LLM_MAX_USD_PER_CALL`, `ASSET_LLM_MAX_USD_PER_RUN=0.25`,
  `DEEPSEEK_SVG_FORCE_FAILURE`.
- `WorkerAssetRuntime` (`apps/worker/src/assets/runtime.ts`): resolver-зависимости собираются
  один раз, провайдер — на прогон, чтобы ledger-строка несла `run_id`.
- `subject-assets.ts`: `subject/<slug>` через `TieredAssetResolver` → cache/provider → Tier 0;
  persist байтов и строк, ledger `source=worker`, `dataUri` в пределах 2 МБ, стоимость по
  измеренным токенам. Ошибка слота не валит стадию; слот без `fallbackIcon` — явная ошибка с
  ключом; бюджет останавливает только генерацию.
- Артефакт `visuals.json` стал source-agnostic: `source`, `subjects[]` (tier, provider, costUsd,
  diagnostics, prompt), `costUsd`, `providerDisabledByBudget`; старые артефакты читаются по
  умолчаниям. Pixabay-путь пишет решения и `costUsd: 0`.
- Манифест: `stock.provider` — строка (`pixabay` | `deepseek-svg`), стоимость — измеренная.
- UI превью: бейдж источника, tier, стоимость в USD и коды диагностик на каждый subject.
- Приёмка через API+воркер (5 episode-прогонов): 2 generated subject, 3 строки ledger,
  $0.008464; 3 прогона — кэш без вызовов и новых строк. Детали — `docs/acceptance.md` §4.

## Изменённые файлы

- `packages/contracts/src/episode.ts`, `episode.spec.ts` — источники, решения, версии полей.
- `apps/worker/src/config/env.ts`, `env.spec.ts` — новые переменные и парсинг.
- `apps/worker/src/assets/runtime.ts` — сборка библиотеки и провайдера.
- `apps/worker/src/episode/subject-assets.ts`, `subject-assets.spec.ts` — новый источник.
- `apps/worker/src/episode/subjects.ts`, `visuals.ts` — hints (`prompt`, `fallbackKey`) и решения.
- `apps/worker/src/episode/plan.processor.ts`, `plan.processor.spec.ts` — ветвление по источнику.
- `apps/worker/src/stages/context.ts`, `main.ts` — `assets` в deps и статус при старте.
- `apps/web/.../episode-preview.*`, `episode-preview.spec.ts` — UI-статусы.
- `.env.example`, `docs/acceptance.md`, `docs/state/current.md`, `SESSION_LOG.md`.

## Решения

- Провайдер создаётся на прогон: `runId` — часть ledger-контракта, shared-инстанс его теряет.
- Кэш и persist обязательны: повтор слота не должен оплачиваться второй раз.
- Неизмеренная стоимость останавливает генерацию: бюджет нельзя проверить по неизвестному числу.
- `providerRequests` считает успешные вызовы resolver'а; retry внутри адаптера виден в ledger
  отдельными строками (2 строки на 1 успешный subject — это факт, не ошибка).
- Стартовые ключи не проходят через провайдера и остаются Tier 0 в рендерере.

## Отклонения от плана

- Превью в браузере не открывалось: UI проверен юнит-тестами и ответом `/runs/:id/storyboard`.
- Бюджетный стоп не воспроизведён живым прогоном (спенд $0.008 < $0.25) — только юнит-тест.
- Директор переиспользует slug'и (`dog-nose`, `dog-snout`) на разных темах, поэтому «2–3
  генерации» получены на двух темах, а не на трёх слотах одной.
- `episodeManifestSchema.stock.provider` расширен до строки: иначе deepseek-прогон врал бы
  про источник.

## Не проверено

- Визуальная оценка сгенерированных subject'ов человеком — `Not verified`.
- Реальный бюджетный стоп провайдера на живом прогоне — `Not verified`.
- Рендер эпизода с deepseek-ассетами (Remotion + FFmpeg) — вне scope среза.

## Блокеры и следующий шаг

- Блокеров нет.
- Дальше: `2026-11-14-m3-6b-7-2-character-in-recipes-session.md`; затем 7.3 аксессуары.
