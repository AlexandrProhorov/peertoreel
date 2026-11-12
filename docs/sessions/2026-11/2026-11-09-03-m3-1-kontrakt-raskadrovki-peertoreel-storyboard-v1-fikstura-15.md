## 2026-11-09 — M3.1: контракт раскадровки `peertoreel.storyboard.v1` + фикстура «−15°»

**Цель:** зафиксировать модель данных AI-режиссёра контрактами и проверяемой фикстурой до
кода Remotion-рендера. Срез — contracts + worker imports + docs, без очередей, S3, API, БД и UI.

**Сделано:**

- `packages/contracts/src/json.ts` — рекурсивный `jsonValueSchema` / `JsonValue` и
  `jsonObjectSchema`; параметры компонентов больше не протекают как `unknown`.
- `packages/contracts/src/timings.ts` — `derivedWordSchema` / `derivedWordsSchema` /
  `DerivedWord` перенесены из worker; добавлена проверка `endSec >= startSec`.
- `packages/contracts/src/scene-part.ts` — общий `hook | beat | cta` для storyboard и
  стокового `visuals_json`, чтобы enum не разъезжался.
- `packages/contracts/src/storyboard.ts` — `peertoreel.storyboard.v1`: style, characters,
  audio, scene, objects, camera, transition, discriminated union
  `programmatic | image_animation | ai_video | hybrid`, обязательный `fallback`, версия
  сцены; проверки таймингов, окон объектов, `syncToWord` по токенам, непрерывности и
  уникальности сцен/объектов, `refs`/`refIds` по реестру персонажей, суммы длительностей и
  первого/последнего `part`.
- `packages/contracts/src/storyboard.fixture.ts` — 6 сцен «−15°» (город, машина с паром,
  аккумулятор, «15 МИНУТ», AI-видео-вставка, CTA) и детерминированные
  `wordTimingsFixture15Deg`; все `syncToWord` имеют тайминг внутри своей сцены.
- `packages/contracts/src/artifact.ts` — `storyboard_json`, `scene_clip`; русские ярлыки в
  `apps/web/.../artifact-labels.ts`.
- Worker: `DerivedWord`/`derivedWordsSchema` импортируются из `@peertoreel/contracts`;
  `deriveWordTimings()` остаётся в worker.
- `docs/adr/0012-storyboard-and-scene-render.md` — D1–D8, версия схемы, ключ сцены,
  `transition` как исходящее ребро внутри окна сцены, лицензия Remotion (≤3 человек —
  бесплатно, подтверждено 2026-11-09), `provider_usage` до M4.3.
- `AGENTS.md` §2/§3/§4/§6/§10 и `ROADMAP.md` синхронизированы с M3/M4/M5; пути к
  research/plan исправлены на фактические `docs/ignore/...` (файлы локальные, gitignored).

**По ревью (APPROVE WITH FIXES → исправлено):**

- `refs` и `implementation.refIds` зафиксированы как **id персонажей** из `characters[]`;
  `characters[].refImageKey` резолвит картинку. Добавлена проверка, что все ссылки
  существуют; в фикстуре `refImageKey: null`, поэтому image/ai_video-сцены до M3.6
  деградируют в fallback.
- `transition` — исходящее ребро в конце сцены; последняя сцена обязана быть `cut` с
  длительностью 0; переход не может быть длиннее сцены. `syncToWord` — акцент анимации,
  а `startSec` — начало видимости (хук начинается раньше слова «морозе»).
- Сцены обязаны быть непрерывными (допуск 0.05 с), а не просто не пересекаться; иначе
  возможна визуальная дыра при разрыве меньше секунды.
- Добавлены уникальность `scene.id`, уникальность `object.id` внутри сцены и требование
  `content` для `text`/`character`/`image`/`chart`. Покрыт `hybrid`-branch.
- `AGENTS.md` дополнен `apps/render-worker`, Remotion, очередью `scene-render` и новыми
  артефактами с пометками M3.2/M3.4/M3.5; scope M3.1 в ADR больше не утверждает, что
  worker-импорты не менялись.

**Проверено:**

- `pnpm check` — зелёный: contracts 102, storage 3, tiktok 28, db 3, web 124, worker 96,
  API 64 (420 тестов), сборка проходит; initial bundle 326.09 kB.
- `storyboardFixture15Deg` проходит `storyboardSchema.parse`; round-trip JSON;
  `wordTimingsFixture15Deg` проходит `derivedWordsSchema`.
- Негативные тесты: нет fallback, конец раньше начала, несовпадение `durationSec` с окном,
  `syncToWord` вне текста, окно объекта вне сцены, разрыв/пересечение сцен, поздний старт,
  неизвестный `componentId`, неизвестный персонаж, дубли id, последняя сцена не `cut`,
  текст без `content`, невалидный цвет/`schemaVersion`, не-JSON params.
- Worker и web собираются после переноса типов; `pnpm --filter @peertoreel/worker typecheck`
  и `pnpm --filter @peertoreel/web typecheck` — чистые.

**Не проверено (вне scope M3.1):**

- Реальный рендер сцен: Remotion, Chrome, шрифты, `apps/render-worker` — M3.2.
- Очередь `scene-render`, оркестратор и запись `scene_clip` в S3 — M3.4.
- Генерация раскадровки DeepSeek — M3.5; `image_animation`/`ai_video` — M3.6/M3.7.
- Storyboard UI — M3.8. `visuals_json`, render/FFmpeg, API, БД и state machine не менялись.
- Платных вызовов не было.

**Следующая сессия:** M3.2 — render worker bootstrap (Remotion), `parallax-city` и
`kinetic-typography`, рендер 6 сцен фикстуры в mp4; лицензия Remotion — бесплатный tier
(≤3 человек).

### Теория сессии

- Раскадровка — это контракт между AI-режиссёром и движком: LLM отдаёт постановку в JSON,
  а не код и не пиксели, поэтому один и тот же вход детерминированно исполняется компонентами.
- `word_timings.json` — источник истины по времени; `durationSec` сцены производная, иначе
  картинка начнёт спорить с озвучкой.
- `syncToWord` проверяется по токенам, а не подстрокой: «кот» не должен совпадать с
  «который», иначе анимация привяжется к случайному слову.
- `syncToWord` — акцент анимации, а `startSec` — начало видимости; поэтому заголовок хука
  может появиться раньше слова, на котором он «вспыхивает».
- Обязательный `fallback` на каждой сцене превращает отказ AI-продюсера в деградацию одной
  сцены, а не в `FAILED` всего run'а.
- `JsonValue` вместо `unknown` сохраняет публичные типы проверяемыми: параметры компонентов
  открыты по форме, но закрыты по типу.
- `transition` в v1 — исходящее ребро в конце сцены; у последней сцены нет наследника,
  поэтому только `cut` с нулевой длительностью. Перекрытие таймлайна (xfade с handles) —
  отдельное решение, иначе сумма сцен перестаёт сходиться с длительностью аудио.
- `scene.refs`/`implementation.refIds` — id персонажей, а не ключи S3: картинка резолвится
  через `characters[].refImageKey`, поэтому реестр персонажей остаётся единственным.
- Фикстура «−15°» — не продуктовая тема, а golden sample: она покрывает programmatic,
  image_animation и ai_video ветки, а `hybrid` проверяется отдельным тестом; LLM, TTS и S3
  для неё не нужны.
- Контракты проверяются до появления рендера: ошибка в схеме стоит минуты, ошибка в
  формате на этапе M3.4 стоила бы переделки очереди и артефактов.

