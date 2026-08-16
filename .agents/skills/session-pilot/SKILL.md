---
name: session-pilot
description: |
  Worktree dashboard plugin для Claude Code пользователей с 10+ ворктри.
  Триггеры (RU): "открой dashboard", "покажи мои ворктри", "список worktree",
  "launch claude в worktree X", "ресуми клода в ворктри Y", "создай worktree для Z",
  "перезапусти session-pilot", "проверь dashboard работает", "продиагностируй lm-saas LIVE".
  Триггеры (EN): "open worktree dashboard", "list my worktrees", "launch claude in worktree X",
  "resume claude in worktree Y", "create worktree for Z", "restart session-pilot",
  "diagnose live detection".

  Использовать when:
  (1) пользователь хочет открыть dashboard на http://localhost:8083 ИЛИ
  (2) автоматизировать worktree creation + claude launch ИЛИ
  (3) проверить health сервера ИЛИ
  (4) диагностировать почему ворктри не показывается LIVE ИЛИ
  (5) починить broken state (port conflict, stale PID, etc.)

  НЕ использовать для:
  - редактирования server.py — используй Edit tool напрямую
  - debugging Claude Code в общем — это про dashboard, not Claude itself
  - questions about Zellij Web Client itself — это отдельный пакет

allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__screenshot, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp
argument-hint: "<scenario-name>"
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/session-pilot`](../.claude/skills/session-pilot/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
