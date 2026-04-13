# Use Cases

## UC-1: Fresh install в чистый target проект @feature1 @feature2 @feature3

**Given** smarts-like target project с существующим `.gitignore` (без `.dev-pomogator/` entries) и tracked `.claude/settings.json` с team hook `block-dotnet-test.js`
**And** user running `dev-pomogator install` first time в этот проект

**When** installer completes

**Then** system SHALL:
- Скопировать commands/rules/skills/tools в их обычные места
- Записать marker block в `.gitignore`: `.claude/settings.local.json` + `.dev-pomogator/` + `.claude/rules/{subfolders}/` + `.claude/skills/{names}/` + specific managed command paths
- Записать dev-pomogator хуки в `.claude/settings.local.json` (не в `settings.json`!)
- Оставить `.claude/settings.json` нетронутым (team hook preserved)
- `git status --porcelain` должен показать 0 untracked dev-pomogator файлов

## UC-2: Re-install после удаления extension @feature1

**Given** existing installation с extensions A, B, C активными, marker block в `.gitignore` содержит paths от всех трёх
**When** user удаляет extension B из active list и запускает `dev-pomogator install` повторно

**Then** system SHALL:
- Перегенерировать marker block с нуля — stale entries от B исчезают
- Оставить paths от A и C (они всё ещё managed)
- Marker block остаётся идемпотентным (stable sort → same bytes для same input)

## UC-3: Install в dev-pomogator репо (dogfooding) @feature3

