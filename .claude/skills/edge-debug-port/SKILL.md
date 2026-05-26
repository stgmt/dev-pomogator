---
name: edge-debug-port
description: Permanently configure Microsoft Edge on Windows to launch with --remote-debugging-port=9222 across taskbar, Start Menu, Quick Launch shortcuts and MSEdgeHTM/MSEdgeMHT/MSEdgePDF/microsoft-edge: registry handlers. Lets Playwright/Puppeteer chromium.connectOverCDP attach to the user's REAL Edge profile (cookies, extensions, sessions, open tabs) instead of spawning an empty disposable Edge instance via chromium.launch({channel:'msedge'}). Use this skill BEFORE writing browser automation that needs the user's authenticated state, OR when an agent has been told not to open empty Edge windows. Reversible via -Revert.
allowed-tools: Read, Write, Edit, Bash, PowerShell, AskUserQuestion
---

# Edge Debug Port Setup

## Mission

Make `chromium.connectOverCDP('http://localhost:9222')` "just work" against the user's running Edge — without ever launching a separate empty Edge process via `chromium.launch({channel:'msedge'})`.

## Triggers

Activate this skill when ANY of these is true:

- User says: «не открывай новый/пустой/голый браузер», "use my Edge", "don't start a separate browser", "use my logged-in session", «как сделать чтобы всегда так запускалось».
- The agent is about to write `chromium.launch({channel:'msedge'})` or `playwright launch chromium` to drive automation in a context where the user has tabs/cookies/extensions in main Edge.
- The user wants a screenshot/gif of a tab that's currently in their Edge but not the foreground tab — CDP `Page.captureScreenshot` returns black for hidden tabs by design, and the only fix is to attach via CDP and call `page.bringToFront()`.
- An automation script has previously failed because `document.hidden === true` in the target tab, OR `Page.captureScreenshot` timed out.

## When NOT to use

- CI environments — no user profile exists, plain `chromium.launch()` is correct.
- Pure unit/visual regression tests for static markup — CDP is overkill, use Playwright's own browser bundle.
- Linux/macOS without Edge — this skill is Windows + Edge only. (Equivalent for Chrome on macOS would patch `~/Library/Application Support/Google/Chrome` defaults, not in scope.)
- **User relies on Claude MCP `claude-in-chrome` extension** in the same Edge instance — this setup will DISABLE all extensions (Chromium 136+ security mitigation). See "Compatibility" below.

## Compatibility — MUTUALLY EXCLUSIVE with MCP extensions

Starting Chrome/Edge **136** (April 2025), launching with `--remote-debugging-port=N` **disables all browser extensions** as a security mitigation against headless automation abuse. There is no flag to override this — it's a hard-coded check in the browser.

Symptom after applying this skill: `mcp__claude-in-chrome__*` tools return `Browser extension is not connected`, even though the extension is installed and the user is signed in.

**Pick one workflow per Edge instance**:

| Need | Setup | What works | What doesn't |
|---|---|---|---|
| Use MCP `claude-in-chrome` (tabs_context, gif_creator, computer, javascript_tool) | **REVERT** this skill | All MCP browser tools | Playwright `connectOverCDP` — CDP port closed |
| Use Playwright `connectOverCDP` to drive real Edge profile | **APPLY** this skill | Playwright/Puppeteer CDP attach | All Edge extensions (MCP, password managers, ad-blockers) |

**Hybrid (two browser instances)**: keep main Edge without this skill (MCP works). Spawn a **separate** Playwright Chromium for CDP automation. This is two browser sessions — main has user state, automation has nothing. Useful only when automation doesn't need user's auth.

**Default recommendation for Claude Code agents**: use MCP `claude-in-chrome` extension. Apply THIS skill ONLY when the user explicitly says: «настрой Playwright connectOverCDP», «expose Edge debug port», «подключись к моему Edge через CDP» — and is OK with extensions being disabled until revert.

## Inputs

- Optional `-Port <int>` for non-default port (script default: 9222).
- Backup path is fixed at `~/.edge-debug-port-backup.json` (override via `-BackupPath`).

