---
name: out-session-advisor
description: >-
  Роль «аутсессионный адвизор»: отдельная сессия наблюдает, проверяет и управляет ДРУГОЙ
  живой агентной сессией (Claude Code) — видит ход мысли её субагентов, перепроверяет отчёты
  на «пиздёж» сверкой с диском/БД/live, управляет воркером через stream-json (ConPTY fallback),
  не «встаёт» на долгих думающих ходах. Плюс параллельная безопасность: git-гейт против
  `git add -A`/чужих staged, атомарные локалы, инвентаризация сессий по репо, «кто писал»,
  сводка ok/dirty/conflict.
  Triggers: "будь адвизором", "управляй той сессией", "проверь его вывод на пиздёж",
  "стопни когда говно", "напиши промпт сессии", "отслеживай транскрипт", "не останавливайся /
  не стопайся", "почему 403 опять", "events-only не спиздил", "out-session advisor",
  "drive the claude session", "verify the agent is not lying".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/out-session-advisor`](../.claude/skills/out-session-advisor/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
