## 2026-11-10 — Roadmap reset: renderer-first, recipes, end-to-end

**Цель:** сверить read-only аудит с планом из пяти этапов, пересобрать M3 без преждевременной
очереди/asset system и подготовить промпт следующей сессии.

**Сделано (только документы, код не менялся):**

- Проведён read-only аудит пайплайна: Remotion не подключён к API/worker/S3; render stage
  использует Pixabay + FFmpeg; `params`, `camera.shot`/`parallax`, `transition`, `effects`,
  `refs` и `imagePrompt` рендерером не читаются; `scene_clip`/`storyboard_json` не имеют
  producer/consumer; `mapping.ts` молча уводит неизвестный компонент в `kinetic-typography`.
- `ROADMAP.md`: M3.3–M3.7 пересобраны в порядке renderer-first → recipes → end-to-end spike →
  asset library/generator → production hardening. Старые номера M3.4–M3.8 переопределены;
  M3.1/M3.2 остаются DONE.
- `docs/adr/0014-m3-renderer-first-roadmap.md`: решения D1–D7 (data-driven renderer, recipes
  before queue, two-topic spike, assets after vocabulary, hardening last, explicit unknown
  components, one style v1).
- `docs/adr/0012-storyboard-and-scene-render.md`: статус дополнен ссылкой на ADR-0014.
- `apps/render-worker/AGENTS.md`: правила data-driven рендера, params, camera, assets,
  determinism, timing, output, recipes, tests.
- `AGENTS.md`: добавлен render-worker в app-specific список; обновлены M3.3 renderer, video gen
  (M4.8), stage table (topic-discovery/research planned, `scene_clip` M3.7, `ImageProvider`
  M3.6), SSE↔polling, таблицы БД (implemented vs planned), очередь `scene-render` (M3.7),
  testing targets и hard rule 9 (unknown component fails explicitly).
- `apps/api/AGENTS.md`: список модулей приведён к фактическому (`runs`, `publish`, `system`,
  `health`, `storage`, `database`, `redis`, `config`, `common`; остальные — planned).
- `docs/ignore/plans/2026-11-10-m3-3-renderer-foundation-session.md`: готовый промпт следующей
  сессии (data-driven CLI, params, explicit unknown components, unified video target, local
  asset mechanism, acceptance/commands).
- Промпт M3.3 уточнён по ревью: invalid params ≠ missing params (per-field default +
  diagnostics), resolved scene (`componentId/params/source/diagnostics`, компонент не знает
  `source`), video target как спецификация с отдельными адаптерами Remotion/FFmpeg,
  обязательный `examples/custom-storyboard.json` + boundary test, проверки seed/order
  determinism, правило «сначала таблица текущее → требуемое, без рефакторинга вне scope».

**Сильные расхождения с аудитом (осознанно приняты):**

- Аудит ставил `scene-render` queue и `scene_clip` в Phase 2; новый план — M3.7. Причина:
  сначала доказать визуальную связность на двух темах, потом строить очередь. M3.5 использует
  CLI/скрипт и существующий `buildVisualConcatArgs`.
- Аудит ставил asset resolver/generator в Phase 3; новый план — M3.6. Следствие: M3.5 —
  ограниченный spike на procedural/SVG, не «любой промпт». Произвольные темы блокируются до
  M3.6.
- Аудит предлагал vision QC раньше; новый план — M3.7. Компенсация: в M3.5 обязателен ручной
  визуальный review, автоматический QC не обещаем.
- Текущий `mapping.ts` нарушает требование «не маскировать неизвестный компонент»; M3.3
  удаляет generic fallback. Фикстура CTA имеет `cta-card` fallback, который не реализован —
  в M3.3 нужно либо заменить fallback в данных на реализованный, либо сделать минимальный
  `cta-card`.
- `apps/api/AGENTS.md` и root `AGENTS.md` содержали несуществующие модули/таблицы/SSE;
  исправлено на фактическое состояние с пометкой planned.
- `processScriptStage` не проверяет `RESEARCHING` (в отличие от остальных стадий) — известный
  gap, не входит в M3.3, зафиксирован для отдельного fix.
- Research/fact-check стадии в коде нет; для «почему»-тем это остаётся фактическим риском.

**Проверено:** только чтение и документы; `pnpm check` не запускался, код не менялся.
**Следующая сессия:** M3.3 по промпту
`docs/ignore/plans/2026-11-10-m3-3-renderer-foundation-session.md`.

