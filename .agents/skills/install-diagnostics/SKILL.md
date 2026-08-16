---
name: install-diagnostics
description: >
  Diagnose silent or failed legacy v1 dev-pomogator installation via npx/npm. Do not use for
  Codex/canonical plugin installs; those use `codex plugin ...` and the context-menu skill. Use when user reports
  "ничего не происходит при установке", "молча", "silent install", "npx exits with no output",
  "exit code 2 без ошибок", "не работает установка", "ничего не выводит", "молчком",
  "fyfkbp установки", "анализ установки", "почему молча", "install fails silently", or shows
  a screenshot/log where `npx github:stgmt/dev-pomogator` returns to prompt with no installer
  output. Also use when checking why `~/.dev-pomogator/logs/install.log` was not updated after
  an install attempt.
allowed-tools: Bash, Read, Grep, Glob
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/install-diagnostics`](../.claude/skills/install-diagnostics/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
