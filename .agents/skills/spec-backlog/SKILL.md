---
name: spec-backlog
description: |
  Drives the `dev-pomogator-spec-backlog` CLI to triage cross-spec-reconcile
  findings and dispatch specialist resolver agents at scale. Replaces the
  "3,878 AskUserQuestion calls" problem with a triage-and-batch pipeline:

    finding → classifier (AUTO_FIX / BACKLOG / NOISE)
            → backlog entry (.dev-pomogator/.specs-backlog/<DATE>.jsonl)
            → specialist resolver (ac-author / scenario-writer / fr-author /
                                   decision-arbiter / owner-picker / link-fixer)
            → produces .md skeleton OR recommendation file in the spec dir
            → entry marked resolved

  Use this skill when the user asks to: "посмотри что в беклоге",
  "почини спеки", "запусти fixer", "ingest findings", "resolve missing
  ACs", or any phrasing about cleaning up cross-spec-reconcile findings
  in bulk.

allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-backlog`](../.claude/skills/spec-backlog/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
