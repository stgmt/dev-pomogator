---
name: context-menu
description: "Enable Claude Code and Codex in Windows right-click context menu. Install Nilesoft Shell, configure parallel entries, and use scripts/install-codex-context-menu.ps1 for Codex installs; never npm/npx or --Codex."
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# Context Menu — Claude Code + Codex в правой кнопке мыши

## When to Use

Trigger: `/context-menu` or user says "контекстное меню", "right-click", "правая кнопка", "nilesoft", "context menu", "меню проводника"

## Installation

Windows only. Выполнять шаги последовательно.

## Codex Plugin Install Rule (NO npm/npx)

When the user asks how to install dev-pomogator/context-menu for Codex, never suggest `npm`, `npx`, `npx dev-pomogator`, `github:stgmt/dev-pomogator`, or `--Codex`. That was the deprecated v1 installer path.

Use only the checked-out Codex context-menu install script from the repo/plugin root:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex-context-menu.ps1
```

The script runs `codex plugin marketplace add . --json`, `codex plugin add context-menu@dev-pomogator-codex --json`, and then `tools/context-menu/postinstall.ts --codex-only`.

### Step 1: Check OS

```bash
[[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]] || uname -s | grep -qi windows
```

If not Windows — сообщить пользователю: "Nilesoft Shell работает только на Windows."

### Step 2: Install Nilesoft Shell

```bash
winget list Nilesoft.Shell
```

- Already installed → skip
- Not found → install:

```bash
winget install Nilesoft.Shell --accept-package-agreements --accept-source-agreements
```

After install verify directory exists:

```bash
ls "C:/Program Files/Nilesoft Shell/shell.nss"
```

### Step 3: Install Windows Terminal (dependency)

```bash
winget list Microsoft.WindowsTerminal
```

- Not found → предложить:

```bash
winget install Microsoft.WindowsTerminal --accept-package-agreements --accept-source-agreements
```

### Step 4: Add import to shell.nss

Read `C:\Program Files\Nilesoft Shell\shell.nss` and check if it contains both `import 'imports/claude-code.nss'` and `import 'imports/Codex.nss'`.

If either import is NOT present — append the missing import line:

1. Read current `shell.nss` content
2. Append missing imports at the end
3. Write full content to temp file in cwd: `temp-shell.nss`
4. Elevated copy:
```bash
powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \"temp-shell.nss\" \"C:\\Program Files\\Nilesoft Shell\\shell.nss\"' -Verb RunAs -Wait"
```
5. Delete temp file
6. Verify with Read

### Step 5: Create default Claude and Codex NSS files

Write default configs (see Default Configuration below) using the elevated write pattern (Step 4 of Workflow): `claude-code.nss` and `Codex.nss`.

### Step 5b: Copy launch script to the global path (REQUIRED)

The "Codex (YOLO)" entry runs `powershell.exe -File "<home>\.dev-pomogator\scripts\launch-Codex-tui.ps1" -Yolo -NoTui`. The NSS references that exact path, so the file **must exist there** — otherwise PowerShell opens, can't find `-File`, and the window closes instantly (the entry "does nothing"). Nothing else populates this path under the canonical v2 plugin, so copy it explicitly.

The source lives inside the installed plugin tree, **not** the user's current project. `CLAUDE_PLUGIN_ROOT` is only injected for hook execution (NOT for skill-driven Bash), so resolve the source defensively — env var → version-aware plugin cache glob → repo dogfood fallback:

```bash
# Resolve the bundled launch script: plugin-root env → installed plugin cache → repo (dogfood)
SRC="${CLAUDE_PLUGIN_ROOT:-}/scripts/launch-Codex-tui.ps1"
[ -f "$SRC" ] || SRC="$(ls -d "$HOME"/.codex/plugins/cache/*/dev-pomogator/*/scripts/launch-Codex-tui.ps1 2>/dev/null | sort -V | tail -1)"
[ -f "$SRC" ] || SRC="scripts/launch-Codex-tui.ps1"
if [ ! -f "$SRC" ]; then echo "ERROR: launch-Codex-tui.ps1 not found in plugin tree"; exit 1; fi

