## 2026-11-10 — M3.3: renderer foundation (data-driven Remotion)

**Ветка:** `feat/m3-3-renderer-foundation` (от `main`).

**Цель:** Remotion рендерит произвольный валидный `storyboard.v1` через CLI, params доходят до
компонентов с диагностикой, неизвестный компонент падает явно, video target вынесен в
контракты, локальные ассеты имеют механизм.

**Таблица «текущее → требуемое» (составлена до правок):**

| Область | Текущее поведение | Требуемое изменение |
|---|---|---|
| Params | `implementation.params`/`fallback.params` — JSON, который никто не читает | Zod-схема + defaults для каждого `componentId`; `parseComponentParams()` → `{ params, diagnostics }` |
| Диагностика | нет; ошибка входа не видна | `params_missing` / `invalid_value` (path, received) / `unknown_key`; default только проблемного поля (`$` — для всего объекта) |
| Mapping | `{ componentId, source }`, generic-ветка `kinetic-typography` | `{ componentId, params, source, diagnostics }`; generic-ветки нет; нет ни implementation, ни реализованного fallback → typed error |
| Компоненты | `ParallaxCity`/`KineticTypography` читают только `scene`/`style` | Читают `params`: `buildingsSeed`, `lamp`, `snowDensity`, `focus`, `roadGlow`; `text`, `accentWords`, `preset`, `align`, `underline` |
| Composition | Сам вызывает `resolveSceneComponent(scene)` | Получает resolved `componentId`/`params` в input props; `source`/`diagnostics` не передаются в компонент |
| Fixture CTA | `fallback.componentId: 'cta-card'` (не реализован) | Fallback в данных → `kinetic-typography`; фикстура продолжает рендериться без generic-подмены |
| Video target | `SCENE_*` в render-worker и `RENDER_TARGET` в worker живут отдельно | `VIDEO_TARGET` в contracts; Remotion и FFmpeg мапят его каждый по-своему; цветовые флаги FFmpeg не добавляются без `ffprobe` |
| CLI | только `render-fixture`, fixture импортируется в composition | `render-storyboard --input <json> [--scene] [--out]`; fixture импортируется только в CLI; `composition/` и `components/` не знают фикстуру |
| Пример | нет | `apps/render-worker/examples/custom-storyboard.json` — другая тема, только реализованные компоненты, другие params |
| Ассеты | нет | `public/assets/`, `bundle({ publicDir })`, `staticFile` + чистый resolver (local/http/data) с тестом |
| Манифест | fixture/runId/сцены, без params | kind, input, runId, styleId, scene component/source/params diagnostics, размеры/время |
| Тесты | mapping без params, нет boundary test | params defaults/invalid/missing/unknown, mapping fallback/error, custom JSON, boundary test, video-target adapters |

**Сделано:**

- `packages/contracts/src/storyboard.components.ts` — Zod-схемы и defaults для всех шести
  `componentId`; `parseComponentParams()` возвращает `{ params, diagnostics }` с
  `params_missing` / `invalid_value` (path + received, в т.ч. `accentWords.1`) /
  `unknown_key`; неизвестный компонент → `UnknownStoryboardComponentError`.
- `packages/contracts/src/video.ts` — единая спецификация `VIDEO_TARGET` (1080×1920/30,
  h264, `yuv420p`, BT.709, без аудио). Экспортирована из `contracts/index.ts`.
- Fixture CTA: `fallback.componentId` изменён с нереализованного `cta-card` на
  `kinetic-typography` (данные, не скрытая подмена). Остальные fallback'и уже реализованы.
- `apps/render-worker/src/mapping.ts` — resolved scene
  `{ componentId, params, source, diagnostics }`; generic-ветка удалена; оба
  нереализованных компонента дают `UnsupportedSceneComponentError`; `resolvedScenePropsSchema`
  отрезает `source`/`diagnostics` перед Remotion.
