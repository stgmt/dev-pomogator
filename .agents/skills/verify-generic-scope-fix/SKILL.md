---
name: verify-generic-scope-fix
description: Use BEFORE commit when diff adds 2+ items to an enum/switch/array that gates a shared codepath (files matching *Service.ts / *Validator.ts / *Gate.ts / *Guard.ts / *Policy.ts). Prevents adding variants whose creation flow bypasses the gate — making the fix structurally no-op. Triggered manually by user or when hook scope-gate-guard blocks a commit.
allowed-tools: Read, Bash, Grep, Glob
disable-model-invocation: true
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/verify-generic-scope-fix`](../.claude/skills/verify-generic-scope-fix/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
