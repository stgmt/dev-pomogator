---
name: corpus-health
description: >
  ONE report + 🟢/🔴 verdict over the health of an ENTIRE `.specs/` corpus (this repo or ANY
  other — corpus root is an input): (1) bare-id collisions across specs via a raw PRE-MAP node
  dump (the graph's map dedup silently drops last-writer losers), (2) unresolved/dangling edges,
  (3) untraced atoms (UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO, FR-37b), (4) graph-side
  stale FILE_CHANGES paths, (5) orphan project tests (FR-44/GT-1 reverse traceability — vitest
  it() ids with no spec scenario, the "test from nowhere" hole), (6) FRs citing no RESEARCH.md
  finding (FR-44/GT-2 — "a requirement nobody researched"), (7) upstream unlinked (FR-44/GT-4 —
  stories / use-cases / decisions wired to no requirement). The ORGANISM view — catches the disease class FR-36 was (47 of ~470
  FR nodes surviving collisions) BEFORE it is rediscovered by hand. INVOKE after touching the
  graph builder/parsers, before trusting corpus-wide counts, when onboarding a foreign spec
  corpus, or on a regular hygiene pass. Triggers (RU): "здоровье корпуса", "проверь корпус спек",
  "коллизии id в спеках", "битые рёбра графа", "corpus health". Triggers (EN): "corpus health",
  "spec corpus audit", "id collisions across specs", "dangling edges", "untraced atoms".
  Do NOT use for a per-spec verdict (spec-verdict.ts via spec-status), prose-link navigation
  (markdown-lsp), bulk anchor fixing (anchor-fix), or cross-spec semantic drift
  (cross-spec-reconcile).
allowed-tools: Bash, Read
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/corpus-health`](../.claude/skills/corpus-health/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
