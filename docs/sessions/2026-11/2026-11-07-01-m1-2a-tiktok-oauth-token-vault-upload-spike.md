## 2026-11-07 — M1.2a TikTok OAuth + token vault + upload spike

**Цель:** подключить TikTok через Login Kit, безопасно хранить токены и проверить реальный
`FILE_UPLOAD` до постройки очереди публикации.

**Сделано:**

- `packages/tiktok`: OAuth (`authorizeUrl`, code exchange, refresh, revoke), user info,
  `creator_info/query`, `video/init`, chunked upload, `status/fetch`; AES-256-GCM
  `TokenCipher`; `planChunks` по правилам TikTok; классификация ошибок
  `token/retryable/terminal`.
- Контракты `tiktok.ts`: метаданные аккаунта, callback query, creator info; подключены к web.
- БД: `tiktok_accounts` (`user_id`, `open_id`, шифрованные токены, expiry, scope, unique
  `(user_id, open_id)`), миграция `0007`.
- API `accounts/`: `GET /accounts/tiktok`, `GET /accounts/tiktok/authorize`,
  `GET /accounts/tiktok/callback`, `GET /accounts/tiktok/:id/creator-info`,
  `DELETE /accounts/tiktok/:id`. OAuth state живёт в Redis 10 минут; callback не требует
  cookie и разрешает пользователя по state.
- Refresh: `expires_in`/`refresh_expires_in` из ответа, ротация refresh-токена, Redis-лок
  на аккаунт, 503 при недоступном Redis.
- Web: `/accounts` — подключение, список, проверка creator info, отключение; ссылка в shell.
- Worker: `tiktok:spike` — читает `SCHEDULED` run + `draft_mp4`, аккаунт из vault,
  обновляет токен, вызывает creator info, `video/init` (`is_aigc: true`, `FILE_UPLOAD`),
  грузит чанки и опрашивает статус; `--dry-run` останавливается до загрузки.
- ADR-0011; AGENTS §2/§3/§5/§7/§9; ARCHITECTURE; README; ROADMAP.

**Проверено:**

- `pnpm check` — зелёный: contracts 58, tiktok 26, storage 3, db 3, web 113, worker 91,
  API 59 (353 теста), сборка проходит; initial bundle 326.04 kB.
- `pnpm db:migrate` — применена `0007`, таблица `tiktok_accounts` и unique-индекс на месте.
- API после добавления модуля поднимается; `GET /accounts/tiktok` без сессии → 401, с сессией
  без ключей → `200 {accounts: []}` (список не требует TikTok-конфигурации),
  `GET /accounts/tiktok/authorize` с сессией без ключей → 503 с сообщением
  «TikTok не настроен: добавьте TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI, TOKEN_ENCRYPTION_KEY».
- Unit-тесты: cipher round-trip/tamper, chunking (включая пример 50 000 123 байт), OAuth
  state/callback, ротация токенов, ошибки/классификация, store/API accounts.

**Не проверено (нужны ключи TikTok):**

- Реальный OAuth: в `.env` нет `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
  `TIKTOK_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- Реальная загрузка `tiktok:spike` и статус `PUBLISH_COMPLETE` на приватном аккаунте.
- Очередь `publish`, кнопка публикации в publish card, webhooks, rate limiter — M1.2b.

**Найдено в официальной документации (2026-11-07):**

- Access token ≈2 часа, refresh ≈180 дней, refresh-токен ротируется; старые «24 ч / 365 дней»
  в AGENTS были неверны и исправлены.
- `post_info` требует `privacy_level`, `brand_content_toggle`; `is_aigc` — optional, мы всегда
  передаём `true`.
- Для `FILE_UPLOAD`: чанки 5–64 МБ, последний может быть больше, `total_chunk_count =
  floor(size/chunk_size)`, загрузка последовательная.
- `SELF_ONLY` не возвращает `publically_available_post_id` — null post id ожидаем для
  unaudited приложения.

**Следующая сессия:** добавить ключи, подключить приватный аккаунт, прогнать `--dry-run` и
реальную загрузку; затем M1.2b — очередь `publish` и кнопка в publish card.

### Теория сессии

- Сроки жизни токенов — данные ответа, а не константы: TikTok уже менял их, и hardcode
  ломает refresh-джоб.
- Refresh-токен одноразовый: два параллельных refresh инвалидируют друг друга, поэтому
  обновление сериализуется локом, а проигравший перечитывает строку.
- OAuth state в Redis, а не в cookie: callback приходит с tiktok.com, state одноразовый и
  привязан к пользователю.
- AES-256-GCM даёт и шифрование, и проверку целостности; версия в префиксе оставляет место
  для ротации формата.
- `FILE_UPLOAD` выбран раньше `PULL_FROM_URL`, потому что не требует подтверждённого домена;
  чанки считаются по правилам TikTok, а не «по 10 МБ на глаз».
- Ошибка TikTok классифицируется до ретрая: `access_token_invalid` → refresh, 429/5xx →
  backoff, spam/auth/media → terminal.
- Upload spike не трогает state machine: сначала проверяем реальный API, потом кодируем
  очередь и audit-переходы.
- Unaudited app — это ограничение продукта, а не баг: `SELF_ONLY` и приватный аккаунт до
  прохождения аудита.

