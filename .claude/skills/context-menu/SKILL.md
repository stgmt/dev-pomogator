---
name: context-menu
description: "Enable Claude Code in Windows right-click context menu. Install Nilesoft Shell, configure menu entries, manage YOLO/normal modes."
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# Context Menu — Claude Code в правой кнопке мыши

## When to Use

Trigger: `/context-menu` or user says "контекстное меню", "right-click", "правая кнопка", "nilesoft", "context menu", "меню проводника"

## Installation

Windows only. Выполнять шаги последовательно.

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

Read `C:\Program Files\Nilesoft Shell\shell.nss` and check if it contains `import 'imports/claude-code.nss'`.

If NOT present — append the import line:

1. Read current `shell.nss` content
2. Append `import 'imports/claude-code.nss'` at the end
3. Write full content to temp file in cwd: `temp-shell.nss`
4. Elevated copy:
```bash
powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \"temp-shell.nss\" \"C:\\Program Files\\Nilesoft Shell\\shell.nss\"' -Verb RunAs -Wait"
```
5. Delete temp file
6. Verify with Read

### Step 5: Create default claude-code.nss

Write default config (see Default Configuration below) using the elevated write pattern (Step 4 of Workflow).

### Step 6: Icon

Tell user:

> Для иконки в меню положите файл `claude-icon.ico` в `C:\Program Files\Nilesoft Shell\imports\`.
> Иконку Claude можно скачать с https://claude.ai/favicon.ico или использовать любую .ico.

### Step 7: Reload

Tell user:

> Для применения: **Ctrl+ПКМ на рабочем столе → Shell → Reload**

## Configuration

| Parameter | Value |
|-----------|-------|
| Nilesoft install dir | `C:\Program Files\Nilesoft Shell` |
| Config file | `C:\Program Files\Nilesoft Shell\imports\claude-code.nss` |
| Icon | `C:\Program Files\Nilesoft Shell\imports\claude-icon.ico` |
| Main config | `C:\Program Files\Nilesoft Shell\shell.nss` |

## File Permissions

The config file is in `Program Files` — direct `Write`/`Edit` will fail with `EPERM`.

**Write pattern (mandatory):**
1. Write content to a temp file in the current working directory (`temp-nilesoft.nss`)
2. Copy via elevated `cmd`:
```bash
powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \"temp-nilesoft.nss\" \"C:\\Program Files\\Nilesoft Shell\\imports\\claude-code.nss\"' -Verb RunAs -Wait"
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

**Claude Code (YOLO mode):**
```nss
item(type='dir|back' title='Claude Code (YOLO)' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude --dangerously-skip-permissions')
```

**Claude Code (normal):**
```nss
item(type='dir|back' title='Claude Code' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude')
```

**Claude Code (YOLO + TUI) — split-pane with test runner:**
```nss
item(type='dir|back' title='Claude Code (YOLO + TUI)' image='@app.dir\imports\claude-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "D:\repos\dev-pomogator\scripts\launch-claude-tui.ps1" -Yolo -ProjectDir "@sel.path"')
```

> Requires `scripts/launch-claude-tui.ps1` in the dev-pomogator repo. Launches Windows Terminal with Claude Code (YOLO) in top pane (70%) and Python TUI test runner in bottom pane (30%). TUI auto-picks up test progress from `/run-tests`.

**With model selection:**
```nss
item(type='dir|back' title='Claude Code (Opus)' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude --dangerously-skip-permissions --model opus')
```

**With prompt:**
```nss
item(type='dir|back' title='Claude Code + Review' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude --dangerously-skip-permissions -p "review this codebase"')
```

### Menu grouping

```nss
menu(type='dir|back' title='Claude Code' image='@app.dir\imports\claude-icon.ico')
{
    item(title='YOLO mode' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude --dangerously-skip-permissions')
    item(title='Normal' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude')
    item(title='Sonnet' cmd='wt.exe' args='-d "@sel.path" -- cmd /k claude --dangerously-skip-permissions --model sonnet')
}
```

## Workflow

### 1. Read current config

```bash
Read "C:\Program Files\Nilesoft Shell\imports\claude-code.nss"
```

### 2. Ask user what to do

