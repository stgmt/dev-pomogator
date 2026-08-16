---
name: context-menu
description: "Install or repair the Codex-only Windows right-click context menu entry. Uses scripts/install-codex-context-menu.ps1; never npm/npx or Claude install paths."
allowed-tools: Read, Bash, Grep
---

# Context Menu - Codex Only

Use when the user asks for the Codex Windows right-click context menu.

Codex install is plugin-based, not npm-based:

```powershell
.\scripts\install-codex-context-menu.ps1
```

That script runs the Codex plugin CLI and then applies `tools/context-menu/postinstall.ts --codex-only`.

This installs only the Codex context-menu artifacts:

- `C:\Program Files\Nilesoft Shell\imports\Codex.nss`
- `C:\Program Files\Nilesoft Shell\imports\codex-icon.ico` (from installed OpenAI Codex app icon when available; generated fallback otherwise)
- `import 'imports/Codex.nss'` in `shell.nss`
- `~\.dev-pomogator\scripts\launch-Codex-tui.ps1`

Do not suggest `npm`, `npx`, `npx dev-pomogator`, `--Codex`, or the Claude plugin install path for Codex setup.