mkdir -p ~/.dev-pomogator/scripts
cp "$SRC" ~/.dev-pomogator/scripts/launch-Codex-tui.ps1
echo "Installed launch script from: $SRC"
```

> `tools/context-menu/postinstall.ts` does the same via `copyCodexLaunchScript()` (it resolves the source through `import.meta.url`, so it works regardless of `CLAUDE_PLUGIN_ROOT`). This manual step is for the skill-driven (v2) install where postinstall is not auto-invoked. Both write to the **same** target — `~/.dev-pomogator/scripts/launch-Codex-tui.ps1` — which is exactly the path the generated NSS points at.

### Step 6: Icon

Tell user:

> Installer creates `codex-icon.ico` in `C:\Program Files\Nilesoft Shell\imports\`. It prefers the installed OpenAI Codex app icon; generated fallback is used only if the local app icon cannot be extracted. You may replace it with a custom `.ico` later.

### Step 7: Reload

Tell user:

> Для применения: **Ctrl+ПКМ на рабочем столе → Shell → Reload**

## Configuration

| Parameter | Value |
|-----------|-------|
| Nilesoft install dir | `C:\Program Files\Nilesoft Shell` |
| Config file | `C:\Program Files\Nilesoft Shell\imports\Codex.nss` |
| Icon | `C:\Program Files\Nilesoft Shell\imports\codex-icon.ico` |
| Main config | `C:\Program Files\Nilesoft Shell\shell.nss` |

## File Permissions

The config file is in `Program Files` — direct `Write`/`Edit` will fail with `EPERM`.

**Write pattern (mandatory):**
1. Write content to a temp file in the current working directory (`temp-nilesoft.nss`)
2. Copy via elevated `cmd`:
```bash
powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \"temp-nilesoft.nss\" \"C:\\Program Files\\Nilesoft Shell\\imports\\Codex.nss\"' -Verb RunAs -Wait"
```
3. Delete the temp file
4. Read the target file to verify

## NSS Syntax Reference

### Item format

```nss
item(type='TYPE' title='TITLE' image='IMAGE' cmd='CMD' args='ARGS')
```

### Key properties

| Property | Values | Description |
|----------|--------|-------------|
| `type` | `dir\|back` | Show on directory background and folder right-click |
| `title` | string | Menu item label |
| `image` | path | Icon path. `@app.dir` = Nilesoft install dir |
| `cmd` | executable | Program to launch |
| `args` | string | Arguments. `@sel.path` = selected path |
| `sep` | `top\|bottom\|both` | Separator line |
| `admin` | `true\|false` | Run as administrator |

### Common patterns

**Codex (YOLO mode):**
```nss
item(type='dir|back' title='Codex (YOLO)' image='@app.dir\imports\codex-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path" --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust')
```

**Codex (normal):**
```nss
item(type='dir|back' title='Codex' image='@app.dir\imports\codex-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path"')
```

**Codex (YOLO) — first supported iteration, no TUI pane:**
```nss
item(type='dir|back' title='Codex (YOLO)' image='@app.dir\imports\codex-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "D:\repos\dev-pomogator\scripts\launch-Codex-tui.ps1" -Yolo -NoTui -ProjectDir "@sel.path"')
```

> Requires `scripts/launch-Codex-tui.ps1` in the dev-pomogator repo. Launches Windows Terminal with Codex (YOLO) only. Codex+TUI is deferred until the Codex launcher proves the TUI module path and split-pane behavior.

**With model selection:**
```nss
item(type='dir|back' title='Codex (model)' image='@app.dir\imports\codex-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path" --dangerously-bypass-approvals-and-sandbox --model gpt-5-codex')
```

**With prompt:**
```nss
item(type='dir|back' title='Codex + Review' image='@app.dir\imports\codex-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path" --dangerously-bypass-approvals-and-sandbox -p "review this codebase"')
```

### Menu grouping

```nss
menu(type='dir|back' title='Codex' image='@app.dir\imports\codex-icon.ico')
{
    item(title='YOLO mode' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path" --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust')
    item(title='Normal' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path"')
    item(title='GPT-5 Codex' cmd='wt.exe' args='-d "@sel.path" -- cmd /k codex -C "@sel.path" --dangerously-bypass-approvals-and-sandbox --model gpt-5-codex')
}
```

## Workflow

### 1. Read current config

```bash
Read "C:\Program Files\Nilesoft Shell\imports\Codex.nss"
```

### 2. Ask user what to do

Options:
- **Install** — full installation (Nilesoft Shell + config + icon)
- **Add item** — add a new context menu entry
- **Edit item** — modify existing entry (title, args, flags)
- **Remove item** — delete an entry
- **List items** — show current configuration
- **Reset** — restore to default (Claude admin+YOLO+TUI and Codex admin+YOLO without TUI; see Default Configuration)
- **Submenu** — convert flat items into a grouped submenu

### 3. Generate new .nss content

Build the complete file content based on user's choice.

### 4. Write via elevated copy

1. Write to `temp-nilesoft.nss` in current working directory
2. Elevated copy to `C:\Program Files\Nilesoft Shell\imports\Codex.nss`
3. Clean up temp file
4. Verify with Read

### 5. Reload Nilesoft Shell

Tell the user:
> Для применения: **Ctrl+ПКМ на рабочем столе → Shell → Reload**

## Codex CLI Flags Reference

| Flag | Description |
|------|-------------|
| `--dangerously-bypass-approvals-and-sandbox` | Bypass approval prompts and sandbox restrictions (YOLO mode) |
| `--dangerously-bypass-hook-trust` | Bypass hook trust prompts for preconfigured local hooks |
| `--model <model>` | Use a specific Codex model |
| `-p "<prompt>"` | Start with initial prompt |
| `--resume` | Resume last conversation |
| `--continue` | Continue last conversation |
| `--verbose` | Enable verbose output |
| `--max-turns <n>` | Limit agentic turns |

## Default Configuration

Changed 2026-07-07: the generated context-menu files keep two parallel entries: `generateNss()` creates the Claude Code entry and `generateCodexNss()` creates the Codex entry. The Codex entry is elevated (`admin=true`), YOLO (`--dangerously-bypass-approvals-and-sandbox` via `-Yolo`), and explicitly non-TUI (`-NoTui`) for the first supported Codex iteration. If you need Codex+TUI later, add it as a separate, verified follow-up rather than silently changing the supported default.

```nss
item(type='dir|back' admin=true title='Codex (YOLO)' image='@app.dir\imports\codex-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "<launchScript>" -Yolo -NoTui -ProjectDir "@sel.dir"')
```

`admin=true` makes Nilesoft Shell trigger UAC at click time — every launch runs elevated (required for Hyper-V cmdlets, ADK installs, modifying files in `C:\Program Files\`, etc., and is simply the mode the owner always uses).

### Workspace trust auto-grant (FR-7)

`-Yolo` means `codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust`. Codex project trust is stored in `~/.codex/config.toml`, not `~/.claude.json` and not `~/.Codex.json`. `launch-Codex-tui.ps1`'s `Ensure-CodexProjectTrust` function atomically writes a `[projects."<selected path>"]` table with `trust_level = "trusted"` for the exact selected directory before invoking `codex`.

If you ever touch `Ensure-CodexProjectTrust`, re-test that a YOLO launch writes only `~/.codex/config.toml` and leaves Claude trust state unchanged.

## Logs

Every invocation of `launch-Codex-tui.ps1` (the only entry) is appended to:

```
~/.dev-pomogator/logs/context-menu-launch.log
```

Each entry records the timestamp, the args received, the resolved project dir, the detected Python, the launch command, the trust-grant outcome, and `Codex`'s own exit code once the pane closes — and on failure, the error message and stack trace. If a right-click launch misbehaves, read this file first. An **empty/absent** log after a click means the script itself never ran (the `.ps1` is missing at the global path — see Step 5b), not a launch error.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Menu entry does nothing | `launch-Codex-tui.ps1` missing at `~/.dev-pomogator/scripts/` — run Step 5b. Confirm: `Test-Path "$HOME\.dev-pomogator\scripts\launch-Codex-tui.ps1"` |
| Window flashes and closes with "this workspace has not been trusted" on a NEW directory | This is exactly the bug FR-7 fixes — confirm the installed `launch-Codex-tui.ps1` actually matches the plugin's current source (`/pomogator-doctor` check `C-CTXM` catches and offers to fix this: `tools/context-menu/postinstall.ts` is a once-run installer, editing the source never updates the already-installed copy) |
| Edited `postinstall.ts`/`launch-Codex-tui.ps1` but the menu still behaves like before | The installed copies are stale — re-run `powershell -ExecutionPolicy Bypass -File .\scripts\install-codex-context-menu.ps1 -PostinstallOnly` (or `/pomogator-doctor` → confirm the `C-CTXM` fix-action) to redeploy, then force a fresh Explorer restart (`Stop-Process -Force -Name explorer; Start-Process explorer.exe`) to rule out shell-level NSS caching before assuming the code itself is still wrong |
| Launch fails but no log written | Script never ran → `.ps1` absent at global path (Step 5b). If log exists, read the ERROR line |
| EPERM on write | Use elevated copy pattern (see File Permissions) |
| Menu not updating | Ctrl+ПКМ desktop → Shell → Reload, or force-restart Explorer (see above) |
| Icon not showing | Verify `codex-icon.ico` exists in imports dir |
| `wt.exe` not found | `winget install Microsoft.WindowsTerminal` |
| UAC not appearing | Run elevated copy from interactive terminal |
| Nilesoft not in context menu | Check `shell.nss` has `import 'imports/Codex.nss'` |
| winget not found | Install App Installer from Microsoft Store |
