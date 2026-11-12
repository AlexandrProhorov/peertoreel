## 2026-11-08 — fix(accounts): PKCE для TikTok OAuth

**Симптом:** после нажатия «Подключить TikTok» страница TikTok показывала
«Something went wrong / correct the following: code_challenge».

**Причина:** приложение TikTok настроено на Desktop/localhost redirect (`http://localhost`),
а TikTok требует PKCE для такого flow. Наш authorize URL не содержал `code_challenge`, а
обмен кода — `code_verifier`.

**Сделано:**

- `packages/tiktok/src/pkce.ts`: `createCodeVerifier` (48 random bytes → base64url, 64 символа)
  и `createCodeChallenge` (hex SHA-256 — так требует Login Kit desktop guide TikTok).
- `TikTokApi.authorizeUrl(state, scopes, codeChallenge?)` добавляет
  `code_challenge` + `code_challenge_method=S256`; `exchangeCode(code, codeVerifier?)`
  отправляет `code_verifier`.
- OAuth state в Redis теперь хранит `{ userId, codeVerifier }` (JSON), а не голый userId;
  callback парсит его и передаёт verifier в обмен. Старые state без verifier отклоняются.
- Тесты: PKCE verifier/challenge, authorize URL, token exchange, OAuth state/callback.

**Проверено:**

- `pnpm --filter @peertoreel/tiktok test` — 28 тестов.
- `pnpm --filter @peertoreel/api typecheck` и `test` — 60 тестов.
- Живой `/accounts/tiktok/authorize` отдаёт URL с `code_challenge` и `code_challenge_method=S256`.

**Осталось:** повторить подключение в браузере. Если TikTok вернёт ошибку redirect URI —
проверить, что `http://localhost:3000/api/v1/accounts/tiktok/callback` зарегистрирован
в том же режиме (Sandbox/Production), что и используемый client key.

