---
name: suite-failure-triage
description: >
  Triage a RED full test-suite into per-failure verdicts — mine / pre-existing-main /
  dirty-tree-artifact / isolation-bug / genuine-flake — instead of guessing or
  mislabelling everything a "flake". Use when `npm test` (the Docker suite) shows
  failures and you need to know which are YOURS to fix vs inherited, BEFORE merging or
  pushing. Triggers (EN): "triage the failures", "is this my regression or pre-existing",
  "why is the suite red", "which failures are mine", "flake or real bug", "before pushing
  check the reds". Triggers (RU): "разбери падения", "это мой регресс или нет", "почему
  красный сьют", "какие падения мои", "флейк или баг", "триаж падений". Do NOT use for a
  single known failure you already understand, or for writing tests (that's tests-create-update).
allowed-tools: Bash, Read, Grep, Glob
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/suite-failure-triage`](../.claude/skills/suite-failure-triage/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
