# Context Menu

Windows right-click context menu integration via Nilesoft Shell for local AI coding agents.
The feature has two parallel channels:

- **Claude Code channel** — existing, implemented entry `Claude Code (YOLO + TUI)` routed through `launch-claude-tui.ps1`.
- **Codex channel** — new parallel target, not a replacement for Claude, entry `Codex (YOLO)` routed through `launch-Codex-tui.ps1 -NoTui`.

## Ключевые идеи

- Claude Code and Codex are separate launch surfaces with separate NSS files, icons, scripts, flags, and trust stores.
- The owner-requested default keeps Claude as elevated YOLO+TUI. Codex is elevated YOLO without TUI for the first supported iteration; Codex+TUI is deferred until the Codex launcher path is verified separately.
- Codex support must use Codex-native flags and trust/config behavior, not Claude's `--dangerously-skip-permissions` or `~/.claude.json` model.

## Где лежит реализация

- **Claude channel app-код**: `tools/context-menu/postinstall.ts`, `scripts/launch-claude-tui.ps1`
- **Codex channel target app-код**: `tools/context-menu/postinstall.ts`, `scripts/launch-Codex-tui.ps1`
- **Wiring**: `C:\Program Files\Nilesoft Shell\shell.nss` imports `imports/claude-code.nss` and `imports/Codex.nss`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)

