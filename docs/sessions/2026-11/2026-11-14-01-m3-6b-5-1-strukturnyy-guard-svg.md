# 2026-11-14 — M3.6b.5.1: структурный guard SVG

**Статус:** DONE
**Ветка:** `feat/m3-animated-factory` · **План:** `docs/workspace/plans/2026-11-14-m3-6b-5-1-svg-structural-guard-session.md`

## Цель

Ловить изометрию и «верхнюю грань» в сгенерированном SVG до рендера: нарушение считается
невалидной попыткой, запускает corrective retry, после двух попыток слот уходит в Tier 0.

## Результат

- Новый модуль `packages/providers/src/svg-structure.ts`: `inspectSvgStructure(svg)` возвращает
  `{ code, reason, element }`.
- `top_face_polygon`: закрытый четырёхугольник (2 горизонтальных + 2 наклонных ребра), нижнее
  ребро лежит на верхнем ребре `rect`-корпуса (|Δy| ≤ 6, перекрытие ≥ 60 %), площадь ≥ 2 %
  холста. Вчерашний `M80 212h224l28-34H108z` + `rect y=210` детектируется.
- `perspective_transform`: любой `transform` в документе.
- `DeepSeekSvgProvider`: проверка идёт после allowlist и до `normalizeSvg`; нарушение → `invalid`,
  причина уходит в corrective prompt; после `DEEPSEEK_SVG_MAX_ATTEMPTS` — `InvalidAssetError`
  с реальным usage, резолвер делает fallback (механизм M3.6b.5 без правок).
- `provider_usage.meta.structureViolations` хранит коды по каждой попытке.
- Тесты: 7 кейсов инспектора (плохой роутер, чистый роутер, крыша-треугольник, отдельная
  трапеция, мелкий четырёхугольник, skew, кривые пути) + retry и падение с usage в провайдере.

## Изменённые файлы

- `packages/providers/src/svg-structure.ts` — инспектор (новый).
- `packages/providers/src/index.ts` — экспорт.
- `packages/providers/src/deepseek-svg.ts` — вызов проверки, `structureViolations` в мете.
- `packages/providers/src/svg-structure.spec.ts`, `deepseek-svg.spec.ts` — тесты и фикстуры.
- `docs/adr/0017-asset-library-and-resolver.md` — D14.

## Решения

- Guard жёсткий по умолчанию, без env-флага: ложное срабатывание стоит один retry, пропуск —
  брак в ролике.
- Проверка на сыром ответе модели: нормализация не должна маскировать геометрию.
- `transform` запрещён целиком — стиль плоский и осевой.
- v1 понимает `rect`, `polygon` и пути `M/L/H/V/l/h/v/z`; кривые `C/Q/A` пропускаются.

## Отклонения от плана

- Нумерация: срез назван M3.6b.5.1, чтобы не занять M3.6b.6 (raster-cutout) и M3.6b.7
  (`cartoon-character`).
- Живой прогон под guard'ом не делали — по решению «по рекомендациям» ограничились фикстурами.

## Не проверено

- Поведение реальной модели на старом промпте «вид три четверти» под guard'ом — `Not verified`.
- Ложноположительные срабатывания на будущих темах — данных пока нет.

## Блокеры и следующий шаг

- Дальше по плану: M3.6b.6 raster-cutout или M3.6c дизайн-кит; плана нет.
- Хвост: 12 сиротских S3-объектов M3.6b.1, `--prune` не сделан.
