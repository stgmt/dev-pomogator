# Changelog

All notable changes to `edge-debug-port` extension will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-04-27

### Added
- `setup-edge-debug-port.ps1` — apply/revert script that patches Edge `.lnk` shortcuts (taskbar pinned, Quick Launch, Start Menu) and registry ProgID handlers (`MSEdgeHTM`, `MSEdgeMHT`, `MSEdgePDF`, `microsoft-edge:`) to inject `--remote-debugging-port=9222`.
- JSON backup at `~/.edge-debug-port-backup.json` with `-Revert` flag for one-line rollback.
- `-Port <int>` parameter to choose a custom debug port.
- `connect-over-cdp.example.mjs` — minimal Playwright example showing `chromium.connectOverCDP('http://localhost:9222')` against the user's real profile.
- `.claude/skills/edge-debug-port/SKILL.md` — agent-facing skill with triggers, when-to-use checklist, and anti-pattern warnings against `chromium.launch({channel:'msedge'})`.

### Context
Created during MS-18576 Phase 8 L5 reproduce session in the `smarts` repository (2026-04-27). The user explicitly objected to launching empty disposable Edge instances via Playwright and demanded the skill be reusable across projects.
