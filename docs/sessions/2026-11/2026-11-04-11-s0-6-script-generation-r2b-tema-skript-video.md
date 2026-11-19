## 2026-11-04 — S0.6 Script generation (R2b): тема → скрипт → видео

**Цель:** закрыть последнее звено «под ключ» — из строки темы получить готовый MP4, без ручного
текста.

**Сделано:**

- `packages/contracts/src/script.ts`: `scriptBeat` (text, visualDirection, durationSec),
  `script` (title, hook, beats 2–12, cta), `scriptSpeechText()` (hook → beats → cta одной
  строкой для TTS), `scriptPlannedDurationSec()` (плановые оценки, не тайминги).
- `apps/worker/src/llm/deepseek.ts`: OpenAI-совместимый клиент `generateJson(schema, …)`.
  `response_format: json_object`, `thinking: disabled` (иначе модель тратит весь лимит на
  `reasoning_content` и возвращает пустой `content`), Zod-валидация, до 3 попыток на
  невалидный JSON, `LlmError` с классификацией retryable (429/5xx) и без ретраев на 401/403/402.
- `apps/worker/src/script/prompt.ts`: системный и пользовательский промпты (RU-сценарий,
  5–8 beat'ов, английские ключевые слова для стокового поиска, без кликбейта).
- `apps/worker/src/script/script-spike.ts`: тема → скрипт → озвучка (`with-timestamps`) →
  ASS-караоке → рендер.

**Проверено (реальный прогон на теме «Почему небо синее»):**

- Скрипт: 7 beat'ов, 494 символа, 399/400 токенов, 2.9 s; заголовок «Почему небо синее:
  простое объяснение», хук «Солнечный свет кажется белым, но это не так», осмысленные
  `visualDirection` (`prism splitting light into rainbow`, `sunset red orange sky`, …).
- Озвучка: 600 KB за 2.6 s, 78 слов, речь заканчивается на 37.48 s.
- Рендер: 6.4 s, MP4 1080×1920/30 fps, h264+aac, 37.5 s, 34 MB (тестовая таблица почти
  не сжимается — на реальном стоке будет кратно меньше).
- Кадр на 18.0 s: «Поэтому синий цвет как» с подсветкой «цвет» — синхрон с озвучкой.
- Громкость итогового файла: −14.62 LUFS, true peak −1.19 dBTP.
- `pnpm check` — зелёный: контракты 23, API 22, worker 19, web 32.

**Решения и наблюдения:**

- `durationSec` от LLM — только план (46 s против реальных 37.5 s). Таймлайн строится по
  character alignment от TTS, а не по оценке модели.
- Модель `deepseek-flash` — reasoning-модель: без `thinking: disabled` ответ приходит с пустым
  `content` и `finish_reason: length`. Это зафиксировано в клиенте.
- Стоимость: токены пишутся из `usage` (399/400), денег DeepSeek в ответе не отдаёт —
  в `provider_usage` будем хранить токены и считать цену по прайсу на момент вызова.

**Осталось:**

- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Визуалы: пока синтетический `testsrc2`; реальный Pixabay — стадия `visuals`.

