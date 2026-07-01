# spec-backlog: design note

Outcome of the autofix-pipeline PoC (batch-11, workflows `w58a2hehx`,
`w0lr2hk9n`, `wnpo28tmb`).

## What the PoC proved

The per-spec parallel-agent fix pattern works mechanically: 4 agents
applied 10 real `Edit` calls on `.specs/<slug>/*.md` files without
collision, in 6 minutes wall-clock. The orchestration scales — each
agent has its own spec directory boundary, no cross-agent locks needed.

What the PoC also exposed:

1. **Detector false-positives are still here.** PoC v3 unwrapped 5
   links in `onboard-repo-phase0` that were technically "dead" (path
   `../../../foo` escapes the repo root) but **semantically valid**
   (the author meant `<repoRoot>/foo`). Closed by extending
   `findDeadLinks` with a `repoRoot + cleaned-relative` fallback —
   25 findings → 21.

2. **Mechanical "fix" can HIDE a real bug.** The vmodel spec was
   missing `ACCEPTANCE_CRITERIA.md` entirely; unwrapping the 6 links
   to it made the spec read as polished while the actual completeness
   issue (no AC file) became invisible. The fix surface and the
   "find-and-act" agent need a third option besides apply / skip:
   **enqueue as a backlog task** for a specialist resolver.

## Backlog mechanism (v4.0.1 follow-up)

### Storage

`.dev-pomogator/.specs-backlog/<YYYY-MM-DD>.jsonl` — append-only JSONL
mirroring the existing `cross-spec-overrides.jsonl` pattern.

Entry shape:

```jsonc
{
  "ts": "2026-05-30T16:42:11.000Z",
  "slug": "spec-workflow-vmodel",
  "code": "impl-drift/dead-link",
  "category": "missing-spec-file",            // see below
  "evidence": {
    "file": ".specs/spec-workflow-vmodel/FR.md",
    "line": 80,
    "target": "ACCEPTANCE_CRITERIA.md",
    "occurrence_count": 6,
    "label_samples": ["AC-1", "AC-2", "AC-3", "AC-4", "AC-5"]
  },
  "suggested_resolver": "ac-author",
  "difficulty": "medium",
  "status": "open"                            // open | in-progress | resolved | wontfix
}
```

### Categories → resolvers

| Category | Resolver agent | Difficulty | What it does |
|----------|---------------|------------|--------------|
| `missing-spec-file` | `ac-author` | medium | Reads FR.md + label samples; generates ACCEPTANCE_CRITERIA.md skeleton with one section per FR-N |
| `missing-test` | `scenario-writer` | medium | Reads FR.md; generates `@featureN Scenario` skeletons with placeholder Given/When/Then |
| `ownership-conflict` | `owner-picker` | hard | Reads both spec FRs + `git log` on the contested path; recommends canonical owner |
| `contradictory-nfr` | `decision-arbiter` | hard | Reads both NFR sections + greps impl for actual configured values; flags ground truth |
| `missing-fr-section` | `fr-author` | medium | Reads cited context; drafts FR-N heading + body |
| `dead-link-typo` | `link-fixer` | easy | Substring-match basename against repo files; rewrites link target |

### Lifecycle

1. `dogfood` produces findings.
2. `autofix-pipeline` per-spec agent classifies each finding into one of:
   - `AUTO_FIX` (high-confidence rule, e.g. `dead-link-typo` with single
     match) → applies via `Edit` immediately.
   - `BACKLOG` (real bug, but creative work needed) → appends to JSONL.
   - `NOISE` (suspected detector false-positive) → no-op, suggest
     detector tweak via separate report.
3. `dev-pomogator-spec-backlog list [--category X] [--slug Y]` prints
   open entries.
4. `dev-pomogator-spec-backlog resolve <entry-id>` spawns the
   `suggested_resolver` agent in isolation (worktree mode for safety)
   and tracks its diff.
5. On accept, JSONL entry updates to `status: resolved`.
6. On reject, entry updates to `status: wontfix` with reason.

### Why this design

- **Append-only JSONL**: matches the existing
  `cross-spec-overrides.jsonl` + `scope-gate-escapes.jsonl` patterns —
  no new infra, no DB.
- **Specialist resolvers**: each finding class has different "what's
  the correct fix" semantics. A generic LLM agent fumbles when the
  task is "decide which of two specs owns this module". A specialist
  with a tight prompt + small evidence window does it cleanly.
- **Worktree isolation for resolvers**: per the Workflow tool docs,
  `isolation: 'worktree'` is the right call when agents mutate files
  in parallel — resolver agents may need to edit BOTH specs in a
  conflict, so the isolation prevents partial-state commits.
- **No silent loss**: open entries persist between dogfood runs, so
  unresolved findings don't "disappear" the next time the detector
  changes.

### Open questions

- **Resolver agent SDK**: should resolvers be `.claude/skills/<name>/`
  (canonical Claude Code skill) or `tools/spec-backlog/resolvers/<name>.ts`
  (standalone)? Skills are easier to invoke from the chat; tools are
  easier to run from CI. Probably both via a thin skill that calls the
  tool.
- **Confidence thresholds**: each resolver should return a confidence
  score (`0..1`). Below 0.6 → flag for human review. Above 0.9 →
  auto-apply. Mid-range → AskUserQuestion. Need to tune.
- **Resolver verification**: every resolver-applied change should
  re-run the relevant detector and assert the finding is gone.
  Idempotent guarantee.

## Status

This is a design note — no implementation yet. Targeting v4.0.1
unless user prioritizes earlier.
