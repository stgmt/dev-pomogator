---
name: context-menu
description: "Enable Claude Code and Codex in Windows right-click context menu. Install Nilesoft Shell, configure parallel menu entries, and manage Claude TUI plus Codex non-TUI YOLO launchers."
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# Context Menu - Claude Code + Codex

## When to Use

Trigger: `/context-menu` or user says "контекстное меню", "right-click", "правая кнопка", "nilesoft", "context menu", "меню проводника".

## Contract

The context menu supports two parallel channels:

- Claude Code: `imports/claude-code.nss` -> `~/.dev-pomogator/scripts/launch-claude-tui.ps1`
- Codex: `imports/Codex.nss` -> `~/.dev-pomogator/scripts/launch-Codex-tui.ps1`

Do not replace one channel with the other. The generated `shell.nss` imports must contain both:

```nss
import 'imports/claude-code.nss'
import 'imports/Codex.nss'
```

## Codex Plugin Install Rule (NO npm/npx)

When the user asks how to install dev-pomogator/context-menu for Codex, never suggest `npm`, `npx`, `npx dev-pomogator`, `github:stgmt/dev-pomogator`, or `--Codex`. That was the deprecated v1 installer path.

Use only the checked-out Codex context-menu install script from the repo/plugin root:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex-context-menu.ps1
```

The script runs `codex plugin marketplace add . --json`, `codex plugin add context-menu@dev-pomogator-codex --json`, and then `tools/context-menu/postinstall.ts --codex-only`.

## Install Workflow

Windows only. If not Windows, tell the user Nilesoft Shell is Windows-only.

1. Check/install Nilesoft Shell:

```bash
winget list Nilesoft.Shell
winget install Nilesoft.Shell --accept-package-agreements --accept-source-agreements
```

2. Check/install Windows Terminal:

```bash
winget list Microsoft.WindowsTerminal
winget install Microsoft.WindowsTerminal --accept-package-agreements --accept-source-agreements
```

3. From the plugin/repo root, run the installer:

```bash
node -e "require(require('path').join(process.cwd(),'tools','_shared','bootstrap.cjs'))" -- "tools/context-menu/postinstall.ts"
```

`postinstall.ts` is the source of truth. It copies both launch scripts to `~/.dev-pomogator/scripts/`, writes both NSS files under `C:\Program Files\Nilesoft Shell\imports\`, ensures both imports in `shell.nss`, and reloads Nilesoft Shell.

## Manual Fallback

Use the same global script paths that the generated NSS references:

```bash
mkdir -p ~/.dev-pomogator/scripts
cp scripts/launch-claude-tui.ps1 ~/.dev-pomogator/scripts/launch-claude-tui.ps1
cp scripts/launch-Codex-tui.ps1 ~/.dev-pomogator/scripts/launch-Codex-tui.ps1
```

Program Files writes require temp-file plus elevated copy:

```bash
powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \"temp.nss\" \"C:\\Program Files\\Nilesoft Shell\\imports\\Codex.nss\"' -Verb RunAs -Wait"
```

After editing NSS files, reload:

> Ctrl+Right-click desktop -> Shell -> Reload

## Generated Entries

Claude entry:

```nss
item(type='dir|back' admin=true title='Claude Code (YOLO + TUI)' image='@app.dir\imports\claude-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "<home>\.dev-pomogator\scripts\launch-claude-tui.ps1" -Yolo -ProjectDir "@sel.dir"')
```

Codex entry:

```nss
item(type='dir|back' admin=true title='Codex (YOLO)' image='@app.dir\imports\codex-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "<home>\.dev-pomogator\scripts\launch-Codex-tui.ps1" -Yolo -NoTui -ProjectDir "@sel.dir"')
```

Claude remains the single elevated YOLO+TUI entry. Codex is intentionally a single elevated YOLO entry without TUI for the first supported Codex iteration. Add Codex+TUI only as a separate verified follow-up.

## CLI Flags

Claude Code YOLO uses Claude's flag:

```bash
claude --dangerously-skip-permissions
```

Codex YOLO must use Codex-native flags:

```bash
codex -C "<project>" --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust
```

Never use `--dangerously-skip-permissions` in the Codex launch path.

## Trust Stores

The launchers intentionally write different trust stores:

- Claude: `launch-claude-tui.ps1` writes `hasTrustDialogAccepted: true` in `~/.claude.json`.
- Codex: `launch-Codex-tui.ps1` writes `[projects."<selected path>"] trust_level = "trusted"` in `~/.codex/config.toml`.

Codex trust handling must not touch `.claude.json`.

## Drift Check

If right-click behavior does not match source changes, run `/pomogator-doctor`. The `C-CTXM` check compares installed global scripts and NSS files with:

- `tools/context-menu/postinstall.ts`
- `scripts/launch-claude-tui.ps1`
- `scripts/launch-Codex-tui.ps1`

If stale, re-run:

```bash
node -e "require(require('path').join(process.cwd(),'tools','_shared','bootstrap.cjs'))" -- "tools/context-menu/postinstall.ts"
```
