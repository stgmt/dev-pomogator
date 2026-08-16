---
name: cross-spec-reconcile
description: |
  Cross-spec consistency analyzer — scans every `.specs/<slug>/` against
  every other and against the codebase, surfacing 28 classes of drift
  (uncovered claims, contradictions, runtime-identifier mismatch, missing
  files, foreign-spec edits, architectural decisions vs reality).
  Two modes: `light` (mechanical-only, <5s, no LLM) and `full` (adds
  LLM-semantic comparison via the Phase-3 judge with FR-26 deny-list
  enforcement). Output: per-spec `.specs/<slug>/consistency-report.yaml`
  + optional `consistency-report.sarif`. CRITICAL findings invoke a
  blocking AskUserQuestion with header ⚠️ CRIT; user override is logged
  to `.claude/logs/cross-spec-overrides.jsonl` for audit trail.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Agent
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/cross-spec-reconcile`](../.claude/skills/cross-spec-reconcile/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
