# chrome-devtools-mcp-mux — Implementation Archived

**Status:** removed from mainstream code 2026-05-22. Spec retained in backlog for historical reference.

**Why removed:** upstream `chrome-devtools-mcp-mux@0.2.2` (npm) fails on Windows with EACCES on socket binding. Multi-session safety on Windows is now handled by `claude-in-chrome-multisession` (hook-based, no socket dependency). Mux unverified on Linux/macOS; not worth maintaining a partial-platform feature.

## What was built (44/47 TASKS done)

- **Extension package** — `extensions/chrome-devtools-mcp-mux/` (extension.json with `mcpServers.chrome-devtools-mcp-mux → npx -y chrome-devtools-mcp-mux@0.2.2`, smoke-test.mjs, configure-browser.mjs first-run prompt helper).
- **Skill** — `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` instructing Claude to use mux as FIRST/DEFAULT for all browser-debug requests.
- **Installer wiring** — `src/installer/claude.ts` (lines 257–306) integrated `mcpServers` field reading from each extension manifest and atomic smart-merge into target `.mcp.json` via `writeServerEntry()`.
- **Conflict detection** — `src/installer/mcp-conflicts.ts` detected coexistence with `claude-in-chrome` Chrome extension (Chrome 136+ disables all extensions when `--remote-debugging-port=N`), emitting warning + non-interactive skip in CI.
- **Generic MCP config writer** — `src/installer/mcp-config.ts` (`writeServerEntry`, `removeServerEntry`, `readMcpJson`, `findSystemChromium`). **NOTE: this file was KEPT in mainstream** as generic infrastructure — any future extension declaring `mcpServers` in its manifest can use it.
- **Doctor checks** — `src/doctor/checks/chrome-devtools-mcp-mux.ts` (5 sub-checks CDMM-1..CDMM-5: extension installed / MCP entry / npx accessible / Chrome bin available / skill registered).
- **Uninstall** — `src/installer/uninstall-project.ts` step 7b removes managed `mcpServers` entries from `.mcp.json` (KEPT in mainstream — generic logic).
- **Tests** — 6 vitest test files + 1 helpers file in `tests/e2e/`, 13 BDD scenarios `PLUGIN017_01..13` in `.specs/.../chrome-devtools-mcp-mux.feature`.
- **First-run browser prompt (v0.2.0)** — conversational 5-option prompt (Edge / Chrome / bundled-isolated Chromium / custom path / don't-ask-again) when installer's auto-injected default doesn't match user preference, persisted in `~/.dev-pomogator/.cdmm-browser-choice.json`.

## What broke

- **Windows EACCES on socket bind** — upstream npm package `chrome-devtools-mcp-mux@0.2.2` (by ochen1) cannot bind its IPC socket on Windows. Reproduced repeatedly. No workaround found short of patching upstream.
- **Chrome 136+ extension lockout** — `--remote-debugging-port=N` (security mitigation) disables all browser extensions. Cannot be overridden. Mux gives up logged-in profile + extensions; users wanting both must fall back to `claude-in-chrome` (which has its own multi-session problem, now solved by `claude-in-chrome-multisession`).

## Files preserved in `_artifact/`

```
_artifact/
├── extensions/      — full extensions/chrome-devtools-mcp-mux/ tree
├── skill/           — .claude/skills/chrome-devtools-mcp-mux/SKILL.md
├── src/             — mcp-conflicts.ts, doctor/checks/chrome-devtools-mcp-mux.ts
└── tests/           — all 7 test files
```

`src/installer/mcp-config.ts` is NOT archived here — it stayed in mainstream as generic infrastructure.

## To resurrect

1. Wait for upstream `chrome-devtools-mcp-mux` to fix Windows socket binding (or fork it).
2. Restore artifacts from `_artifact/` to original paths.
3. Re-wire `src/installer/claude.ts` conflict block (lines 266–282 in archived form) and `src/doctor/checks/index.ts` registration.
4. Reinstall: `npm run build && dev-pomogator init`.

## Reference

- Original spec docs preserved in this directory: `FR.md`, `DESIGN.md`, `RESEARCH.md`, etc.
- Last working commit before removal: see `git log -- extensions/chrome-devtools-mcp-mux/` (note: files were untracked at removal time — `_artifact/` is the only restorable copy).
- Superseded by: `.specs/backlog/claude-in-chrome-multisession/`.
