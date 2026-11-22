## 2026-11-08 — Исследование: программная анимация + AI video generation (research only)

**Цель:** техническое и экономическое исследование перехода от стоковых клипов (Pixabay) к
автоматизированному созданию оригинальных анимированных видео: AI-режиссёр (раскадровка) +
программный движок + точечные AI-ассеты/видео. Код не изменялся, зависимости не ставились.

**Сделано:**

- Анализ фактического кода пайплайна (стадии, контракты, worker, render, web) и точек
  расширения; зафиксированы расхождения AGENTS.md ↔ код (SSE vs polling, отсутствие модулей
  `scripts`/`projects`/`provider_usage`, `word_timings` вне contracts и др.).
- Веб-исследование пяти направлений: движки программной анимации (Remotion/Motion Canvas/
  Revideo/HyperFrames/GSAP/Lottie/Three.js/Blender), AI video/image generation API с
  ценами и региональными ограничениями (Sora закрыт, MiniMax H3, Veo 3.1, Kling, Seedance,
  FLUX/NB/Recraft), AI coding agents (OmniLottie: параметрический JSON 82–97% vs codegen
  0–12.7%), синхронизация (Whisper не нужен; MFA только для липсинка), инфраструктура.
- Итоговый отчёт: `docs/research/2026-11-08-ai-video-production-research.md`
  (разделы A–J + краткая выжимка); сырые отчёты потоков —
  `docs/research/ai-video-image-generation-apis-2026-11-08.md`,
  `C:\Temp\opencode\ai-animation-codegen-report-2026-11-08.md`.

**Ключевые выводы:**

- Движок — Remotion 4.0.x в изолированном render worker (React только там; Plan B — Revideo
  MIT); сцены рендерятся в mp4 и собираются **существующим** FFmpeg-конвейером без изменений
  (render уже потребляет `scene.asset.objectKey`).
- Основной путь генерации сцен — библиотека параметрических компонентов + Zod-раскадровка
  (`peertoreel.storyboard.v1`), codegen — аварийный люк в песочнице.
- Себестоимость: программный ролик $0.05–0.25, гибрид $0.8–4.5, полный AI-видео $6–18.
- Первый эксперимент: тема «−15°» (референс `docs/references/Screenshot_1.png`),
  5–6 различных сцен, ≤$0.5 (≤$2 с видео-сценой), ≤15 мин рендера.

**Следующая сессия (после согласования):** H1 — контракт `storyboard.v1` в contracts +
фиксстура раскадровки для темы «−15°».

