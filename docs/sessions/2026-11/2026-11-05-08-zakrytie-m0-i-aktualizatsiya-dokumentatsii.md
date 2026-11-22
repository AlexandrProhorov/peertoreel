## 2026-11-05 — Закрытие M0 и актуализация документации

**Цель:** закрыть M0 по acceptance и убрать расхождения между кодом, README,
ARCHITECTURE и ROADMAP.

**Сделано:**

- ROADMAP: M0 → `DONE`, M2 → `DOING`; acceptance дополнен проверкой worker'а и уточнением
  про CI/секреты. Добавлена дата закрытия M0.
- README: убран устаревший статус «M0, AI-стадий нет»; описаны реальные стадии
  `script/voiceover/render`, S3-артефакты, readiness с worker'ом и актуальные ограничения.
  Пример bootstrap-пароля заменён на placeholder, добавлено напоминание про `.env`.
- ARCHITECTURE: текущий срез M0 → «M0 закрыт, M2 в работе»; worker забирает jobs из
  `system/script/voiceover/render`; S3 используется для артефактов; readiness проверяет
  Postgres/Redis/worker; обновлены следующие архитектурные шаги.
- Web shell: футер `Pipeline foundation · M0` → `Pipeline core · M2`.
- `pnpm install --frozen-lockfile` и `pnpm db:migrate` проходят.
- `pnpm check` — зелёный: contracts 29, storage 3, db 2, web 60, worker 19, API 21 (134 теста).
- `GET /health/live` → 200; `GET /health/ready` → 200,
  `checks: { database: 'up', redis: 'up', worker: 'up' }`.
- `POST /system/ping` → job `completed` за ~487 мс, прогресс через SSE 10 → 50 → 90 → 100.
- Сканирование tracked-файлов не нашло секретов; `.env` в `.gitignore`, в репозитории только
  `.env.example` и placeholder'ы.

**Ограничение:** удалённый CI-run не проверялся (нет `gh`, репозиторий недоступен через
публичный GitHub API); workflow `ci.yml` повторяет локальные гейты, которые прошли.

