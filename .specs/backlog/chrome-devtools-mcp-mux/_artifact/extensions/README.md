# chrome-devtools-mcp-mux extension

Registers the [`chrome-devtools-mcp-mux`](https://github.com/ochen1/chrome-devtools-mcp-mux) MCP server in user's `.mcp.json` and ships a Claude Code skill that directs Claude to use it as the **DEFAULT** browser-debug tool.

## What it does

`chrome-devtools-mcp-mux` is a multiplexer around upstream `chrome-devtools-mcp`. It lets multiple MCP clients (e.g., 2+ Claude Code sessions) share one Chrome instance while each gets its own isolated set of tabs (`BrowserContext`). Solves the race conditions that vanilla `chrome-devtools-mcp` has when two clients connect simultaneously: `list_pages` showing all tabs, `select_page` racing, `new_page` landing in the wrong window.

## Install

`npx dev-pomogator --claude` installs the skill + writes the MCP server entry to your project's `.mcp.json`. Pinned exact version (`chrome-devtools-mcp-mux@0.2.2`); bump requires explicit dev-pomogator release.

**On Windows the installer auto-injects `env.CDMCP_MUX_CHROMIUM`** pointing at the user's existing Microsoft Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). Skips the puppeteer-bundled Chromium download (~170 MB) and matches the project's Windows-first Edge convention. Falls back to system Chrome if Edge is absent. On macOS/Linux the env var is not set — puppeteer's bundled Chromium is used.

## Skill behavior

The bundled skill (`.claude/skills/chrome-devtools-mcp-mux/SKILL.md`) directs Claude Code to use `mcp__chrome-devtools-mcp-mux__*` as the **first and default** choice for any browser-debug request. Fallback paths to `mcp__claude-in-chrome__*` or `edge-debug-port` are documented as opt-out for narrow hard-OUT scenarios.

## Mutex with claude-in-chrome MCP

Chrome 136+ disables all browser extensions when launched with `--remote-debugging-port=N` (security mitigation, no override). `chrome-devtools-mcp-mux` (via upstream `chrome-devtools-mcp`) launches Chrome with debug port → cannot coexist with `claude-in-chrome` MCP browser extension in the same Chrome instance. Installer warns at install time when both are configured.

## See also

- Spec: `.specs/chrome-devtools-mcp-mux/` — full FR/AC/DESIGN
- Skill template: based on `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md`
- Upstream: <https://github.com/ochen1/chrome-devtools-mcp-mux>
