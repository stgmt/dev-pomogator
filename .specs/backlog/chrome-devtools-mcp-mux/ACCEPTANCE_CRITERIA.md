# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1: Extension package](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux)

WHEN `runInstaller()` запускается в target project AND `extensions/chrome-devtools-mcp-mux/extension.json` существует в dev-pomogator package THEN installer SHALL:

1. Скопировать `tools/chrome-devtools-mcp-mux/` source в `<targetProject>/.dev-pomogator/tools/chrome-devtools-mcp-mux/`.
2. Скопировать `.claude/skills/chrome-devtools-mcp-mux/` source в `<targetProject>/.claude/skills/chrome-devtools-mcp-mux/`.
3. Добавить `chrome-devtools-mcp-mux` запись в `~/.dev-pomogator/config.json.installedExtensions[]` с полями `name`, `version`, `projectPaths[]`, `managed` (per existing pattern).
4. Не упасть при повторном запуске (idempotent).

## AC-2 (FR-2)

**Требование:** [FR-2: MCP server registration](FR.md#fr-2-mcp-server-registration-in-users-mcpjson)

WHEN installer завершает install для chrome-devtools-mcp-mux AND target project не имеет `.mcp.json` THEN installer SHALL создать `<targetProject>/.mcp.json` со shape:

```json
{
  "mcpServers": {
    "chrome-devtools-mcp-mux": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp-mux@0.2.2"]
    }
  }
}
```

IF target project имеет existing `.mcp.json` с другими `mcpServers` keys THEN installer SHALL preserve все existing keys AND добавить/обновить только `chrome-devtools-mcp-mux` запись (smart merge), записав через temp file + `fs.move` атомарно.

## AC-3 (FR-3)

**Требование:** [FR-3: Skill направляет Claude к mux как DEFAULT](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default)

WHEN Claude Code сессия загружает skill `chrome-devtools-mcp-mux` THEN SKILL.md MUST содержать:

1. Frontmatter с `name: chrome-devtools-mcp-mux` AND `description` начинающимся с фразы equivalent "Use chrome-devtools-mcp-mux MCP as your FIRST and DEFAULT choice for any browser interaction".
2. Section `## Triggers` со списком ≥10 keywords включая "browser", "screenshot", "console", "navigate".
3. Section `## Decision Tree` с явным priority-ordered list: (1) DEFAULT mux, (2) Fallback claude-in-chrome with hard-OUT signals, (3) Fallback edge-debug-port with hard-OUT signals.
4. Section `## Hard rules` с явным запретом вызова `mcp__chrome-devtools-mcp__*` (vanilla, не mux) если mux в `.mcp.json`.
5. Section `## Compatibility` с описанием Chrome 136+ extension mitigation и mutex с claude-in-chrome.

WHEN integration test парсит SKILL.md THEN test SHALL assert наличие всех 5 sections + ≥10 triggers + DEFAULT/FIRST imperative phrase.

## AC-4 (FR-4)

**Требование:** [FR-4: Pomogator-doctor checks](FR.md#fr-4-pomogator-doctor-checks-5-checks)

WHEN `/pomogator-doctor` запускается AND chrome-devtools-mcp-mux extension присутствует в `config.installedExtensions[*].name` THEN doctor SHALL emit exactly 5 entries (CDMM-1 .. CDMM-5) каждый со severity (🟢/🟡/🔴) + message + fixHint AND грouped под header "chrome-devtools-mcp-mux".

WHEN extension отсутствует в `config.installedExtensions` THEN doctor SHALL skip CDMM-* checks полностью (no output для этого extension) — per `pomogator-doctor` per-extension driving rule.

WHEN CDMM-3 timeout exceeded (15s) THEN check SHALL emit 🟡 with fixHint `run "npm view chrome-devtools-mcp-mux" to verify package available; check network`.

WHEN CDMM-4 fails (no Chrome bin found) THEN check SHALL emit 🟡 with fixHint `Chrome не найден; set PUPPETEER_EXECUTABLE_PATH или run "npx puppeteer browsers install chrome"`.

## AC-5 (FR-5)

**Требование:** [FR-5: Conflict detection с claude-in-chrome MCP](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp)

IF target project's `.mcp.json` уже содержит ключ `"claude-in-chrome"` ИЛИ `~/.dev-pomogator/config.json.installedExtensions[*].name` содержит `claude-in-chrome` WHEN installer обрабатывает chrome-devtools-mcp-mux THEN installer SHALL:

- В interactive mode (TTY): emit warning блок описанный в FR-5 + AskUserQuestion с 3 options (skip / install+revert claude-in-chrome / install+separate-instance) и default option (a).
- В non-interactive mode (`CI=true` ИЛИ `--non-interactive` flag): emit warning + autoselect (a) skip + log в installer log path.
- Записать решение в `~/.dev-pomogator/config.json.events` array (or specific log path TBD design) для audit.

WHEN co-existence runtime detected by doctor (CDMM-2 видит обе MCP entries в `.mcp.json` ОДНОВРЕМЕННО) THEN doctor SHALL emit 🟡 warning с pointer на FR-5 conflict resolution options.

## AC-6 (FR-6)

**Требование:** [FR-6: Uninstall cleanup](FR.md#fr-6-uninstall-cleanup)

WHEN user запускает `dev-pomogator --uninstall chrome-devtools-mcp-mux` AND extension installed THEN uninstaller SHALL atomic-ly:

1. Удалить ключ `"chrome-devtools-mcp-mux"` из `<targetProject>/.mcp.json.mcpServers` (preserving other keys).
2. Удалить директорию `targetProject/.claude/skills/chrome-devtools-mcp-mux/` рекурсивно.
3. Удалить директорию `targetProject/.dev-pomogator/tools/chrome-devtools-mcp-mux/` рекурсивно.
4. Удалить запись из `~/.dev-pomogator/config.json.installedExtensions` где `name == "chrome-devtools-mcp-mux"` (preserve остальные extensions).
5. Если managed gitignore block становится empty после удаления — удалить block целиком из `<targetProject>/.gitignore`.

WHEN uninstaller запущен в dev-pomogator source repo (detected via `isDevPomogatorRepo` check) THEN uninstaller SHALL refuse with error message + exit code ≠ 0.

## AC-7 (FR-7)

**Требование:** [FR-7: Pinned version](FR.md#fr-7-pinned-version-в-extensionjson)

WHEN spec validator или extension-manifest-integrity check runs AND `extensions/chrome-devtools-mcp-mux/extension.json` parsed THEN `mcpServers["chrome-devtools-mcp-mux"].args` SHALL содержать exact semver pin matching regex `^chrome-devtools-mcp-mux@\d+\.\d+\.\d+$` (NOT `@latest`, NOT `@^x.y.z`, NOT bare name).

WHEN updater run detects version mismatch между declared в `extension.json` и stored hash в `config.json.installedExtensions` field `managed.mcpServers["chrome-devtools-mcp-mux"].configHash` THEN updater SHALL re-write `.mcp.json` запись с new pinned version AND log entry в `~/.dev-pomogator/last-update-report.md`.

## AC-8 (FR-8)

**Требование:** [FR-8: Windows transport verification](FR.md#fr-8-windows-transport-verification-smoke-test)

WHEN `tools/chrome-devtools-mcp-mux/smoke-test.mjs` запускается на Windows THEN script SHALL:

1. Spawn `npx -y chrome-devtools-mcp-mux@<version>` с stdio piped.
2. Send valid MCP `initialize` JSON-RPC request.
3. Receive response within 10s timeout containing `result.protocolVersion` field.
4. Send `tools/list` request.
5. Receive response containing array of tools with names matching at least one of: `navigate_page`, `take_screenshot`, `list_pages`, `select_page`.
6. Exit with code 0 если все steps passed; иначе non-zero + stderr описывает failed step.

WHEN smoke test passes на Windows AND on macOS/Linux CI runners THEN это SHALL быть evidence для closure of risk R1 (Windows transport unverified) в RESEARCH.md.

## AC-9 (FR-9)

**Требование:** [FR-9: First-run browser preference prompt](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven)

WHEN Claude Code session first активирует skill `chrome-devtools-mcp-mux` AND `.mcp.json.mcpServers["chrome-devtools-mcp-mux"].env.CDMCP_MUX_CHROMIUM` matches the auto-injected installer default (e.g. `msedge.exe` path on Windows) AND `~/.dev-pomogator/.cdmm-browser-choice.json` does NOT exist OR has `dismissed: false` THEN skill SHALL direct Claude:

1. Write a text message to chat presenting **5 options labelled (A)..(E)** matching FR-9 table.
2. Wait for user reply (single letter `A` / `B` / `C` / `D <path>` / `E`).
3. On reply → invoke helper script `npx tsx <project>/.dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs <choice> [<path>]` via Bash.
4. Confirm the resulting `.mcp.json` change with one short sentence.

WHEN user replies `E` (don't ask again) AND `~/.dev-pomogator/.cdmm-browser-choice.json` is written with `dismissed: true` THEN subsequent activations of the skill in any future session SHALL skip the prompt entirely.

WHEN user picks option `B` (Use Chrome) AND Chrome binary cannot be auto-detected on the host OS THEN helper script SHALL fall back to a follow-up prompt for explicit path (delegating back to option D logic).

WHEN helper script writes `.mcp.json` THEN write SHALL be atomic (per `atomic-config-save` rule) AND preserve all other `mcpServers` keys + top-level keys.

WHEN user picks option `C` (bundled Chromium / isolated) THEN helper script SHALL DELETE the `env.CDMCP_MUX_CHROMIUM` key (not set to empty string) — puppeteer takes over with its bundled binary.

WHEN `.mcp.json` does NOT contain mux entry yet (e.g. fresh project before installer ran) THEN skill SHALL skip the prompt entirely (no-op — installer will inject default later, then prompt fires on next session).
