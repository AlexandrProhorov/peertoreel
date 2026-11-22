## 2026-11-03 — S0.5 Render + TTS spike (R1 / R2a)

**Цель:** снять два главных риска — «соберём ли мы вообще вертикальное видео» и «получим ли
осмысленную озвучку с таймингами» — до начала работ по M2.

**Сделано:**

- `apps/worker/src/media/karaoke.ts` — ASS-караоке из пословных таймингов: фразы по 4 слова,
  активное слово жёлтым (`\c&H00FFFF&\b1`), холст 1080×1920, `MarginV=320` под UI платформы,
  экранирование `{}` и `\`, тайм-коды в сантисекундах.
- `apps/worker/src/media/loudnorm.ts` — двухпроходный loudnorm: разбор JSON-замера FFmpeg,
  фильтр второго прохода с `measured_*` и `linear=true`.
- `apps/worker/src/media/ffmpeg.ts` — сборка видео: `scale`+`crop` до 1080×1920, `fps=30`,
  `ass`, loudnorm, libx264/CRF 21, AAC 128k/48 kHz, `+faststart`, `-shortest`. Запуск через
  `spawn` с массивом аргументов (`shell: false`), таймаут и `FfmpegError` со stderr.
- `apps/worker/src/tts/elevenlabs.ts` — `POST /v1/text-to-speech/{voice_id}/with-timestamps`,
  Zod-валидация ответа, `TtsError` с `retryable` (429/5xx — да, 401/403/404 — нет).
- `apps/worker/src/tts/word-timings.ts` — слова из character alignment.
- Спайк-скрипты `media/render-spike.ts` (синтетические входы) и `tts/tts-spike.ts`
  (реальная озвучка → ASS → MP4 → ffprobe); запуск через `tsx`.

**Проверено:**

- R1 (синтетика): MP4 1080×1920, 30 fps, h264+aac 48 kHz, 2.70 s, 902 KB;
  −14.0 LUFS; кадр на 1.0 s — «караоке» подсвечено жёлтым, кириллица рендерится.
- R2a (ElevenLabs, `eleven_multilingual_v2` + premade-голос `Xb7hH8MSUJpSbSDYk0k2`):
  озвучка 89 KB за 791 ms, 11 слов, последнее слово кончается на 5.53 s;
  итог 1080×1920, 30 fps, 5.60 s, 1.84 MB; кадр на 2.10 s — жёлтым «воздуха», точно по
  таймингу 2.02–2.44.
- Двухпроходный loudnorm: −14.44 LUFS, true peak −1.43 dBTP (однопроходный давал −15.4).
- `pnpm check` — зелёный: контракты 18, API 22, worker 14, web 32.

**Найденные ограничения провайдера:**

- Бесплатный план ElevenLabs не даёт использовать library-голоса через API
  (`402 paid_plan_required`); premade-голоса работают. `voices_read` у ключа должен быть
  включён, иначе список голосов не читается.
- Free tier — некоммерческая лицензия, а default-голоса удаляются 31.12.2026. Для
  публикуемого контента нужен минимум Starter ($5–6/мес, 30k кредитов ≈ 30 мин TTS).
- Ключ DeepSeek в `.env` пока заглушка (401) — R2b не начат.

**Осталось:**

- R2b: генерация скрипта через DeepSeek (нужен рабочий ключ).
- R3: TikTok `FILE_UPLOAD` → `SELF_ONLY` (нужны приложение и приватный аккаунт).
- Перенести спайки в стадийные job'ы worker'а и `artifacts` — после R3.

