# 2026-11-13 — M3.6b.5: третья тема wifi-wall и acceptance M3.6

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-13-m3-6b-5-third-topic-and-acceptance-session.md`

## Цель

Прогнать новую тему `wifi-wall` через CLI-конвейер с реальной генерацией DeepSeek и закрыть четыре
пункта M3.6 acceptance: кэш, деградация в Tier 0, ledger, собранный ролик.

## Результат

- Контракт: subject-слот принимает `subject/<slug>` только с `fallbackIcon` (стартовый ключ) и
  `prompt`; стартовые ключи работают как раньше (ADR-0016 D10).
- `recipes.ts` отдаёт generated-ключ как ссылку слоя; `asset-resolution.ts` передаёт провайдеру
  `prompt`/`fallbackKey` и собирает subject-хинты из слотов.
- Резолвер: ошибка провайдера после retry → `provider_failed` + fallback; attempts и cost из
  `ProviderCallUsage` попадают в `usage`; `ProviderBudgetError` → `provider_disabled_by_budget`,
  провайдер выключается до конца прогона (инстанс резолвера = прогон).
- Провайдер: ledger пишет over-budget attempt; `DEEPSEEK_SVG_FORCE_FAILURE=unavailable|empty`
  (`provider-config.ts`) для детерминированной проверки.
- Acceptance (второй прогон, после фикса перспективы): 7 сцен, 6 subject-слотов, 5 generated (83%),
  `subject/wifi-router` и `subject/brick-wall-section` → `tier: provider`, 2 вызова, $0.005104;
  повтор → кэш без новых строк ledger; `--provider=none`, `unavailable`, `empty` и budget →
  fallback/Tier 0, рендер завершён; пустой ответ — 2 строки по 0, budget — 1 строка $0.003684.
- Ролик собран из провайдерских сцен: 48.7 с, 1080×1920/30, h264 yuv420p + aac 48k, `audioGaps 0.051`.
  Галерея: `out/m3-6b-5/gallery.html` (+ 7 кадров, SVG обоих subject'ов).

## Инцидент: изометрия на роутере

Первый accepted-роутер получил «крышку под углом» (`path` параллелограммом). Причина —
промпт директора: правило в `prompt.ts` просило «ракурс», модель написала «вид три четверти»;
`subjectHints` перезаписывал промпт по одному ключу (побеждал последний слот), а провайдер
ставил `Объект:` раньше запрета перспективы. Исправлено тремя слоями: формулировка директора
(фронтальная проекция), хард-правило `2а` в system-промпте + строка «Проекция» после объекта,
`sanitizeSubjectPrompt` (срезает три четверти/изометрию/сверху/ракурс, добавляет плоскую
проекцию) и first-wins в хинтах; промпт пишется в `provider_usage.meta` и в манифест.
Ассет и S3-объект удалены, роутер перегенерирован: плоский фронт, верхней грани нет.

## Изменённые файлы

- `packages/contracts/src/storyboard.recipes.ts`, `assets.ts` — subject-контракт, коды диагностик,
  `ProviderCallUsage`, `ProviderBudgetError`, `sanitizeSubjectPrompt`.
- `packages/assets/src/resolver.ts` — fallback после ошибки провайдера, spend-аккумулятор,
  budget stop-crank.
- `packages/providers/src/deepseek-svg.ts` — usage в ошибках, over-budget в ledger, simulate-режимы,
  хард-правило проекции, prompt в meta.
- `apps/render-worker/src/{recipes,asset-resolution,provider-config,cli}.ts` — generated-субъекты,
  хинты (first-wins + санитайзер), env-рычаг, usage/prompt/diagnostics в манифесте.
- `apps/worker/src/storyboard/prompt.ts` — правило «главный предмет → subject/<slug>» с фронтальной
  проекцией.
- Тесты: contracts 172, assets 71, providers 30, render-worker 110, worker 145 — зелёные.

## Решения

- Стартовый ключ — для второстепенной детали; главный предмет темы генерируется.
- `usage.costUsd` агрегируется: null только если провайдер не отчитался, а Tier 0 не обнуляет
  измеренную стоимость.
- Budget-ошибка сначала пишется в ledger, потом выбрасывается.

## Отклонения от плана

- TTS: квота ElevenLabs исчерпана (290/409 кредитов) → `--tts google`; тайминги реальные, но голос
  spike-провайдера.
- QC: по решению пользователя — только `ffprobe`; стадия `qc` не прогонялась.
- Пути: storyboard в `apps/worker/out/m3-6b-5`, сцены — в `apps/render-worker/out/m3-6b-5`.
- Сборка ролика и галерея — разовые скрипты в `apps/worker/out/m3-6b-5/` (вне git).

## Не проверено

- Визуальная оценка человеком: `Not verified` (кадры 0–1 просмотрены, артефактов не видно).
- Публикация/QC-стадия — вне scope.

## Блокеры и следующий шаг

- 12 старых S3-объектов M3.6b.1 всё ещё сироты (`--prune` не сделан).
- Дальше: raster-cutout / `cartoon-character` (M3.6b.6–b.7) или M3.6c дизайн-кит; план не создан.
