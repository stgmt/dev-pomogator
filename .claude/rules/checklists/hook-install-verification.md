# Hook Install Verification

## Правило

При добавлении хука в `extension.json` (`hooks.claude.<Event>`) — declared ≠ installed. ОБЯЗАТЕЛЬНО проверить что хук реально доезжает до target-проектов через установщик, а не просто объявлен в манифесте.

## Где это происходит (source of truth)

Установщик ставит хуки в `src/installer/claude.ts` → функция установки хуков:

1. Итерирует расширения, `getExtensionHooks(ext, 'claude')` читает `extension.hooks.claude` (`src/installer/extensions.ts`).
2. Разворачивает 3 формата хука (string / `{matcher,command,timeout}` / array `[{matcher?,hooks:[...]}]`) — см. [`installer-hook-formats`](../gotchas/installer-hook-formats.md).
3. Конвертирует команду в переносимую форму: `resolveHookToolPaths` (relative→absolute) + `replaceNpxTsxWithPortable` (`npx tsx` → `tsx-runner-bootstrap.cjs`).
4. Пишет в **`.claude/settings.local.json`** target-проекта (personal-mode, personal-pomogator FR-2). Team-shared `.claude/settings.json` не трогается.

**Исключение:** `SessionStart` check-update хук → глобальный `~/.claude/settings.json`, не project settings.local.json (см. CLAUDE.md Hooks секция). Поэтому проверка «хук установлен» = он в project `settings.local.json` ЛИБО в глобальном `~/.claude/settings.json`.

**Dogfooding (сам dev-pomogator repo):** хуки идут в `.claude/settings.json` (не settings.local.json) — это намеренно. Поэтому новый хук для своего же репо нужно вписать в `.claude/settings.json` Stop-массив вручную (installer для dogfood использует settings.json).

## Как проверить (обязательно при добавлении хука)

- [ ] Прочитать код-путь выше — формат хука (string/object/array) обрабатывается в `claude.ts`.
- [ ] Динамический тест `CORE003_19` (`tests/e2e/claude-installer.test.ts`) проверяет что КАЖДАЯ команда хука из всех `extension.json` попадает в `settings.local.json` или глобальный `~/.claude/settings.json` после реального install. Новый хук покрывается автоматически — не добавляй захардкоженный тест на каждый хук (аналогия с [`manifest-test-coverage`](manifest-test-coverage.md) для rules).
- [ ] Для работы хука В САМОМ dev-pomogator (dogfood) — вписать его в `.claude/settings.json` Stop/PreToolUse/etc. массив.
- [ ] `extension.json` версия поднята + `toolFiles` перечисляет файлы хука (см. [`extension-manifest-integrity`](../extension-manifest-integrity.md)).

## Антипаттерн (реальный)

`answer-simple` был чисто декларативным (rule + skill, без хуков). При добавлении Stop-хука (`answer_simple_stop.ts`, v1.1.0) недостаточно было просто дописать `hooks.claude.Stop` в манифест — нужно было: (a) подтвердить код-путь установщика, (b) вписать в `.claude/settings.json` для dogfood, (c) добавить динамический тест что хук доезжает. «Объявил в манифесте → считаю что установится» = trust-based, тот же класс провала что [[feedback_self-review-must-be-default-not-prompted]].

## Планируется (roadmap)

- Динамический `CORE003_19` сейчас проверяет presence команды по basename скрипта. Можно усилить: проверять что matcher/timeout сохранены и что portable-конвертация (`tsx-runner-bootstrap`) применена к каждому.
- Рассмотреть аналогичную динамическую проверку для `postInstall`/`postUpdate` хуков (сейчас только `CORE003_16` частично).

## Связанные правила

- [`installer-hook-formats`](../gotchas/installer-hook-formats.md) — 3 формата хука, все обрабатывать.
- [`extension-manifest-integrity`](../extension-manifest-integrity.md) — манифест перечисляет все файлы + версия.
- [`manifest-test-coverage`](manifest-test-coverage.md) — динамический тест вместо захардкоженного на каждый артефакт.
- [`updater-sync-tools-hooks`](../updater-sync-tools-hooks.md) — апдейтер переустанавливает хуки.