**Given** user stigm работает в `D:\repos\dev-pomogator` (package.json#name === 'dev-pomogator')
**When** user запускает `dev-pomogator install --claude`

**Then** self-guard SHALL activate:
- НЕ трогать `.gitignore` (наш `.gitignore` управляется вручную)
- НЕ создавать `.claude/settings.local.json`
- НЕ мигрировать legacy entries из `.claude/settings.json`
- Копирование tools/commands/rules/skills продолжается как раньше (dogfood works)
- Console output: "Detected dev-pomogator source repository — skipping personal-mode features"

## UC-4: Broken dist (dkorotkov repro) @feature4

**Given** user клонировал dev-pomogator, но НЕ запустил `npm run build` перед install — `dist/tsx-runner.js` отсутствует
**And** `src/scripts/tsx-runner.js` fallback также недоступен (например user запустил из npm pack с урезанными файлами)

**When** user запускает `dev-pomogator install`

**Then** installer SHALL:
- Exit with non-zero code
- stderr contains "tsx-runner.js not found — run 'npm run build' first"
- `.claude/settings.local.json` НЕ создан (нет записи broken state в target)
- Нет half-done installation: либо всё, либо ничего

## UC-5: Runner исчез после успешной установки @feature5

**Given** успешная установка в target, `.claude/settings.local.json` содержит 17 хуков, `~/.dev-pomogator/scripts/tsx-runner.js` существует
**When** `~/.dev-pomogator/` удалена (Claude Code v2.1.83 updater, antivirus, manual cleanup)
**And** Claude Code triggers любой hook (UserPromptSubmit, Stop, etc.)

**Then** bootstrap wrapper SHALL:
- Детектить missing runner
- Писать в stderr one-line diagnostic: "[dev-pomogator] tsx-runner.js missing (~/.dev-pomogator/scripts/tsx-runner.js) — hook no-op. Run `npx dev-pomogator bootstrap` to fix."
- Exit 0 (не блокирует сессию)
- НЕ печатает Node.js stack trace
- Runtime errors реальных скриптов всё ещё bubble up (не маскируются)

## UC-6: Collision с user-committed command @feature6

**Given** target project уже содержит `.claude/commands/create-spec.md` с собственным content user'а, файл закоммичен в git
**When** user запускает `dev-pomogator install` (specs-workflow extension который тоже даёт `create-spec.md`)

**Then** installer SHALL:
- Выполнить `git ls-files -- .claude/commands/create-spec.md` (batched с другими candidates)
- Детектить collision
- Пропустить copy (user's file preserved)
- Исключить path из gitignore marker block (чтобы user's file остался tracked)
- Напечатать WARN: "COLLISION: .claude/commands/create-spec.md — skipped (user-tracked in git)"
- Продолжить install остальных файлов

## UC-7: Per-project uninstall @feature7

**Given** dev-pomogator ранее установлен в target project (smarts), config содержит managed entries для repoRoot
**When** user запускает `npx dev-pomogator uninstall --project`

**Then** uninstaller SHALL:
- Validate target НЕ является dev-pomogator source repo (self-guard refuse)
- Читать `managed[repoRoot]` entries из config
- Удалять каждый managed файл через `fs.remove` с path traversal guard
- Prune empty parent dirs
- Убрать marker block из `.gitignore`
- Удалить dev-pomogator entries из `.claude/settings.local.json` (team hooks в `settings.json` не трогать)
- Обновить config: remove `repoRoot` из `projectPaths`, `delete managed[repoRoot]`
- Global `~/.dev-pomogator/scripts/` и `~/.claude.json` не трогает (personal mode — только project scope)

## UC-8: Uninstall в dev-pomogator репо @feature7

**Given** user запускает `dev-pomogator uninstall --project` из `D:\repos\dev-pomogator`
**When** команда validates target

**Then** system SHALL:
- Детектить через `isDevPomogatorRepo(repoRoot)` = true
- Exit with refusal message: "Refusing to uninstall from dev-pomogator source repository"
- НЕ удалить ни одного файла
- НЕ модифицировать config

## UC-9: setup-mcp.py с существующим project .mcp.json @feature8

**Given** target project smarts содержит existing `.mcp.json` с `mcpServers['mcp-atlassian']` (JIRA token в args, plaintext)
**When** user запускает `python .dev-pomogator/tools/mcp-setup/setup-mcp.py --claude`

**Then** script SHALL:
- НЕ читать project `.mcp.json` (force-global disabled project-first)
- Писать Context7 + Octocode entries в `~/.claude.json` (global user config)
- Project `.mcp.json` остаётся нетронутым (JIRA token isolated)
- Console: "[INFO] Writing MCP servers to global config (~/.claude.json) — personal mode"

## UC-10: Install с secrets в project .mcp.json @feature8

**Given** target project содержит `.mcp.json` с patterns: `JIRA_API_TOKEN=xxx`, `CONFLUENCE_API_TOKEN=yyy`, `API_KEY=zzz`
**When** user запускает `dev-pomogator install`

**Then** installer SHALL:
- Детектить существование `.mcp.json`
- Читать content, grep против secret pattern regex
- Print SECURITY WARN с list matched patterns: "JIRA_API_TOKEN, CONFLUENCE_API_TOKEN, API_KEY"
- Print рекомендации: "move to env vars / add .mcp.json to .gitignore / move MCP config to ~/.claude.json"
- НЕ блокировать install (только warning)
- НЕ модифицировать `.mcp.json` (read-only check)

## UC-11: claude-mem MCP registration invariant @feature8

**Given** target project где включён `claude-mem-health` extension
**When** installer registers claude-mem MCP server

**Then** `src/installer/memory.ts:registerClaudeMemMcp` SHALL:
- Писать ТОЛЬКО в `~/.claude.json` (HOME global)
- НЕ писать в project `.mcp.json`
- Поведение уже корректное, spec фиксирует как invariant (BDD test PERSO_84 защищает от регрессии)

## UC-12: User просит AI удалить dev-pomogator @feature9

**Given** active Claude Code session в target project где установлен dev-pomogator
**When** user говорит "удали dev-pomogator" / "remove dev-pomogator" / "uninstall dev-pomogator" / "снеси помогатор"

**Then** AI agent SHALL trigger `dev-pomogator-uninstall` skill
**And** skill SHALL guide agent через 5-шаговый алгоритм:
1. **Safety check**: читать `package.json` repoRoot, если `name === 'dev-pomogator'` → refuse, stop
2. **Scope confirm**: спросить user — project-only vs also clean global (`~/.dev-pomogator/`)
3. **CLI-first**: попробовать `npx dev-pomogator uninstall --project --dry-run` → present dry-run output → ask confirmation → run без `--dry-run`
4. **Manual fallback**: если CLI недоступен (stale installation, missing binary) — читать `~/.config/dev-pomogator/config.json`, iterate `managed[projectPath]`, delete files, prune dirs, strip gitignore marker block via Edit, clean `settings.local.json` entries, update config
5. **Verification**: run `git status --porcelain` и assert 0 dev-pomogator paths, Read `.gitignore` и assert marker block absent, Read `.claude/settings.local.json` и assert empty / no dev-pomogator hooks

**And** skill SHALL NOT execute destructive commands без user confirmation на каждом critical шаге.
