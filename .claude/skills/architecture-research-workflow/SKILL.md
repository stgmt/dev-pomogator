---
name: architecture-research-workflow
description: |
  Greenfield-architecture research workflow for genuinely large features
  (rebuilds, version bumps, multi-component systems). Drives 7 sequential
  stages that emit committable markdown into `.specs/<slug>/.architecture-
  research/<N>-<stage>.md`, then merges them into a final `RESEARCH.md`
  with one Appendix per stage. Auto-invoked by `create-spec` when the
  complexity heuristic matches (RU/EN keywords: "архитектур*", "v\d+",
  "rebuild", "перепроектировать", OR ≥3 components in the prompt).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, WebSearch, WebFetch
---

# architecture-research-workflow

Meta-skill that produces a defensible architecture decision instead of
the agent guessing. Use it BEFORE writing a spec when the work is
genuinely architectural (greenfield, version bump, replatform). For
small features (single-file changes, no architecture decisions) the
standard [`research-workflow`](../research-workflow/SKILL.md) is the
right tool — this skill is heavier and ships when stakes are higher.

## When to invoke

**Auto-trigger** (from `create-spec` Phase 1.5 complexity heuristic):
- prompt contains `архитектур*` / `architecture` / `rebuild` /
  `перепроектировать` / `v\d+` (version bump)
- prompt mentions ≥3 distinct components / services / surfaces

**Manual trigger** — explicit `Skill("architecture-research-workflow")`
in a session, or one of the keywords above in the user request when
`create-spec` hasn't started yet.

**Hard-OUT signals** (use regular `research-workflow` instead):
- brownfield refactor in a fixed stack with no architecture choice
- spec for a single-tech feature (e.g. add a CLI flag)
- bug-fix or test-only changes
- changes inside an existing well-defined boundary

## The 7 stages

Each stage produces ONE file
`.specs/<slug>/.architecture-research/<N>-<stage>.md`. Stages are
sequential — Stage 4 can't ship until Stages 1-3 are written. Stage 5
may **rewind** to Stage 4 if a new constraint surfaces (audit-trail
mandatory; hard limit 3 rewinds prevents infinite loops).

| # | Name                  | Output |
|---|-----------------------|--------|
| 1 | Problem framing       | `1-problem-framing.md` — actor + outcome + constraints in plain language; what success looks like measurably |
| 2 | External-pain validation | `2-external-pain.md` — evidence the problem is real (user quotes, prod incidents, search trends, competitor analysis); skill REFUSES to proceed without ≥2 independent pain sources |
| 3 | Broad research        | `3-broad-research.md` — survey of approaches across the industry (open-source, vendor solutions, academic); each option scored ≤500 chars |
| 4 | Variant generation    | `4-variants.md` — ≥3 concrete architecture proposals with trade-offs; explicit failure modes per variant (crash / duplicate / poison / race / external-timing) |
| 5 | Decision Q&A loop     | `5-decisions-locked.md` — iterative AskUserQuestion sessions narrow variants; each Q&A exchange recorded with timestamp; `[REWIND]` markers when a new constraint forces re-opening Stage 4 |
| 6 | Phased rollout        | `6-rollout-phases.md` — break the chosen variant into ≤7 phases with explicit «if we stop here we still ship value» check per phase |
| 7 | Hand-off (merge)      | `7-handoff.md` + a freshly-rewritten `RESEARCH.md` with one Appendix per stage; sets `--research-done` flag so `create-spec` skips its own research invocation (recursion guard) |

## Stage outputs are committable

`.specs/<slug>/.architecture-research/` is NOT in `.gitignore`. Stages
read like a postmortem — future readers (including future-you) can
audit why a specific variant was chosen and what was rejected.

## How `create-spec` integrates

```
create-spec Phase 1.5:
  if (complexityHeuristic.matches(userPrompt)) {
    if (!hasResearchDoneFlag) {
      invoke Skill("architecture-research-workflow")
      // stage 7 will set --research-done before returning
    }
    skip create-spec's own research-workflow call
  } else {
    invoke regular Skill("research-workflow")
  }
```

The `--research-done` flag is the recursion guard — without it
create-spec → architecture-research-workflow → create-spec would loop.

## See also

- `scripts/init.ts` — create `.architecture-research/` + scaffold N stage files
- `scripts/merge.ts` — Stage 7 — concatenate all stage files into final RESEARCH.md
- `references/<N>-<stage>.md` — template per stage
- `../research-workflow/SKILL.md` — lighter sibling for non-architectural research
- `.specs/spec-generator-v4/FR.md` FR-12 — formal requirement
