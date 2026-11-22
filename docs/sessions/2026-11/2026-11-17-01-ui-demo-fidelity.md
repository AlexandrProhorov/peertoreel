# 2026-11-17 — UI-demo: интерфейсное повествование, контракты и fidelity-слой

**Статус:** DONE · **Ветка:** `feat/m3-animated-factory`
**План:** `docs/workspace/plans/2026-11-17-ui-demo-fidelity-gate.md` (следующий срез)

## Итог

Собран изолированный пилот интерфейсного повествования (`apps/render-worker/src/ui-demo`):
10 устройств, 11 примитивов, spec renderer, DOM-линтер, quality-gate и семантический слой.
Проведены три эксперимента на LLM (идеи → сопоставление → смысл). Главный вывод: узкое место
сместилось с реализации на смысл — 8 из 11 принятых сопоставлений деградировали замысел.

## Что сделано

- Пилот: 3 устройства → 7 → 10 (`input-transform`, `impact-arrival`, `scale-break`),
  примитивы `stage/card/pill/bubble/avatar/object/label/thumb/track/grid/line`, токены и темы.
- Паритет: `prompt-card` на примитивах отрендерен побайтово идентично дорефакторной версии.
- Детерминизм: кадры совпадают между процессами (PNG), mp4 — нет (энкодер); `--verify` и `--stills`.
- Линтер: DOM-измерения в реальном рендере, safe zones, клиппинг, пересечения, шрифт, контракт.
- Контракты и валидатор `CompositionSpec`; quality-gate (иерархия, акцент, контраст, плотность).
- Семантика: реестр поведений с сигнатурой (5 измерений), evidence-цитаты, маппинг
  known/proposed, две оси (identity × executability), CLI `ui:fidelity`.
- Эксперименты: Pass 1 (идеи), Pass 2 (reuse/compose/create), контрактная проверка,
  v6 (требования), v7 (нормализация), v8 (по биту, evidence + независимое ревью).

## Ключевые файлы

- `apps/render-worker/src/ui-demo/{behaviors,fidelity,catalog,composition,quality}.ts`
- `apps/render-worker/src/ui-demo/{SpecRenderer,UiScene,UiEpisode,cli}.tsx`
- `apps/render-worker/src/ui-demo/lint/*`, `motion/*`, `variants/*`, `primitives/index.tsx`
- `docs/workspace/plans/2026-11-17-ui-demo-fidelity-gate.md`

## Проверки

- `pnpm --filter @peertoreel/render-worker typecheck|lint|test` — зелёные, **213** тестов.
- `ui:lint` по эталону (9 сцен), механизмам (3), spec (1), behaviors (2) — 0 нарушений.
- Рендеры: эталон 26.2 с, механизмы 8.6 с, generated 33.6 с, behaviors 6 с.
- Паритет: mp4 идентичен по хешу; детерминизм кадров подтверждён PNG-хешами.

## Ограничения / Not verified

- Композиции визуально беднее устройств: quality-gate отсекает, но «смотрибельность» не измерена.
- `reuse` в эксперименте ни разу не выбрал реальное устройство без подсказки — retrieval слабый.
- Существующий production-путь не затронут; подключение пилота к пайплайну — отдельное решение.
- Изменения не закоммичены (по запросу): контракты, примитивы, fidelity, quality.
- Judge — LLM; его вердикт субъективен и требует собственного контроля.

## Уроки

- Ограничения промпта лечат симптом: без проверяемого гейта модель либо подгоняет идею под
  известное, либо переименовывает известное в новое.
- Новизна поведения и отсутствие возможностей — разные оси; их слияние даёт ложные `create`.
- Creative fidelity нужно мерить отдельно: рост reuse может ухудшать замысел.
