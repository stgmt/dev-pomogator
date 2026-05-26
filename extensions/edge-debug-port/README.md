# edge-debug-port

Permanently configure Microsoft Edge on Windows so it **always** launches with `--remote-debugging-port=9222`. Once installed, Playwright / Puppeteer / Chrome DevTools Protocol clients can `connectOverCDP('http://localhost:9222')` to the user's **real** Edge profile (cookies, MCP extensions, saved tabs, authenticated sessions) instead of spawning an empty disposable Edge instance via `chromium.launch({channel:'msedge'})`.

## Why this exists

Browser-automation default of "launch a fresh browser" is wrong when:

- Target site needs prior authentication (Slack, Notion, Cleverence ServerAdmin, internal corp tools).
- User has MCP browser extension installed in their main profile and you want to keep using it.
- Headless rendering produces black screenshots for tabs that aren't the foreground tab in Edge's window (CDP `Page.captureScreenshot` is **read-only by design** and won't activate windows).
- User explicitly does not want their workflow disrupted by yet another Edge window.

This skill solves it: Edge launched any normal way (taskbar pin, Start Menu, link click, `microsoft-edge:` URI from another app) starts listening on `localhost:9222` for CDP commands. Your automation script connects to that port and uses `page.bringToFront()` to make a tab active and screenshot it — no separate browser instance needed.

## What it modifies

1. **Shortcut `.lnk` files** — taskbar pinned, Quick Launch, Start Menu (current user + all users), Desktop. Adds `--remote-debugging-port=9222` to `Arguments`.
2. **Registry ProgID handlers** — `MSEdgeHTM`, `MSEdgeMHT`, `MSEdgePDF`, `microsoft-edge:` (URL handler). Both HKCU and HKLM where present. Inserts the flag right after the `msedge.exe` quoted path in `(Default)`.

A JSON backup of every modified value is written to `~/.edge-debug-port-backup.json`, so revert is one command.

## Usage

After install:

```powershell
# Apply (default port 9222)
pwsh .dev-pomogator/tools/edge-debug-port/setup-edge-debug-port.ps1

# Custom port
pwsh .dev-pomogator/tools/edge-debug-port/setup-edge-debug-port.ps1 -Port 9333

# Verify (after closing+reopening Edge)
curl http://localhost:9222/json/version

# Revert
pwsh .dev-pomogator/tools/edge-debug-port/setup-edge-debug-port.ps1 -Revert
```

User must close all Edge windows and reopen at least once for the new shortcut/registry args to take effect. Edge restores prior session if "Continue where you left off" is set in `edge://settings/onStartup`.

## Connecting from Playwright

```js
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];                    // user's real default profile
let page = ctx.pages().find(p => p.url().includes('myapp')) ?? await ctx.newPage();
await page.bringToFront();                            // makes the tab active in its window
await page.screenshot({ path: 'shot.png' });          // now works reliably
await browser.close();                                // detach — does NOT close user's Edge
```

## Limitations

- HKLM registry edits require admin. If the script is run as a regular user, HKLM keys are skipped (HKCU still works). The 90% case — clicking Edge taskbar pin or Start Menu — is covered by shortcuts alone, no admin needed.
- `start msedge.exe` from `cmd.exe` and `Win+R msedge` bypass shortcuts and the URL-handler registry, so they will not get the flag. This is rare in interactive use.
- Edge auto-update overwrites the executable but does **not** touch shortcuts or `MSEdgeHTM` registry — patches survive updates.

## Anti-patterns

- ❌ `chromium.launch({channel:'msedge', headless:false})` — spawns a NEW Edge process with a TEMPORARY profile. No cookies, no extensions, no MCP. User will (rightly) complain.
- ❌ `chromium.launchPersistentContext({userDataDir: env.TEMP+'/edge-x'})` — same problem, separate empty profile.
- ✅ `chromium.connectOverCDP('http://localhost:9222')` after this skill — attaches to the live Edge.

## Files

- `tools/edge-debug-port/setup-edge-debug-port.ps1` — apply/revert script.
- `tools/edge-debug-port/connect-over-cdp.example.mjs` — minimal Playwright connect example.
- `.claude/skills/edge-debug-port/SKILL.md` — agent-facing skill description.

## Reverse engineering notes

- Why not Image File Execution Options (IFEO) `Debugger=`? — IFEO with a wrapper `.exe` recurses (the wrapper's CreateProcess to msedge.exe re-triggers the same IFEO entry). Avoidance requires low-level `RtlCreateUserProcess` or renaming the binary, which Edge auto-update would undo. Shortcuts + registry is invasive enough to cover real launch paths and survives updates.
- Why not the Edge Group Policy `RemoteDebuggingAllowed`? — it gates *whether* remote debugging is allowed at all, not whether to enable it on launch. There is no Microsoft-supplied policy to set the port automatically.
- The `EdgeBrowserRemoteDebuggingPort` REG_DWORD documented in some places refers to legacy ChakraCore Edge (UWP), not Chromium Edge.

## License

Same as parent dev-pomogator repository.
