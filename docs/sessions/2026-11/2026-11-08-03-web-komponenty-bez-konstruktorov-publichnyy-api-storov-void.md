## 2026-11-08 — Web: компоненты без конструкторов, публичный API сторов — `void`

**Ветка:** `refactor/web-lifecycle-and-void-commands` (от `main` после `3c1c85e`).

**Цель:** убрать конструкторы из компонентов и перестать отдавать `Promise` из публичного
API сторов — вызовы в компонентах должны читаться линейно.

**Сделано:**

- `BaseStore`: добавлен `run(key, factory, { onSuccess, onError, onDone })` —
  fire-and-forget команда; общее ядро `execute()` с дедупом по ключу, счётчиком `pending`
  и нормализацией `unknown` в сообщение; `command()` остался value-returning для внутренней
  оркестрации (`regenerate`) и тестов.
- Публичные методы сторов теперь `void`: `accounts.connect/disconnect/testConnection`,
  `auth.login`, `runs.create`, `run-detail.transition/runStage/regenerate`,
  `publish-card.save/markExported/markPublished`. Где вызывающему нужен результат —
  колбэк: `connect(onConsent)`, `create(onCreated)`, `markPublished(onPublished)`,
  `transition(..., onSuccess)`.
- Компоненты без конструкторов: `accounts-page`, `login-page`, `run-page`, `publish-card` —
  `implements OnInit`, побочные эффекты в `ngOnInit`, эффекты через
  `effect(..., { injector: this.injector })`.
- `publish-card.copyText` — promise-цепочка вместо `async/await` (Clipboard API),
  fallback вынесен в `copyWithFallback`.
- Тесты переписаны на `vi.waitFor` и флаш микрозадач; в `run-detail` добавлен
  `beforeEach(vi.useRealTimers)`, чтобы fake timers не протекали между тестами.

**По ревью (REQUEST CHANGES → исправлено):**

- `CommandOutcome` стал статусным (`ok | error | skipped | cancelled`) вместо пары
  `ok/message`: пропуск дубликата и отмена по `takeUntilDestroyed` больше не выглядят как
  успех, `onSuccess` на них не вызывается. Раньше `onDone` срабатывал при пропуске, и
  повторный `logout()` чистил сессию до ответа сервера.
- `logout()` чистит локальную сессию только после успешного ответа — при провале cookie
  на сервере ещё жива.
- Колбэки вызываются через `notify()` с try/catch: исключение в UI-колбэке не становится
  unhandled rejection.
- Добавлены тесты на `run()`: успех, ошибка, пропуск дубликата, уничтожение стора.
- Усилены переписанные тесты: transition проверяет повторную загрузку run, «нет relative
  id» проверяет отсутствие вызовов API, тест clipboard разделён на «копирование упало» и
  «Clipboard API недоступен».

**Проверки:** `pnpm typecheck`, `pnpm --filter @peertoreel/web lint`, `pnpm test`
(contracts 58, storage 3, tiktok 28, db 3, web 119, worker 91, api 60), `pnpm build` —
зелёные.

**Не сделано намеренно:** `restore()` остался `Observable` (нужен router guard), сторы
сохранили конструкторы — это DI-wiring сервиса, а не компонентный жизненный цикл.
Правила для AGENTS §8 не вносил: по hard rule 8 изменение файла требует ADR.

