# Design

## Реализуемые требования

- FR-1 Bootstrap decision · FR-2 Non-interactive install · FR-3 Idempotency · FR-4 Fail-open
- FR-5 Doctor detection · FR-6 Canonical global MCP config

## Компоненты

### 1. SessionStart hook — `tools/claude-mem-bootstrap/install-claude-mem.ts` (FR-1..FR-4)

Builtins-only (`node:fs/os/path/child_process/url`), fail-open. Exports a pure `claudeMemBootstrapDecision(state)` (FR-1) and `buildInstallInvocation(platform)` (FR-2); the I/O wrapper drains stdin, detects install state via `isClaudeMemInstalled(home)` (`installed_plugins.json` `claude-mem@*` or `~/.claude-mem` worker/db files), checks the mtime lock (`lockIsFresh`, 6h backoff), and on `install` stamps the lock plus fires the installer DETACHED. A test seam `CLAUDE_MEM_INSTALL_LAUNCHER` redirects the spawn to a recorder (runs synchronously) so the exact command is asserted without network. Registered in `.claude-plugin/hooks.json` (CLAUDE_PLUGIN_ROOT) and `.claude/settings.json` (CLAUDE_PROJECT_DIR) — registry-parity enforced.

### 2. Doctor check C-CMEM — `.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts` (FR-5)

Reads `installed_plugins.json` / `~/.claude-mem` worker files; `warning` plus install hint when absent, `ok` when present. Registered in `checks/index.ts` `phase4Checks`.

### 3. Doctor C11 path fix — `.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts` (FR-6)

`readMcpConfigs` reads `~/.claude.json` (canonical) plus project `.mcp.json`, replacing the non-existent `~/.claude/mcp.json`.

## Почему не «тихий `npx claude-mem install`» без флагов

Установщик claude-mem интерактивный (мульти-выбор IDE плюс провайдер/модель). Без TTY и без флагов он повиснет/упадёт по EOF. Решение — non-interactive флаги плюс `DO_NOT_TRACK/CI` плюс detached не-TTY spawn. MCP claude-mem отдаёт сам плагин (`plugin_claude-mem_mcp-search`) — руками в `~/.claude.json` ничего не пишем.

## Reuse

| Что | Откуда |
|-----|--------|
| mtime-lock плюс detached spawn | `tools/claude-subscription-proxy/ensure-up.cjs` |
| pure-decision плюс DI orchestration | `tools/marksman-installer/ensure-marksman.ts` |
| log helper | `tools/_shared/hook-utils.ts` |
| buildResult | `.claude/skills/pomogator-doctor/scripts/engine/checks/_helpers.ts` |

## BDD Test Infrastructure

**Classification:** TEST_DATA_REAL_VIA_SEAM. Scenarios drive the real pure functions in-process, the real hook via its bootstrap launcher (recorded-launcher seam — no network), and the real doctor checks with a crafted ctx plus fake HOME. No mocks. Step-defs: `tests/step_definitions/feature_claude_mem_bootstrap.ts`; fixture `tests/fixtures/claude-mem-bootstrap/record-launcher.cjs`.
