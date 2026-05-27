# Changelog — chrome-devtools-mcp-mux extension

## [0.1.0] — 2026-04-28

### Added
- Initial extension scaffold registering `chrome-devtools-mcp-mux@0.2.2` MCP server.
- Skill `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` directing Claude Code to use mux as the default browser-debug MCP.
- Smoke test helper at `tools/chrome-devtools-mcp-mux/smoke-test.mjs` for FR-8 transport verification.

### Notes
- Pinned upstream `chrome-devtools-mcp-mux@0.2.2` (Apache-2.0, by ochen1, single dep `chrome-devtools-mcp@0.22.0`). Bump version requires explicit dev-pomogator release with CHANGELOG entry.
- Installer auto-injects `CDMCP_MUX_CHROMIUM` env on Windows pointing at Edge (or Chrome) so users skip the 170MB puppeteer Chromium download. Mirrors project's Windows-first / Edge-first convention from `edge-debug-port` extension.
