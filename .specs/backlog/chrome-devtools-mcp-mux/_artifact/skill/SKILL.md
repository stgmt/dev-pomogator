---
name: chrome-devtools-mcp-mux
description: Use chrome-devtools-mcp-mux MCP as your FIRST and DEFAULT choice for any browser interaction (open page, take screenshot, read console, navigate, inspect DevTools, drive Chrome). It is a multiplexer that lets multiple Claude Code sessions share one Chrome instance with isolated tab contexts — vanilla chrome-devtools-mcp races between sessions and is unsafe in multi-session workflows. Fallback to claude-in-chrome ONLY when user explicitly needs browser extensions / password manager / ad-blocker; fallback to edge-debug-port + Playwright connectOverCDP ONLY when user explicitly wants their real Edge profile with existing tabs. NEVER call vanilla mcp__chrome-devtools-mcp__ tools when this MCP is configured — it bypasses isolation and breaks neighbouring sessions.
allowed-tools: mcp__chrome-devtools-mcp-mux__*, Bash, Read
---

# chrome-devtools-mcp-mux

## Mission

Make any browser-debug task — open page, screenshot, console errors, network panel, DOM inspection, performance trace — go through `mcp__chrome-devtools-mcp-mux__*` tools by default. The mux solves the multi-session race conditions of vanilla `chrome-devtools-mcp` (`list_pages` showing other sessions' tabs, `select_page` racing, `new_page` landing in wrong window) by giving each MCP client its own `BrowserContext` while sharing one Chrome profile.

## Triggers

Activate this skill on ANY of these requests/keywords:

- "open page", "navigate to", "go to URL", "browse to"
- "screenshot", "take a screenshot", "capture page"
- "console errors", "browser console", "DevTools console"
- "network panel", "network requests", "see XHR / fetch calls"
- "DOM", "inspect element", "page HTML"
- "browser", "chrome", "браузер", "хром"
- "посмотри страницу", "открой http://...", "что в консоли"
- "performance trace", "Lighthouse", "core web vitals"

## Decision Tree (priority-ordered)

1. **DEFAULT — `mcp__chrome-devtools-mcp-mux__*`.** First choice for every browser interaction listed in Triggers. Works correctly even when 2+ Claude Code sessions are running concurrently because each session sees only its own tabs.
2. **Fallback A — `mcp__claude-in-chrome__*`.** Use ONLY when at least one of these hard-OUT signals is present:
   - User explicitly requests their browser extensions (password managers, ad-blockers, dev extensions) — Chrome 136+ disables extensions when `--remote-debugging-port` is active, so mux flow turns them off; `claude-in-chrome` runs as an extension and sees them.
   - User explicitly says "use claude-in-chrome" / "use my browser session" / "use my logged-in tabs in main Chrome".
   - mux MCP is not in `.mcp.json` and `claude-in-chrome` IS configured (degraded fallback).
3. **Fallback B — `edge-debug-port` + Playwright `connectOverCDP`.** Use ONLY when:
   - User explicitly wants to drive their real Edge browser profile (existing tabs, real cookies, `bringToFront()` for screenshotting hidden tabs).
   - User has already applied the `edge-debug-port` skill in this session.
   - Task requires capturing a specific tab the user is currently looking at in their Edge.

## Hard rules (anti-patterns this skill prevents)

| Don't | Why | Do instead |
|---|---|---|
| Call `mcp__chrome-devtools-mcp__*` (vanilla, NOT mux) when chrome-devtools-mcp-mux is configured | Race conditions with neighbouring Claude Code sessions; `list_pages` exposes their tabs; `select_page` may grab someone else's tab | Always `mcp__chrome-devtools-mcp-mux__*` |
| Pick `mcp__claude-in-chrome__*` "by default" when both MCPs are configured | Loses multi-session isolation — main value of mux | DEFAULT to mux unless a hard-OUT signal applies |
| Spawn a fresh Chromium via Playwright `chromium.launch()` for "just a quick screenshot" | Empty disposable profile, slow, no auth | Use mux — it shares the existing Chrome profile |
| Run mux + `claude-in-chrome` in the SAME Chrome instance | Chrome 136+ disables ALL extensions when `--remote-debugging-port=N` is set; `claude-in-chrome` extension stops connecting | Pick one workflow per Chrome instance; or run mux against a SEPARATE `--user-data-dir` (separate Chrome profile) |
| Tell the user "I'll use claude-in-chrome" without checking if mux is configured | Surprises the user who installed mux exactly to avoid claude-in-chrome conflicts | Read `.mcp.json` first; if mux is there, use it |

## Compatibility

Starting Chrome/Edge **136** (April 2025), launching with `--remote-debugging-port=N` **disables all browser extensions** as a security mitigation against headless automation abuse. `chrome-devtools-mcp-mux` (via upstream `chrome-devtools-mcp` and puppeteer) launches Chrome with that flag — therefore in the same Chrome instance:

| Workflow | Setup | What works | What doesn't |
|---|---|---|---|
| `chrome-devtools-mcp-mux` (THIS SKILL) | mux entry in `.mcp.json` | Multi-session tab isolation, shared profile (cookies/login), zero conflicts between Claude sessions | Browser extensions (password managers, ad-blockers, claude-in-chrome) |
| `claude-in-chrome` MCP browser extension | extension installed + `claude-in-chrome` MCP entry | All browser extensions including the MCP one itself | Multi-session: two clients see each other's tabs; only safe for a single Claude session |
| `edge-debug-port` + Playwright connectOverCDP | `setup-edge-debug-port.ps1` applied | Drive user's real Edge profile (existing tabs, cookies, sessions), `bringToFront()` for hidden tabs | All Edge extensions disabled while flag is active |

The user can run **two separate Chrome instances** to combine workflows: regular Chrome with extensions for daily use + a separate `--user-data-dir` Chrome dedicated to mux automation. Document this if they ask.

## First-run browser preference prompt (FR-9)

On the **first** browser-debug request in a fresh Claude Code session, before issuing any `mcp__chrome-devtools-mcp-mux__*` tool call, you MUST check whether to surface the browser preference prompt:

1. Read `<projectRoot>/.mcp.json` → `mcpServers["chrome-devtools-mcp-mux"].env.CDMCP_MUX_CHROMIUM`.
2. Read `~/.dev-pomogator/.cdmm-browser-choice.json` if it exists.
3. **Show the prompt** if all of these are true:
   - `.mcp.json` mux entry exists.
   - The choice marker file is missing OR `dismissed: false`.
4. **Skip** the prompt forever if `dismissed: true` in the marker.
5. **Skip** the prompt for the rest of THIS session once it has been shown once (keep an in-memory note).

### Prompt template (write verbatim to chat as a regular text message)

```
Замечу: chrome-devtools-mcp-mux настроен использовать <CURRENT_BROWSER>
(installer auto-default). Уточни какой браузер юзать дальше:
  (A) Edge — оставить current default
  (B) Chrome — переключиться на Chrome (auto-detect)
  (C) Bundled Chromium — изолированный browser, отдельные cookies каждый раз (~170MB первый запуск)
  (D) Другой путь — введи "D <полный путь к .exe>"
  (E) Не спрашивать больше — фиксирует current choice навсегда
```

Replace `<CURRENT_BROWSER>` with a one-line description of `env.CDMCP_MUX_CHROMIUM`'s value (e.g. `Edge (msedge.exe)`, `Chrome (chrome.exe)`, or `bundled puppeteer Chromium` if env key absent).

### Mapping user reply → bash command

| User reply | Bash command |
|------------|--------------|
| `A` | `node .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs edge` |
| `B` | `node .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs chrome` |
| `C` | `node .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs bundled` |
| `D <path>` | `node .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs custom "<path>"` |
| `E` | `node .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs <current-choice> --dismiss` (where `<current-choice>` reflects the existing env, defaulting to `edge` on Windows) |
| `B` but Chrome auto-detect fails | helper exits with non-zero + hint; re-prompt user for explicit path via `D` |

After running the helper, parse its JSON stdout (`{ok, choice, binary, summary}`) and confirm in chat with one short sentence using the `summary` field.

### When NOT to prompt

- Marker file `dismissed: true` → never prompt again.
- `.mcp.json` does NOT contain a `chrome-devtools-mcp-mux` entry → installer hasn't run; no-op (let installer inject default first; prompt fires next session).
- The user's request is a `mcp__claude-in-chrome__*` or `edge-debug-port` flow (those have their own configuration) → no-op.

## Browser binary on Windows — Edge by default

dev-pomogator's installer auto-injects `CDMCP_MUX_CHROMIUM` env var pointing at the user's existing Microsoft Edge install on Windows (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). This avoids the 170MB puppeteer Chromium download and matches the project's Windows-first / Edge-first convention (mirrors `edge-debug-port` skill).

If `CDMCP_MUX_CHROMIUM` is missing in `.mcp.json` and the user wants Edge:

```json
{
  "mcpServers": {
    "chrome-devtools-mcp-mux": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp-mux@0.2.2"],
      "env": {
        "CDMCP_MUX_CHROMIUM": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      }
    }
  }
}
```

Other supported `CDMCP_MUX_*` env vars: `CDMCP_MUX_USER_DATA_DIR` (separate Chrome profile — useful for the "Fallback C / two browser instances" workflow), `CDMCP_MUX_HEADLESS=true` (CI / no-display), `CDMCP_MUX_SOCKET` (override IPC path).

> **Note:** chrome-devtools-mcp officially supports Google Chrome / Chrome for Testing only; "other Chromium-based browsers may work but are not guaranteed." Edge works in practice for typical tasks (page open, screenshot, console, network panel) — escalate to `/pomogator-doctor` if a specific tool misbehaves.

## When NOT to use

Do NOT activate this skill (use the listed alternative instead):

- **CI environments without a display** — mux runs Chrome headful by default; in CI export `CDMCP_MUX_HEADLESS=true`. If headless is impossible, use Playwright with bundled Chromium.
- **Pure Node.js scripts that don't need a browser** — fetch API directly, no need for an MCP.
- **Static markup unit tests** — use Playwright's own bundled browser, mux is overkill.
- **User explicitly requests vanilla `chrome-devtools-mcp` for testing** — respect the request, document the multi-session risk.
- **User explicitly requests their real Edge profile with extensions intact** — apply `edge-debug-port` skill instead.

## Verification (after applying this skill)

When in doubt that mux is wired correctly, run:

```bash
node .dev-pomogator/tools/chrome-devtools-mcp-mux/smoke-test.mjs
```

Expected: exit code 0 + `{"ok": true, "protocolVersion": "2024-11-05", "matchedTools": [...]}` on stdout. Any failure → escalate to `/pomogator-doctor` CDMM-* checks.

## See also

- `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` — alternative path for real-Edge workflow
- `.specs/chrome-devtools-mcp-mux/` — full feature spec (FR/AC/DESIGN)
- Upstream: <https://github.com/ochen1/chrome-devtools-mcp-mux>