## Execution

### 1. Apply

```powershell
pwsh .dev-pomogator/tools/edge-debug-port/setup-edge-debug-port.ps1
```

Modifies on disk:

| Where | What |
|---|---|
| `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Microsoft Edge.lnk` | append `--remote-debugging-port=9222` to Arguments |
| `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\Microsoft Edge.lnk` | same |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk` | same |
| `%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk` | same |
| `%USERPROFILE%\Desktop\Microsoft Edge.lnk` (if present) | same |
| `%PUBLIC%\Desktop\Microsoft Edge.lnk` (if present) | same |
| `HKCU\Software\Classes\MSEdge{HTM,MHT,PDF}\shell\open\command` | inject flag after `msedge.exe` |
| `HKLM\SOFTWARE\Classes\MSEdge{HTM,MHT,PDF}\shell\open\command` | same (admin only) |
| `{HKCU,HKLM}\Software\Classes\microsoft-edge\shell\open\command` | same |

A JSON backup of every modified value is saved to `~/.edge-debug-port-backup.json`.

### 2. Restart Edge

The user must close all open Edge windows and reopen Edge **once**. Edge does not pick up new shortcut Arguments without restart. Recommend they verify `Continue where you left off` is selected at `edge://settings/onStartup` so the 51-tab session survives.

### 3. Verify

```powershell
curl http://localhost:9222/json/version
```

Expected: JSON object with `"Browser": "Edg/<version>"` and `webSocketDebuggerUrl`.

### 4. Connect from automation

Use `chromium.connectOverCDP('http://localhost:9222')` (Playwright) or any CDP client. ALWAYS call `page.bringToFront()` before `screenshot/video` or the tab may render as black.

### 5. Revert

```powershell
pwsh .dev-pomogator/tools/edge-debug-port/setup-edge-debug-port.ps1 -Revert
```

## Hard rules (anti-patterns)

| Don't do | Why | Do instead |
|---|---|---|
| `chromium.launch({channel:'msedge', headless:false})` | empty disposable profile, no user cookies/extensions, user will object | run `setup-edge-debug-port.ps1`, then `chromium.connectOverCDP('http://localhost:9222')` |
| `chromium.launchPersistentContext({userDataDir: env.TEMP+'/edge-x'})` | same — separate empty profile | same |
| Screenshot a tab via CDP without `bringToFront()` | hidden tabs return black raster (CDP `Page.captureScreenshot` is read-only by design) | `await page.bringToFront()` immediately before screenshot |
| Writing your own IFEO `Debugger=` wrapper | recursion, blocked by Edge auto-update, fragile | use this skill — shortcut + registry patches survive updates |

## Verification checklist

After running setup and reopening Edge, all of these must pass:

- [ ] `curl http://localhost:9222/json/version` returns 200 with `Edg/...` Browser field.
- [ ] `curl http://localhost:9222/json/list` returns ≥1 page entry per open tab.
- [ ] `chromium.connectOverCDP(...)` then `browser.contexts()[0].pages()` returns the user's actual open tabs.
- [ ] `page.bringToFront()` followed by `page.screenshot(...)` produces a non-black image.

If any fails, check:
- Edge wasn't fully closed before reopening (lingering background Edge process).
- Process started via `start msedge` from cmd or Run dialog (bypasses shortcut/handler).
- Antivirus / Group Policy preventing remote debugging — see `edge://policy` for `RemoteDebuggingAllowed`.

## Output

A short summary back to the caller:

```
edge-debug-port: applied
  shortcuts patched: 3
  registry keys patched: 4 (HKLM)
  backup: C:\Users\<user>\.edge-debug-port-backup.json
  next: close all Edge windows, reopen, then chromium.connectOverCDP('http://localhost:9222')
```

## See also

- `tools/edge-debug-port/connect-over-cdp.example.mjs` — minimal Playwright connect+bringToFront+screenshot example.
- `tools/edge-debug-port/README.md` — operational notes.
- Microsoft Edge remote debugging: <https://learn.microsoft.com/en-us/microsoft-edge/devtools/remote-debugging/windows>
