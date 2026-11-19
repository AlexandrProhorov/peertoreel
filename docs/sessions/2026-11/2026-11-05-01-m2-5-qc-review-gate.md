## 2026-11-05 — M2.5 QC + review gate

**Цель:** автоматическая проверка черновика перед human gate: длительность, громкость,
синхронизация, стоп-слова, `is_aigc`, читаемость; отчёт в UI; «Одобрить» только после
успешного/предупреждающего QC.

**Сделано:**

- Контракты `qc.ts`: `qcReportSchema` (`verdict`, checks, metrics, createdAt), проверки
  `duration/loudness/sync/stop_words/aigc/readability`.
- Очередь/стадия `qc` (`REVIEW → REVIEW`, concurrency 1), worker и failure handling.
- `qc.processor.ts`: качает draft, `ffprobe` (длительности и разрывы аудио-пакетов),
  `loudnorm`-замер, правила, `qc_report.json` в S3 + artifact.
- `render` теперь удаляет старый `qc_report` и объект при новом draft: отчёт всегда
  относится к текущему файлу.
- API: `GET /runs/:id/qc` (404, пока отчёта нет), `StorageService.getObject`.
- Web: `qcReport` в detail store, `stageToRun` показывает QC до отчёта, блокирует
  «Одобрить» при `fail`; QC-карточка с verdict/checks/metrics и «Перепроверить»;
  комментарий и danger-зона не конфликтуют с гейтом.
- ADR-0009, AGENTS §4/§6/§9, ARCHITECTURE, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 40, storage 3, db 2, web 67, worker 91, API 25
  (228 тестов), сборка проходит.
- Живой QC на run `4939b8a8-59aa-4b4f-9e82-bb835565c8ce`:
  - до запуска `GET /runs/:id/qc` → 404;
  - `POST /stages/qc` → job completed; `qc_report` создан;
  - verdict `warn`: `loudness=-14.6 LUFS, true peak=-1.0 dBTP` — единственный warn;
  - duration 47.9 s, sync pass (разрыв 0.088 s), stop-words pass, AIGC pass,
    readability 131.5 слов/мин — pass;
  - run остался в `REVIEW`, «Одобрить» доступно (warn ≠ fail).
- QC не меняет состояние run'а и не вызывает LLM.

**Осталось:**

- S1 — TikTok publish risk spike.
- Retry/next-candidate на transient-ошибки скачивания Pixabay.
- Ручная замена сцены в review.
- `provider_usage`/cost ledger и `scenes` table — отдельные milestone'ы.

