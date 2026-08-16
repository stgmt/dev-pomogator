---
name: pomogator-doctor
description: |
  Diagnostic tool для dev-pomogator plugin: проверяет environment aspects including GitHub CLI readiness, Node/Git/Bun/Python/MCP servers/claude-mem plugin/hooks registry/env vars/Claude Code version match/native statusLine/statusline widgets repo+cwd/context-menu install drift) и предлагает fix actions (incl. установка нативного statusLine ccstatusline, добавление repo/cwd виджетов, переустановка контекстного меню — всё по подтверждению). Use при подозрениях на broken plugin install, missing dependencies, stale hooks, или когда команды plugin behave unexpectedly. Triggers (Russian): "проверь окружение", "доктор", "диагностика помогатора", "почему не работает плагин". Triggers (English): "check environment", "doctor", "plugin diagnostics", "verify install". Output: severity-coded report (🟢 self-sufficient, 🟡 needs env vars, 🔴 needs external deps) с actionable hints. Можно invoke через slash-command `/pomogator-doctor` (also distributed via plugin) или напрямую как skill.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/pomogator-doctor`](../.claude/skills/pomogator-doctor/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