- `props.ts` — `resolved` в input props + нейтральные preview-props вместо импорта фикстуры;
  `SceneComposition` больше не выбирает компонент, а рендерит по resolved union; `render.ts`
  резолвит сцену один раз и возвращает component/source/diagnostics в CLI.
- `ParallaxCity` читает `buildingsSeed`, `lamp`, `snowDensity`, `focus`, `roadGlow`;
  `KineticTypography` — `text`, `accentWords`, `preset`, `align`, `underline` (ghost-headline,
  акцентные слова, pill/outline, подчёркивание). Значения видны в кадре.
- `render.ts`: `bundle({ publicDir })`, `SCENE_RENDER_MEDIA_OPTIONS` из `VIDEO_TARGET`;
  `assets.ts` — чистый resolver `local | http | data` + `staticFile`/`assetUrl`,
  `public/assets/test-scene.svg`.
- `cli.ts`: `render-storyboard --input <json> [--scene] [--out]`, валидация `storyboardSchema`
  с понятными путями; `render-fixture` остался shortcut'ом; манифест (`render-fixture.json` /
  `manifest.json`) содержит kind/input/runId/styleId/component/source/diagnostics/размеры/время.
- `apps/worker/src/media/video-target.ts` — FFmpeg-адаптер спецификации; `ffmpeg.ts` и
  `visual-track.ts` берут размеры/fps/кодек/pix_fmt из него. Цветовые флаги не добавлялись.
- Тесты: contracts 11 новых (params), render-worker mapping/props/assets/boundary/examples/
  video-target, worker video-target. Boundary test падает, если `render.ts`, `composition/**`
  или `components/**` упомянут fixture-символы.
- Docs: ADR-0012 раздел M3.3, README (команда и путь к примеру). `AGENTS.md` не менялся —
  правила уже описывали именно это поведение.

**Принятые решения:**

- **CTA fallback** — изменён в данных на реализованный `kinetic-typography`, а не реализован
  новый `cta-card`: это дешевле и не раздувает scope; `cta-card` остаётся на M3.4+.
- **`image-parallax` stretch не взят.** Локальные ассеты — только механизм (`publicDir`,
  `staticFile`, resolver, тестовый SVG). Визуальное потребление ассетов — M3.6.
- **FFmpeg color flags не добавлены:** `ffprobe` до и после показывает bt709 на клипах и на
  склейке; менять кодирование вслепую запрещено планом.
- **Resolution один раз:** `render.ts` резолвит сцену, composition получает только
  `componentId`/`params`; `source`/`diagnostics` остаются в CLI/манифесте и в компонент не
  попадают.

**Проверено:**

- `pnpm check` — зелёный: contracts 114, render-worker 49, worker 100, web 124, API 64,
  storage 3, db 3, tiktok 28 (485 тестов); lint/typecheck/build проходят; initial bundle
  326.09 kB.
- `render-fixture` — 6 сцен, **143.3 с** на dev-машине; `render-storyboard` с
  `examples/custom-storyboard.json` — 4 сцены, **75.0 с**.
- `ffprobe`: все клипы — h264, 1080×1920, 30 fps, `yuv420p`, `color_range=tv`,
  `color_space/primaries/transfer=bt709`, аудиодорожки нет. Длительности 6/8/8/6 с.
- Склейка через обновлённый `buildVisualConcatArgs`: 28.0 с, 1 935 695 байт, те же
  h264/1080×1920/30/`yuv420p`/bt709, без аудио.
- Детерминизм (custom scene 0): полный прогон, одиночный рендер и рендер после scene 1 в том
  же процессе дали **одинаковый SHA-256** и одинаковый `framemd5`; вариант только с
  `buildingsSeed: 2027` отличается по SHA-256 и по раскладке зданий (фонарь/текст/кадр на
  месте).
