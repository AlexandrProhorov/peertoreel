## 2026-11-08 — M1.2b: очередь публикации + кнопка в publish card

**Цель:** публиковать в TikTok из UI, без CLI-команды, с прогрессом и без дублей.

**Сделано:**

- Контракты: очередь `publish`, job `tiktok-publish`, детерминированный `publish-<runId>`,
  `tiktokPublishAvailability` (аккаунт + снапшот job).
- API: `POST /runs/:id/tiktok-publish` (202; проверяет `SCHEDULED`, карточку, явную
  приватность, активный аккаунт и scope `video.publish`), `GET .../tiktok-publish/job`,
  `GET .../tiktok-publish` для восстановления после F5. Очередь `PublishQueue` с
  дедупликацией job id.
- Worker: процессор `publish` — `SCHEDULED → PUBLISHING → PUBLISHED/FAILED` с audit-записями;
  `publish_id` пишется в карточку до чанков, повторный job возобновляет status-polling вместо
  нового `video/init`; терминальные ошибки → `UnrecoverableError`, финальный retry помечает
  run `FAILED` с `resume_state=SCHEDULED`. Общий token-lock с API.
- Web: в publish card секция TikTok — аккаунт, кнопка «Опубликовать в TikTok», прогресс,
  ошибки, результат; кнопка недоступна без сохранённой приватности и подключённого аккаунта;
  форма сохраняется перед постановкой job'а; job восстанавливается после перезагрузки и
  поллится каждые 1.5 с; карточка показывается и в `PUBLISHED` (read-only).
- ADR-0013, AGENTS §4/§6/§7/§9, README, ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 61, tiktok 28, storage 3, db 3, web 124, worker 96,
  API 64 (379 тестов), сборка проходит.
- Живой API на run `5a931675-aa79-4748-beb6-bede83a8eb53`:
  - `POST /runs/:id/tiktok-publish` → 202, job `publish-<runId>`;
  - job completed, run `PUBLISHED`, карточка `published`, `published_at` записан;
  - `publish_id` из предыдущего spike переиспользован — **второго поста не создано**
    (idempotency через status-polling);
  - `post_id=7705631453408808000`.
- Найдено и исправлено: TikTok отдаёт `publicaly_available_post_id` как JSON-число int64
  (больше `Number.MAX_SAFE_INTEGER`) — схема теперь принимает string|number, но точность
  post_id в JS может теряться; webhooks M1.2c вернут строку.

**Не проверено:**

- Браузерный клик по кнопке (API-путь и store/компонент покрыты тестами; живой прогон шёл
  через тот же endpoint).
- Свежий `video/init` из очереди: живой прогон был resume по существующему `publish_id`;
  сам upload уже проверен spike'ом M1.2a.
- Webhooks, rate limiter, выбор аккаунта, автошедулинг — M1.2c.

**Следующая сессия:** M1.2c (webhooks/rate limiter/аккаунты) или M3.1 (storyboard contract).

### Теория сессии

- Кнопка публикации — это не HTTP-запрос, а очередь: внешний upload дольше HTTP-таймаутов и
  должен переживать F5.
- Детерминированный `publish-<runId>` + `publish_id` в карточке дают идемпотентность: retry
  возобновляет статус, а не создаёт второй пост.
- Явная приватность — часть контракта: API отвечает 409, пока пользователь не выбрал уровень;
  для неaudited приложения рабочий вариант только `SELF_ONLY`.
- Ошибки TikTok делятся на terminal/retryable/token; только terminal сразу завершают run,
  остальные дают BullMQ шанс, а финальный retry помечает FAILED.
- `post_id` int64 в JSON — ловушка JS: число теряет точность, поэтому будущие webhooks с
  строковым post_id предпочтительнее.
- UI-состояние переживает reload через серверный снапшот job'а, а не через root-store.

