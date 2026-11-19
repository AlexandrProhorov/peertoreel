## 2026-11-08 — M1.2a: живая загрузка в TikTok

**Результат:** OAuth sandbox-аккаунта и `FILE_UPLOAD` в TikTok впервые прошли end-to-end.

**Путь:**

- Приложение TikTok в Sandbox: client key/secret, Login Kit + Content Posting API, scopes
  `user.info.basic` + `video.publish`.
- Из-за требования HTTPS для Web поднят временный `cloudflared`-туннель к локальному API;
  redirect URI `https://<tunnel>/api/v1/accounts/tiktok/callback` зарегистрирован в Sandbox
  Login Kit. Туннель остановлен после подключения.
- OAuth: исправлен PKCE (`code_challenge`/`code_verifier`), затем ошибка `scope` — scopes
  включены в Sandbox. Подключён приватный аккаунт `@arapashwb55` (Куклуксмаксер).
- `tiktok:spike` на новом run `5a931675-aa79-4748-beb6-bede83a8eb53` («почему собака —
  лучший друг человека?»):
  - `creator_info/query` → privacy options включают `SELF_ONLY`;
  - draft 28 125 877 байт, 2 чанка (`HTTP 206`, затем `HTTP 201`);
  - `publish_id=v_pub_file~v2-1.7705630733150406678`;
  - `status=PUBLISH_COMPLETE`, `post_id` пустой — ожидаемо для `SELF_ONLY`
    (непубличный пост);
  - карточка получила `publish_id`, run остался в `SCHEDULED`.

**Проверки:**

- `pnpm check` — 356 тестов (contracts 58, tiktok 28, storage 3, db 3, web 113, worker 91,
  API 60), сборка проходит.
- `pnpm --filter @peertoreel/web test` после no-store/cache-buster для authorize — 113.
- Живой OAuth и upload — см. выше.

**Ограничения:**

- Приложение не прошло аудит: посты только `SELF_ONLY`, публичная публикация недоступна.
- Это spike, а не очередь `publish`: run state и publish card state не двигаются; кнопка
  публикации в UI, webhooks и rate limiter — M1.2b.
- Временный `trycloudflare.com` URL живёт только пока запущен процесс; для повторного OAuth
  нужен новый туннель/домен.

**Следующая сессия:** M1.2b — очередь `publish`, кнопка в publish card, `publish_id`/`post_id`
в карточке, статус/webhooks, rate limiter.