- Невалидные params (`buildingsSeed: "hello"`, `snowDensity: -100`): сцена рендерится на
  дефолтах, лог и `manifest.json` содержат оба `invalid_value` с path/received.
- Storyboard с `implementation: image-parallax` и `fallback: cta-card`: CLI завершается
  ошибкой `Scene "city-hook" cannot be rendered: component "cta-card" is not implemented…`,
  exit code 1.
- Визуально проверены кадры: фикстура (город, kinetic `15 МИНУТ`, CTA `ЗДОРОВЕЕ`) и custom
  (город с lamp=left, `ТЕПЛО В КАМНЕ`, `+3 °C`, pill `ГОРОД ГРЕЕТ СЕБЯ`); params реально
  меняют кадр.
- `examples/custom-storyboard.json` проходит `storyboardSchema`, все сцены резолвятся в
  реализованные компоненты, params отличаются от фикстуры (проверяется тестом).

**Не проверено (вне scope M3.3 или требует отдельного прогона):**

- Docker-образ `peertoreel-render-worker:m3-3` собирается (`docker build -f
  infra/render-worker.Dockerfile`); Chrome Headless Shell скачивается на этапе сборки. Рендер
  custom scene 0 внутри контейнера работает (21616 мс, 507 707 байт), `public/assets` и
  `examples/` попали в образ, `ffprobe` контейнерного клипа — h264/1080×1920/30/`yuv420p`/bt709,
  без аудио.
- Кросс-платформенный пиксельный паритет Windows↔Docker не подтверждён: декодированный кадр
  той же сцены отличается (шрифтовой/Chrome-растеризация), хотя формат и параметры совпадают.
  Детерминизм проверен в пределах одной платформы.
- Финальная сборка с озвучкой/loudnorm не перезапускалась: проверен concat и метаданные, а не
  полный draft с ASS/аудио. Изменение в `ffmpeg.ts` — только общий codec-адаптер.
- `camera.shot`, `camera.parallax`, `scene.transition`, `effects`, рецепты, DeepSeek,
  `scene-render` queue, `scene_clip`, fal.ai/S3, review UI — не входили в M3.3.
- `infographic-gauge`, `image-parallax`, `particle-field`, `cta-card` по-прежнему не
  реализованы; их сцены обязаны иметь явный реализованный fallback.

**Следующая сессия:** M3.4 — Scene Recipes v1 по промпту
`docs/ignore/plans/2026-11-10-m3-4-scene-recipes-session.md`.

### Теория сессии

- Params — такой же контракт, как форма JSON: без Zod-схемы «любой объект» превращается в
  набор магических ключей, которые никто не проверяет.
- Диагностика на уровне поля важна потому, что один `.catch()` на весь объект теряет путь:
  рендер выживет, но причина деградации исчезнет из логов.
- Resolved scene разделяет два решения: «что рендерить» (mapping/fallback) и «как рисовать»
  (компонент). `source` остаётся снаружи, чтобы компонент не мог передумать.
- Явная ошибка неизвестного компонента лучше generic-заглушки: заглушка скрывает дыру в
  библиотеке и ломает доверие к визуальному результату.
- Video target — спецификация, а не объект опций: Remotion и FFmpeg по-разному выражают одно
  и то же, и слепое копирование флагов между ними ломает уже проверенный output.
- `random(seed)` в Remotion — чистая функция от ключа, поэтому детерминизм достигается
  пространством имён seed'ов, а не хранением состояния.
- Порядок сцен не должен влиять на кадр: один bundle и один процесс не значат общий mutable
  state; тест «scene 0 после scene 1» это проверяет.
- Boundary test на fixture — дешёвая защита от возврата к «рендереру одной темы»: он падает
  не на поведении, а на импорте.
- Локальные ассеты должны быть входными данными (`staticFile`/ключ), а не сетевым вызовом из
  компонента: иначе рендер сцены зависит от S3/fal.ai и перестаёт быть детерминированным.

