## 2026-11-04 — M2.1 Storage + artifacts (слайс A)

**Цель:** превратить спайки в инфраструктуру: общий доступ к БД, S3-хранилище и реестр
артефактов, чтобы worker мог писать результаты стадий, а UI — их читать.

**Сделано:**

- Новый пакет `packages/db`: схема Drizzle переехала из `apps/api/src/db/`, добавлен
  `createDatabase(url)` (pool + drizzle), тест паритета enum'ов перенесён туда же.
- Таблица `artifacts` (`run_id`, `stage`, `type`, `object_key`, `content_type`, `size_bytes`,
  `meta`), уникальный `object_key`, индекс `(run_id, stage)`. Миграция `0004` применена.
- Новый пакет `packages/storage`: `ObjectStorage` (`put/get/delete/presignGet`) поверх
  SeaweedFS/R2 и `buildArtifactKey(runId, stage, name)`.
- API: `StorageModule` (глобальный), `ArtifactsRepository`, `RunsService.artifactsFor()`,
  `GET /api/v1/runs/:id/artifacts` — список с подписанными ссылками (1 час).
  Env получил `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY/FORCE_PATH_STYLE`.
- Worker: зависимости `@peertoreel/db`, `@peertoreel/storage`, `drizzle-orm`, `pg`; скрипт
  `src/storage-spike.ts` — загрузка файла, запись артефакта, проверка подписанной ссылки и
  roundtrip.
- ADR-0006, обновлены `AGENTS.md` (§2, §3, §8) и `ARCHITECTURE.md`.

**Проверено:**

- `storage-spike`: файл 34 216 005 байт загружен в SeaweedFS по ключу
  `runs/655c3b06…/render/draft.mp4`, строка `artifacts` записана, `presignGet` вернул
  ссылку, скачивание по ней — 200 и тот же размер, `getObject` — roundtrip ok.
- Повторный запуск: «уже записан (тот же id), объект перезаписан»; в БД по-прежнему одна
  строка и 34 216 005 байт — идемпотентность на уровне `object_key`.
- `GET /runs/:id/artifacts` с cookie: 200, один артефакт `draft_mp4`/`render`, ссылка
  отдаёт ровно 34 216 005 байт.
- `pnpm check` — зелёный: contracts 23, API 20, worker 19, web 32, db 2, storage 3 (99 тестов).

**Решения:**

- Миграции остались в `apps/api/drizzle`; worker их не применяет (см. ADR-0006).
- Артефакты пишет тот, кто произвёл файл; API только читает и подписывает ссылки.
- Локальный диск — scratch для FFmpeg, не место хранения.

**Осталось (слайс B):**

- Стадия `voiceover` в очереди: job по переходу `SCRIPT_READY → VOICE_READY`, запись
  `voiceover.mp3` + `word_timings.json` как артефактов, `provider_usage`, SSE прогресса run'а.
- Очистка объектов S3 при удалении run'а (сейчас каскад чистит только строки).

