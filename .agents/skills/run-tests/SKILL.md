---
name: run-tests
description: >
  Centralized wrapper for ANY long-running command — test frameworks
  (vitest/jest/pytest/dotnet/rust/go) AND non-test long bg via `--framework generic`
  (npm run build, dotnet ef migrations, sleep). Provides persistent log on disk
  + YAML status tracking — survives Claude Code Bash tool bg capture drops on Windows.
  INVOKE PROACTIVELY whenever you plan to run `npm test`, `pytest`, `dotnet test`,
  `cargo test`, `go test`, `vitest`, `jest` — especially in background. Also use
  for any non-test long bg command (build, migrations, smoke runs) via generic mode.
  Detects framework from project config files. Wraps with statusline/TUI monitoring.
allowed-tools: Read, Bash, Glob, Skill, Monitor
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/run-tests`](../.claude/skills/run-tests/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
