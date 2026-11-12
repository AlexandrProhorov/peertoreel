## 2026-11-10 — M3.5: End-to-end animation spike на двух темах

**Статус:** DONE. Ветка `feat/m3-animated-factory`.

**Цель:** проверить путь topic → DeepSeek draft → TTS → `storyboard.v1` → Remotion-сцены →
FFmpeg-ролик на темах «Почему у собак мокрый нос?» и «Почему дома строят из кирпича?», без
API/БД/очередей и облачных AI-ассетов.

### Что изменено

- `packages/contracts/src/storyboard.director.ts` — `storyboardDraftSchema`: 5–8 сцен,
  60–110 слов, первый hook, последний cta, последовательные beats, валидация recipe/variant/
  slots через `parseRecipeSlots`. Таймингов в драфте нет.
- `apps/worker/src/storyboard/`:
  - `prompt.ts` — системный и пользовательский промпты, каталог и starter-ключи собираются из
    contracts, без дублирования;
  - `build.ts` — `buildStoryboardFromDraft`: окна сцен из реальных word timings, камера из
    camera hint варианта, пустые objects, kinetic fallback, финальная валидация
    `storyboardSchema`;
  - `tts-fallback.ts` — spike-only Google Translate TTS: по-сценная озвучка, точные
    длительности из ffprobe, пропорциональные word timings;
  - `episode-spike.ts` — CLI `storyboard:episode`: DeepSeek → TTS → storyboard → render-worker
    CLI → concat → loudnorm/ASS → manifest;
  - `style.ts` — фиксированный flat 2D стиль M3.5.
- `apps/worker/package.json` — скрипт `storyboard:episode`.
- Визуальный review M3.4 выявил две layout-проблемы: `fact-object/stage` (caption/metric
  пересекались) и боковые subject-слои с неопределённой шириной. Исправлено в каталоге и
  `recipe-layout.tsx` (данные, без per-topic кода).
- README, ROADMAP (M3.5 → DONE), ADR-0012 (раздел M3.5), `apps/worker/AGENTS.md`.

### Таблица «текущее поведение → требуемое изменение»

| Область | Было (M3.4) | Стало (M3.5) |
| --- | --- | --- |
| Раскадровка | Только вручную написанный JSON | DeepSeek-драфт + детерминированная сборка `storyboard.v1` |
| Тайминги | Заданы в JSON/фикстуре | Выведены из реальной озвучки; LLM их не назначает |
| Рецепты | Проверены showcase-файлом | Режиссёр выбирает рецепты/варианты/слоты под две темы |
| Subject-слой | Работает в showcase | Используется в обоих роликах из `STARTER_ASSET_KEYS` |
| Сборка | Только сцены | Ролик с озвучкой, loudnorm −14, ASS-субтитрами |
| TTS | ElevenLabs | ElevenLabs по умолчанию + явный `--tts google` для спайка |
| Манифест | Сцены и диагностика | + LLM usage, TTS provider, длительности, ffprobe ролика |
| Тесты | Contracts/render-worker | + draft schema, prompt, build/timing, fallback helpers в worker |

### Проверено

- `pnpm check` — зелёный; contracts **148 тестов**, worker **119**; тесты без сети, Chrome и
  `renderMedia`.
- «Собака»: 7 сцен, 50.4 с, 86 слов, 5 разных recipeId; DeepSeek 2511/916 токенов, 1 попытка;
  озвучка Google 50.42 с; сцены 146 с, concat 3.2 с, финал 6.4 с.
- «Кирпичи»: 6 сцен, 46.0 с, 75 слов, 5 разных recipeId; DeepSeek 2512/795 токенов, 1 попытка;
  озвучка Google 46.01 с; сцены 137 с, concat 3.3 с, финал 5.5 с.
- `ffprobe` обоих роликов: h264 1080×1920, 30 fps, `yuv420p`, BT.709 + AAC-аудио; длительности
  50.40 и 46.03 с.
- Визуальный review кадров: истории связные, рецепты разные (hero, факт, сравнение, процесс,
  CTA), предметные SVG читаемы, ASS-субтитры на месте; коллизии layout после правки нет.
- Тайминги сцен contiguous и суммарно равны длительности аудио; `storyboardSchema` валиден для
  обоих эпизодов.
- Ошибки LLM/слотов дают Zod-путь и retry, а не пустой кадр (unit-тесты драфта).

### Не проверено / ограничения

- **ElevenLabs:** квота аккаунта исчерпана (осталось 290 кредитов; на один полный текст нужно
  ~295). Поэтому оба спайка озвучены `--tts google`. Это CLI-only fallback: production-стадия
  voiceover не менялась. Word timings в fallback — пропорциональная оценка по длине слов, а не
  character alignment; recipe-слои от них не зависят, ASS-караоке приблизительное.
- **Качество Google-голоса** не оценивалось как production; это проверка пайплайна.
- **Docker:** образ M3.5 не собирался (Docker daemon не запущен).
- **Очередь и артефакты:** `scene_clip`/`scene-render` не добавлялись — это M3.7.
- **Стоимость:** использованы реальные токены DeepSeek и длительность TTS; денег не считали
  (ledger — M3.7/M4.3).
- **Кросс-платформенный паритет** рендера не проверялся.

### Теория сессии

- **LLM предлагает структуру, код решает время.** Драфт содержит только текст и слоты; окна
  сцен считаются по реальным word timings. Это защищает от «LLM придумал 7 секунд».
- **Два контракта вместо одного.** `storyboardDraftSchema` — вход режиссёра, `storyboardSchema`
  — вход рендерера. Между ними детерминированный `buildStoryboardFromDraft`, где живут камера,
  fallback, transition и beatIndex.
- **Слово — единица синхронизации.** Число слов в драфте сверяется с TTS; расхождение — ошибка,
  а не тихий сдвиг сцен.
- **Один непрерывный TTS лучше склейки.** ElevenLabs поёт/говорит с интонацией через границы
  сцен; fallback вынужден делать по-сценно из-за отсутствия alignment, и это записано в manifest.
- **Провайдер — явный флаг, не скрытая подмена.** `--tts google` включается осознанно, а
  production-путь остаётся ElevenLabs; manifest фиксирует, чем озвучен ролик.
- **Переиспользование сильнее нового кода.** `buildVisualConcatArgs`, `renderDraft`, `probeMedia`
  и render-worker CLI не менялись — спайк собрал ролик из существующих кирпичей.
- **Визуальный review — часть теста.** Коллизии caption/metric и ширина боковых слоёв были
  найдены только на кадрах; исправление ушло в данные каталога и layout, а не в ветку по теме.
- **Детерминизм сцены остаётся базой.** M3.5 не добавляет глобального состояния; per-scene
  очередь M3.7 сможет переиспользовать resolution M3.4.

### Следующая сессия

M3.6 — Asset Library + Asset Resolver (Tier 0–2), `ImageProvider` (Recraft Vector / FLUX.2 +
BiRefNet), OKLab-нормализация, `cartoon-character`, style preset `studio_flat_2d_v1`.

---

