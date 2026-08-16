---
name: edge-debug-port
description: |
  Permanently configure Microsoft Edge on Windows to launch with
  --remote-debugging-port=9222 across taskbar, Start Menu, Quick Launch
  shortcuts and MSEdgeHTM/MSEdgeMHT/MSEdgePDF/microsoft-edge registry
  handlers. Lets Playwright/Puppeteer chromium.connectOverCDP attach to the
  user's REAL Edge profile (cookies, extensions, sessions, open tabs)
  instead of spawning an empty disposable Edge instance via
  chromium.launch({channel:'msedge'}). Use this skill BEFORE writing browser
  automation that needs the user's authenticated state, OR when an agent has
  been told not to open empty Edge windows. Reversible via -Revert.
allowed-tools: Read, Write, Edit, Bash, PowerShell, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/edge-debug-port`](../.claude/skills/edge-debug-port/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
