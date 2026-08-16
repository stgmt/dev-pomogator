---
name: arch-review-loop
description: >
  Autonomous fix→verify→re-verify loop for architecture-decision-builder. Runs the whole
  verification battery via one driver (arch-review.ts), triages findings, fixes the mechanical
  ones, re-runs, and repeats until PASS — WITHOUT a human prompting each cycle. Triggers:
  "прогони цикл починок", "self-review loop", "verify-fix loop", "погоняй проверки сам",
  after editing any architecture-decision helper/spec, or before declaring the skill done.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, mcp__context7__resolve-library-id, mcp__context7__query-docs
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/arch-review-loop`](../.claude/skills/arch-review-loop/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
