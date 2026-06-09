---
name: corpus-health
description: >
  ONE report + 🟢/🔴 verdict over the health of an ENTIRE `.specs/` corpus (this repo or ANY
  other — corpus root is an input): (1) bare-id collisions across specs via a raw PRE-MAP node
  dump (the graph's map dedup silently drops last-writer losers), (2) unresolved/dangling edges,
  (3) untraced atoms (UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO, FR-37b), (4) graph-side
  stale FILE_CHANGES paths, (5) orphan project tests (FR-44/GT-1 reverse traceability — vitest
  it() ids with no spec scenario, the "test from nowhere" hole), (6) FRs citing no RESEARCH.md
  finding (FR-44/GT-2 — "a requirement nobody researched"). The ORGANISM view — catches the disease class FR-36 was (47 of ~470
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

# corpus-health — the organism view over any `.specs/` corpus

`tools/spec-graph/corpus-health.ts` builds the ONE composite-keyed graph (FR-36) from a corpus
root and reports the four disease classes in one pass — graph-only, no subprocess spawns, ~1s on
a 3300-node corpus.

## Run it

```bash
# this repo
node --import tsx tools/spec-graph/corpus-health.ts

# ANY other corpus (the root containing `.specs/`)
node --import tsx tools/spec-graph/corpus-health.ts /path/to/other/repo

# machine-readable / strict gating
node --import tsx tools/spec-graph/corpus-health.ts --json
node --import tsx tools/spec-graph/corpus-health.ts --strict   # any debt ⇒ exit 1
```

Exit code: `0` ⇔ 🟢 (default gate = HARD classes: collisions + stale paths; `--strict` gates on
any debt incl. untraced atoms and dangling edges).

## Read the report

| Section | Disease | Why it matters |
|---|---|---|
| 1) collisions (raw pre-map) | same composite id parsed twice | the builder's map dedup keeps the FIRST and silently drops the rest — FR-36's 47-of-470 bug class; the RAW dump sees what the map hides |
| 2) dangling edges | edge endpoint with no node | an AC covering a deleted FR, a typo'd `@featureN`, a cross-root bare tag — connective tissue pointing at nothing |
| 3) untraced atoms (FR-37b) | UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO | the cell→atom invariants from the P14-2 traceability check, corpus-wide |
| 4) stale FILE_CHANGES (graph-side) | `implements` edge with action=edit, path missing on disk | the «58 stale `extensions/` paths» class that hid 9 P0s in v4 — checked across EVERY spec |
| 5) orphan project tests (FR-44/GT-1) | vitest `it()` id with no spec scenario | the «test from nowhere» reverse hole — a project test described in no `.feature` (graph is built FROM `.feature`, blind to project-side tests). INFO-class: gates `--strict`, not the hard verdict |
| 6) FRs citing no RESEARCH.md (FR-44/GT-2) | FR section with no `RESEARCH.md` reference, in a spec that HAS one | «a requirement nobody researched» — RESEARCH.md is not graph-ingested, so only this file pass sees it. Real corpus: 538 of 562 FR sections (~3% cite). INFO-class: gates `--strict` only |

## Division of labour
- **corpus-health** = the WHOLE-corpus cheap pass (this skill).
- **spec-verdict.ts** (`tools/specs-generator/spec-verdict.ts -Path .specs/<slug>`) = the per-spec
  AUTHORITATIVE verdict (adds audit-spec, coverage rollup, FR-8 semantic) — FR-37d: «valid/clean/
  done» is reportable ONLY off that verdict, never off bare validate-spec.
- **cross-spec-reconcile** = semantic contradictions BETWEEN specs (different axis).

## Live evidence (this corpus, 2026-06-06 — the skill fires + helps)
First real run immediately surfaced NEW debt outside spec-generator-v4: **118 graph-side stale
FILE_CHANGES paths** in other specs (worktree-setup, tui-test-runner-v2, … — the same
`extensions/` disease v4 had) and **10 dangling covers edges** in `fix-bg-output-loss` (ACs
referencing FR-10..14 that don't exist). Collisions: 0 (FR-36 fixed; the detector is regression-
guarded by a planted-duplicate test — `tools/spec-graph/__tests__/corpus-health.test.ts`).

## FR-37d guard — никогда не отмывать структурный pass как здоровье

Этот скилл (и любой агент, репортящий здоровье спеки) **ОБЯЗАН** цитировать
СМАРТ-вердикт — для одной спеки `spec-verdict.ts` и его gap list; для корпуса — этот отчёт
целиком. **ЗАПРЕЩЕНО** заявлять «valid / clean / done» на основании одного лишь
`validate-spec: 0 errors`. Правило: `.claude/rules/spec-verdict/no-structural-valid.md` (FR-37d).
