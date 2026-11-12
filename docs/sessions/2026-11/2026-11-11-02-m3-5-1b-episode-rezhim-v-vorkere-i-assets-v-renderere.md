## 2026-11-11 — M3.5.1b: episode-режим в воркере и `--assets` в рендерере

**Статус:** DONE. Ветка `feat/m3-5-1b-episode-worker` от `feat/m3-5-1` (M3.5.1a). План:
`docs/workspace/plans/2026-11-11-m3-5-1b-episode-worker-session.md`. Parent:
`2026-11-11-m3-5-1-episode-in-ui-session.md`; API `/storyboard` и UI-превью — M3.5.1c.

### «Текущее → требуемое»

| Область | Было | Стало |
| --- | --- | --- |
| Контракты | Episode-стадии без артефактов | `episodeVisualsArtifactSchema`, `episodeManifestSchema`, типы `episode_visuals_json`/`episode_manifest` |
| Очереди | Стадии `episode_plan`/`episode_render` без воркеров | Оба processor'а зарегистрированы в `main.ts` (concurrency 1), финальные ошибки → `FAILED` |
| Планирование | Только CLI-спайк | `episode/plan.processor.ts`: DeepSeek → Google TTS → `buildStoryboardFromDraft` → Pixabay subject-слоты → 6 артефактов → `SCRIPT_READY` |
| Рендер | Только pipeline `render` | `episode/render.processor.ts`: subprocess `render-storyboard`, concat, loudnorm + ASS, `draft_mp4`, инвалидация QC, `REVIEW` |
| `transitionRun` | `currentStage` всегда по pipeline-таблице | Читает `runs.mode` и использует mode-aware `canTransition`/`stageForState` |
| Renderer CLI | Ассеты только через resolver | `--assets <map.json>`: валидирует `ResolvedAssetMap`, инжектированные URL побеждают Tier 0, в манифесте `assets.injected` |
| TTS-ошибки | `GoogleTtsError` без классификации | `retryable` по статусу: 401/403/200-битый ответ → `UnrecoverableError`, 429/5xx → retry |
| Идемпотентность | Не было | Manifest + все артефакты с тем же topic → только переход в `SCRIPT_READY`, без LLM/TTS/Pixabay |

### Проверено

- `pnpm check` — зелёный; 721 тест (contracts 163, db 18, api 71, web 126, worker 141,
  render-worker 105, assets 60, tiktok 28, storage 9). Новые тесты: схемы episode-артефактов,
  сбор subject-слотов, Pixabay (кэш/ошибки/размер), оба процессора (план, идемпотентность,
  ключи, режим, рендер, Chrome, QC-invalidation), инъекция `--assets`.
- Реальный CLI-смоук: `render-storyboard --scene 0 --assets <map>` на `recipe-showcase.json`
  отрендерил сцену за 20.3 с; манифест: `assets.injected: 1`, `assets.resolutions` содержит
  только неинжектированный `scent-wave(starter)`. Карта валидируется, BOM-файл отвергается.
- Unit-тесты не запускают Chrome и не ходят в сеть: LLM/TTS/Pixabay/Render CLI замоканы.

### Не проверено

- Полный episode-прогон через API/UI: создание episode-run и кнопки появятся в M3.5.1c;
  живой DeepSeek/Google TTS/Pixabay-вызов из процессора не выполнялся.
- Сборка полного эпизода (все сцены + concat + loudnorm) через `episode_render` — только
  unit-тесты с моками; реальный CLI проверен на одной сцене.
- Google TTS 429/403 на реальном лимите; профиль Chrome в Docker.

### Теория

- Episode-план — это оркестратор, а не новый пайплайн: он переиспользует `generateJson`,
  `synthesizeWithGoogleTts` и `buildStoryboardFromDraft`, добавляя только subject-картинки.
- Pixabay остаётся вне Asset Library: картинка живёт как data URI в артефакте, а renderer
  получает её через тот же `ResolvedAssetMap`, что и resolver, — граница «рендерер видит URL»
  сохраняется без новых типов.
- Инъекция на уровне CLI, а не компонентов: `SubjectLayer` не знает про Pixabay, поэтому
  тест «карта подменяет starter» проверяет ровно стык, где возможна регрессия.
- Идемпотентность строится на артефакте-манифесте: наличие файлов + совпадение topic —
  доказательство, что вход не менялся; без этого повторный job платил бы дважды.
- `transitionRun` обязан читать mode: одно и то же состояние `SCRIPT_READY` принадлежит
  разным стадиям в двух режимах, и `currentStage`/`failedStage` иначе врут в истории.
- Классификация ошибок TTS — часть контракта: 403 не лечится ретраем, 429 лечится; без
  `retryable` BullMQ потратит все попытки на терминальную ошибку.
- Долгий рендер держим в subprocess: Chrome/RAM и сборка Remotion не попадают в процесс
  очередей, а падение CLI не роняет воркер.
- Инъекция данных (data URI) ограничена размером input props; превышение — не ошибка стадии,
  а осознанный откат на Tier 0.