Options:
- **Install** — full installation (Nilesoft Shell + config + icon)
- **Add item** — add a new context menu entry
- **Edit item** — modify existing entry (title, args, flags)
- **Remove item** — delete an entry
- **List items** — show current configuration
- **Reset** — restore to default (YOLO + normal)
- **Submenu** — convert flat items into a grouped submenu

### 3. Generate new .nss content

Build the complete file content based on user's choice.

### 4. Write via elevated copy

1. Write to `temp-nilesoft.nss` in current working directory
2. Elevated copy to `C:\Program Files\Nilesoft Shell\imports\claude-code.nss`
3. Clean up temp file
4. Verify with Read

### 5. Reload Nilesoft Shell

Tell the user:
> Для применения: **Ctrl+ПКМ на рабочем столе → Shell → Reload**

## Claude Code CLI Flags Reference

| Flag | Description |
|------|-------------|
| `--dangerously-skip-permissions` | Skip all permission prompts (YOLO mode) |
| `--model <model>` | Use specific model: `opus`, `sonnet`, `haiku` |
| `-p "<prompt>"` | Start with initial prompt |
| `--resume` | Resume last conversation |
| `--continue` | Continue last conversation |
| `--verbose` | Enable verbose output |
| `--max-turns <n>` | Limit agentic turns |

## Default Configuration

The auto-generated NSS file (via `tools/context-menu/postinstall.ts`) creates **6 entries**: 3 standard + 3 in an "Admin" submenu. The admin submenu uses `admin=true` so Nilesoft Shell triggers UAC at click time, launching Claude Code elevated (required for Hyper-V cmdlets, ADK installs, modifying files in `C:\Program Files\`, etc.).

```nss
// Standard (non-elevated) entries — for normal coding sessions
item(type='dir|back' sep='top' title='Claude Code (YOLO + TUI)' image='@app.dir\imports\claude-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "<launchScript>" -Yolo -ProjectDir "@sel.dir"')
item(type='dir|back' where=package.exists("WindowsTerminal") title='Claude Code (YOLO)' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.dir\." -- cmd /k claude --dangerously-skip-permissions')
item(type='dir|back' where=package.exists("WindowsTerminal") title='Claude Code' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.dir\." -- cmd /k claude')

// Elevated (admin) submenu — required for system-level operations
menu(type='dir|back' sep='bottom' title='Claude Code (Admin)' image='@app.dir\imports\claude-icon.ico')
{
    item(admin=true title='Claude Code (YOLO + TUI)' image='@app.dir\imports\claude-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "<launchScript>" -Yolo -ProjectDir "@sel.dir"')
    item(where=package.exists("WindowsTerminal") admin=true title='Claude Code (YOLO)' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.dir\." -- cmd /k claude --dangerously-skip-permissions')
    item(where=package.exists("WindowsTerminal") admin=true title='Claude Code' image='@app.dir\imports\claude-icon.ico' cmd='wt.exe' args='-d "@sel.dir\." -- cmd /k claude')
}
```

### When to use the Admin submenu

Use the **Admin** entries whenever the upcoming Claude Code session will need to:
- Run Hyper-V cmdlets (`Get-VM`, `New-VM`, `Restore-VMSnapshot`, `Checkpoint-VM`, `Set-VMFirmware`, etc.)
- Install/modify software via `winget` system-wide
- Edit files under `C:\Program Files\`, `C:\Windows\`, registry HKLM
- Run `Enable-WindowsOptionalFeature`, `Stop-Service`, `Set-ItemProperty HKLM:\...`
- Use `tools/hyperv-test-runner/` lifecycle scripts (vTPM, Secure Boot, snapshot ops)

Standard entries are sufficient for normal coding, file editing in user space, and most non-system tasks.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| EPERM on write | Use elevated copy pattern (see File Permissions) |
| Menu not updating | Ctrl+ПКМ desktop → Shell → Reload |
| Icon not showing | Verify `claude-icon.ico` exists in imports dir |
| `wt.exe` not found | `winget install Microsoft.WindowsTerminal` |
| UAC not appearing | Run elevated copy from interactive terminal |
| Nilesoft not in context menu | Check `shell.nss` has `import 'imports/claude-code.nss'` |
| winget not found | Install App Installer from Microsoft Store |
