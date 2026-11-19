# 2026-11-14 — M3.6b.7.1: `cartoon-character` рига

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-m3-6b-7-1-cartoon-character-rig-session.md`

## Цель

Процедурный ведущий как компонент сцены: 5 эмоций, 2 позы, детерминированная idle-анимация,
без растровых ассетов и сети.

## Результат

- Контракт: `cartoon-character` в `STORYBOARD_COMPONENT_IDS`; params `preset: host`,
  `emotion` (neutral/happy/surprised/angry/sad), `pose` (idle/wave), `anchor` (left/center/right),
  цвета `accent`/`skin`/`hair`/`ink`, `bob`. Схема и дефолты включены в общий
  `parseComponentParams`, невалидные значения дают `invalid_value`.
- `apps/render-worker/src/character.ts` — чистая `characterLayers(params, frame, fps)`:
  руки, кисти, корпус, шея, уши, голова, волосы, глаза, зрачки, брови, рот; эмоция меняет
  брови/рот/глаза, `wave` поднимает правую руку поворотом точки вокруг плеча, `bob` даёт
  дыхание (sin от кадра/fps).
- `components/CartoonCharacter.tsx` — только маппинг фигур в SVG и `anchor`; никакой геометрии.
- `mapping.ts` и `SceneComposition.tsx` — компонент зарегистрирован как реализованный.
- Пример `examples/cartoon-character.json`: 5 сцен по эмоции, `anchor` right/left/center,
  красный accent у злости.
- Приёмка: 5 клипов по 3 с, 1080×1920/30, h264 yuv420p; кадры для ревью в `out/m3-6b-7/frames/`.

## Изменённые файлы

- `packages/contracts/src/storyboard.ts`, `storyboard.components.ts` — id, схема, дефолты.
- `apps/render-worker/src/character.ts`, `character.spec.ts` — геометрия и тесты.
- `apps/render-worker/src/components/CartoonCharacter.tsx` — SVG-рендер.
- `apps/render-worker/src/mapping.ts`, `composition/SceneComposition.tsx` — регистрация.
- `apps/render-worker/examples/cartoon-character.json` — приёмочный storyboard.

## Решения

- Персонаж — человек-ведущий; животное будет отдельным preset.
- Геометрия живёт в чистой функции, React только рисует; тесты не запускают Chrome.
- Цвета — params, не чтение стиля: компонент получает только `params`.
- Поворот руки считается в данных, а не `transform` в JSX — так тестируемы и координаты, и поза.

## Отклонения от плана

- Idle-рука не качается: иначе не выполнялось обещанное «заморозка при `bob: 0`».
- Эмоция `happy` прищуривает глаза (`ry` меньше), а не только улыбается — иначе лицо почти
  не отличалось от neutral на кадре.

## Не проверено

- Визуальная оценка человеком — кадры 0–4 просмотрены, артефактов не видно; финальный балл
  за ревьюером.
- Реальная композиция с текстом поверх персонажа на длинном ролике — `Not verified`.

## Блокеры и следующий шаг

- M3.6b.7.2: аксессуары, поза `point`, интеграция в рецепты/директора; плана нет.
- M3.6c дизайн-кит (`fallbackIcon`-промоушен, `role`, promote) — план не создан.
