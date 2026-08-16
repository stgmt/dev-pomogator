---
name: tests-create-update
description: >
  This skill should be used when the user asks to "create a test",
  "write a test", "update test", "add test", "regression test",
  "bugfix test", "fix test", "создай тест", "обнови тест",
  "добавь тест", "напиши тест", "регрессионный тест".
  Also auto-triggered by PostToolUse hook when Claude writes or edits
  test files (tests/**, *.test.ts, *.test.cs, *Steps.cs).
  Teaches Claude to write integration-first tests with strong assertions,
  preventing 7 anti-patterns found in audit of 258+ issues across
  TypeScript/vitest and C#/xUnit/FluentAssertions projects.
argument-hint: "[create|update] [target file or domain]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion, Skill, Agent
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/tests-create-update`](../.claude/skills/tests-create-update/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
