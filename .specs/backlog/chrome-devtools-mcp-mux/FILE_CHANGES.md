# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/chrome-devtools-mcp-mux/extension.json` | create | [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux): декларирует extension с `mcpServers`/`skills`/`tools` |
| `extensions/chrome-devtools-mcp-mux/README.md` | create | [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux): operational notes для maintainer |
| `extensions/chrome-devtools-mcp-mux/CHANGELOG.md` | create | [FR-7](FR.md#fr-7-pinned-version-в-extensionjson): version history для pinned bumps |
| `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs` | create | [FR-8](FR.md#fr-8-windows-transport-verification-smoke-test): JSON-RPC handshake helper |
| `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/configure-browser.mjs` | create | [FR-9](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven): browser preference helper invoked by skill |
| `tests/e2e/chrome-devtools-mcp-mux-configure-browser.test.ts` | create | AC-9 — PLUGIN017_12, PLUGIN017_13 scenarios |
| `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` | create | [FR-3](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default): skill с DEFAULT directive + decision tree |
| `src/installer/mcp-config.ts` | create | [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson) + [FR-6](FR.md#fr-6-uninstall-cleanup): atomic smart-merge writer/remover для `.mcp.json` |
| `src/installer/mcp-conflicts.ts` | create | [FR-5](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp): detects claude-in-chrome co-existence; returns 3-option payload |
| `src/installer/extensions.ts` | edit | [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson) + [FR-6](FR.md#fr-6-uninstall-cleanup): integrate `mcpServers` manifest field — call mcp-config writer/remover for any extension declaring it |
| `src/updater/github.ts` | edit | [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux): добавить `mcpServers?: Record<string, McpServerConfig>` в `ExtensionManifest` interface (existing location) |
| `src/doctor/checks/chrome-devtools-mcp-mux.ts` | create | [FR-4](FR.md#fr-4-pomogator-doctor-checks-5-checks): CDMM-1..CDMM-5 implementations |
| `src/doctor/checks/index.ts` | edit | [FR-4](FR.md#fr-4-pomogator-doctor-checks-5-checks): register chrome-devtools-mcp-mux check |
| `tests/features/plugins/chrome-devtools-mcp-mux/PLUGIN017_chrome-devtools-mcp-mux.feature` | create | BDD feature 1:1 с AC-1..AC-8 ([extension-test-quality](../../.claude/rules/extension-test-quality.md)) |
| `tests/e2e/chrome-devtools-mcp-mux-installer.test.ts` | create | AC-1, AC-2, AC-5, AC-7 — installer + conflict + smart merge integration tests |
| `tests/e2e/chrome-devtools-mcp-mux-doctor.test.ts` | create | AC-4 — 5 doctor checks + per-extension driving |
| `tests/e2e/chrome-devtools-mcp-mux-skill.test.ts` | create | AC-3 — SKILL.md content assertions (5 sections + DEFAULT phrase + ≥10 triggers) |
| `tests/e2e/chrome-devtools-mcp-mux-uninstall.test.ts` | create | AC-6 — uninstall removes 5 artifacts atomically |
| `tests/e2e/chrome-devtools-mcp-mux-smoke.test.ts` | create | AC-8 — smoke test passes на Windows + Linux/macOS CI |
| `tests/e2e/chrome-devtools-mcp-mux-helpers.ts` | create | Local helpers (createFixtureWithExistingMcp, readMcpJson, findClaudeInChromeEntry) |
| `tests/fixtures/chrome-devtools-mcp-mux/existing-mcp-json/.mcp.json` | create | Pre-existing user `.mcp.json` с другими `mcpServers` keys для AC-2 smart-merge test |
| `tests/fixtures/chrome-devtools-mcp-mux/claude-in-chrome-mcp-json/.mcp.json` | create | `.mcp.json` с записью `claude-in-chrome` для AC-5 conflict test |
| `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` | create | Stub binary для smoke test без spawning real Chrome (CI-friendly tier) |
| `CLAUDE.md` | edit | Добавить упоминание chrome-devtools-mcp-mux в раздел "Key extensions" |
| `.specs/chrome-devtools-mcp-mux/CHANGELOG.md` | edit | Заполнить first entry с date 2026-04-28 |
| `.specs/chrome-devtools-mcp-mux/README.md` | edit | Заполнить final summary spec'а |
