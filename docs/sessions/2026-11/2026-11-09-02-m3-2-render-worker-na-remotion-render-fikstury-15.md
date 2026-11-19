## 2026-11-09 — M3.2: render worker на Remotion + рендер фикстуры «−15°»

**Цель:** отдельный `apps/render-worker` рендерит сцены раскадровки в беззвучные
1080×1920/30 mp4, пригодные для текущей FFmpeg-сборки; проверить это на фикстуре.

**Сделано:**

- `apps/render-worker` (`@peertoreel/render-worker`): React/Remotion существует только здесь;
  TypeScript, `tsx`, Vitest, oxlint, отдельные `tsconfig.json`/`tsconfig.build.json`.
- `src/composition/`: композиция `Scene` (`SceneComposition`), `calculateMetadata()` считает
  `durationInFrames = round(scene.durationSec * 30)`, `inputProps = { scene, style, wordTimings? }`,
  Zod-валидация на входе.
- `src/components/`:
  - `ParallaxCity` — ночной город, два плана зданий, снег, фонарь, дорога, камера
    (pan/zoom/tilt/dolly/orbit), детерминированный `random(seed)`;
  - `KineticTypography` — тёмный фон, сетка, акцентное свечение, zoom по `camera.speed`;
  - `SceneObjects` — общий слой объектов: текст с pill-подложками, снег/пар, конусы света,
    иней, силуэт автомобиля, шкала батареи; появление/исчезновение по окнам и
    `syncToWord`-акценту.
- `src/mapping.ts` — в M3.2 реализованы только `parallax-city` и `kinetic-typography`;
  image/ai-сцены и неизвестные компоненты деградируют в `fallback`, затем в generic
  `kinetic-typography`. Ни одна сцена фикстуры не падает.
- `src/timing.ts` — перевод абсолютных окон объектов в clip-local секунды, поиск
  `syncToWord` по нормализованному токену, округление до миллисекунд.
- `src/render.ts` — `bundle()` один раз на процесс, `selectComposition()` + `renderMedia()`:
  h264, `yuv420p`, `bt709`, CRF 18, `concurrency: 1`, `muted: true`; выход без аудиодорожки.
- `src/cli.ts` — `render-fixture [--scene <idx>] [--out <dir>]`, пишет `scene-<idx>.mp4` и
  `render-fixture.json` с длительностями/размерами/временем; `src/ensure-browser.ts` —
  `ensureBrowser()` для Docker.
- Шрифты — локальные `@fontsource/montserrat/700.css` и `.../900.css` (woff2, OFL);
  `document.fonts.load()` для нужных весов + `delayRender()`/`continueRender()`.
- `infra/render-worker.Dockerfile`: Node 24 bookworm-slim, Chrome-зависимости,
  Remotion-managed Chrome Headless Shell, сборка contracts + render-worker.
- `.dockerignore`, `apps/render-worker/out/` в `.gitignore`.

**Проверено:**

- `pnpm check` — зелёный: contracts 104, render-worker 23, storage 3, tiktok 28, db 3,
  web 124, worker 96, API 64 (445 тестов), сборка проходит; initial bundle 326.09 kB.
- `pnpm --filter @peertoreel/render-worker render-fixture` — 6 сцен, 60 с суммарно,
  **140.1 с** на dev-машине. Docker-контейнер (non-root) — **147.6 с**.
- `ffprobe`: каждая сцена — h264, 1080×1920, 30 fps, `yuv420p`, `color_range=tv`,
  `color_space=bt709`, аудиодорожки нет; длительности 5.2/7.4/6.3/11.1/20/10 с.
- Склеивание через существующий `buildVisualConcatArgs` (`apps/worker/src/media/visual-track.ts`):
  `joined.mp4` — 60.0 с, 4 112 505 байт, 1080×1920/30, `yuv420p`, без аудио.
- Визуально проверены кадры: город/снег/фонарь/`-15°`, машина с паром, шкала `-40%`,
  `15 МИНУТ` + pill, машина с фарами, `ЗДОРОВЕЕ`/`ПОДПИСАТЬСЯ`. Кириллица отображается
  локальными шрифтами.
- Docker-образ `peertoreel-render-worker:test` собирается; контейнер рендерит все 6 сцен
  с volume-mount.

**Не проверено (вне scope M3.2):**

- `scene.transition` пока не рендерится: клипы склеиваются жёсткими cut'ами; переходы
  внутри окна сцены — M3.3/M3.4.
- Очередь `scene-render`, per-scene jobs, S3-запись `scene_clip` — M3.4.
- Полная библиотека из 6 компонентов (`image-parallax`, `infographic-gauge`,
  `particle-field`, `cta-card`) — M3.3.
- AI-изображения/видео, `provider_usage` — M3.6/M3.7.
- Storyboard UI — M3.8. `visuals_json`, render/FFmpeg, API, БД, state machine не менялись.
- Docker-образ пока содержит dev-зависимости (TypeScript/Vitest/oxlint/tsx); prune или
  multi-stage runtime — M3.4.
- `RENDER_TARGET` в FFmpeg-сборке и размеры сцены в render-worker заданы отдельно; вынести
  общий video-target в contracts до M3.4.
- Платных вызовов не было; реальная озвучка в фикстуре не использовалась.

**Следующая сессия:** M3.3 — полная библиотека компонентов v1; после неё quality gate на
полном 60-секундном черновике с реальной озвучкой.

### Теория сессии

- Remotion рендерит не «весь ролик», а отдельную сцену: это сохраняет per-scene
  регенерацию и текущую FFmpeg-сборку.
- `calculateMetadata()` — единственное место, где `durationSec` превращается в
  `durationInFrames`; композиция не угадывает длительность.
- React живёт только в render-worker; Angular и основной worker не получают React-зависимостей.
- `random(seed)` вместо `Math.random()`: два рендера одной сцены дают одинаковый кадр.
- Локальные woff2 + `document.fonts.ready` убирают «прыжок» шрифта на первых кадрах.
- `muted: true` + отсутствие аудио в композиции дают клип без аудиодорожки — ровно то,
  что ждёт `visual-track.ts`.
- `bundle()` кешируется на процесс: 6 сцен не пересобирают бандл шесть раз.
- Fallback-маппинг позволяет рендерить фикстуру до появления полной библиотеки компонентов,
  не подменяя контракт раскадровки.
- Docker с закреплённым Chrome важнее, чем кажется: рендер на Windows и Linux должен давать
  одинаковый результат.

