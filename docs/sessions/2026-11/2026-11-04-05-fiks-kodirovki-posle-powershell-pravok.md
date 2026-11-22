## 2026-11-04 — Фикс кодировки после PowerShell-правок

**Симптом:** в UI надписи стадий показывались иероглифами (`Р“РµРЅРµСЂР°С†РёСЏ…`).

**Причина:** часть правок я делал через PowerShell (`Get-Content -Raw` → `-replace` →
`Set-Content`). `Get-Content` без `-Encoding` читает UTF-8 как ANSI, поэтому кириллица
превратилась в mojibake и в таком виде записалась обратно. Пострадали четыре файла:

- `apps/web/.../run-page.component.ts` — `stageTitle`, `stageHint`;
- `apps/worker/src/stages/transition.ts` — два сообщения об ошибках;
- `apps/worker/src/stages/voiceover.processor.ts` — два сообщения;
- `apps/worker/src/stages/script.processor.ts` — одно сообщение.

**Сделано:**

- Все строки восстановлены (правки через `edit`, который пишет UTF-8 корректно).
- Заодно поправлена склеенная строка в `runStage()` (`{    const run = …`).
- Для проверки написан разовый сканер (вне репозитория), который ищет mojibake по
  сигнатурам `Р+continuation` / `вЂ`; после правок — `no mojibake`.

**Проверено:**

- Браузер: карточка run'а показывает «Генерация озвучки», подсказку про ElevenLabs,
  бейдж «Сценарий готов», артефакт «Сценарий», ошибок в консоли нет.
- `pnpm check` — зелёный: contracts 27, API 20, worker 19, web 36, db 2, storage 3 (107 тестов).

**Правило на будущее:** файлы с кириллицей не редактировать через `Set-Content`/`-replace`
в PowerShell 5.1 — только `edit`/`write`, либо `-Encoding utf8` на чтении и записи.

