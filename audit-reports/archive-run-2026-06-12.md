# Spec Archive Run — 2026-06-12

## Summary

**Nothing archivable — all candidates still referenced or ambiguous. This is the correct, conservative result.**

- Candidates evaluated: **24**
- Verdict breakdown: **ARCHIVE = 0**, **KEEP_FALSE_POSITIVE = 19**, **NEEDS_HUMAN = 5**
- Specs actually archived: **0**
- **0 false archival** (confirmed by the dogfood invariant runner on the live corpus).

Because there were **0 ARCHIVE verdicts**, the tool was run dry-run only; `--apply` was deliberately NOT invoked (the proof is conservative on purpose — no spec was moved, no orphaned test was pruned). No work was invented.

## Method / evidence

Driven entirely through `tools/specs-generator/spec-archive.ts` (which calls the MCP door's `get_archival_proof` per candidate and combines it with the legacy-triage supersession signal). Two independent runs were taken and **agree exactly**:

| Source | Output | File |
|--------|--------|------|
| Dry-run plan | `24 candidate(s): ARCHIVE=0 KEEP_FALSE_POSITIVE=19 NEEDS_HUMAN=5` | `.dev-pomogator/.tmp/archive-plan.txt` |
| Dogfood invariant runner | `24 candidates: {"ARCHIVE":0,"KEEP_FALSE_POSITIVE":19,"NEEDS_HUMAN":5}` + `✅ all invariants hold — 0 false archival on the live corpus` | `.dev-pomogator/.tmp/archive-dogfood-agent.txt` |

Audit log `.dev-pomogator/logs/spec-archive.jsonl` does **not exist** — consistent with zero moves (the tool writes audit-log entries only when an archive_spec move actually happens).

## Specs actually archived

**None.** No `archive_spec` move was performed. Nothing under `.specs/` was relocated to `.specs/archive/`, no orphaned tests were pruned. The repo is unchanged (no git-revert needed).

## KEEP_FALSE_POSITIVE (19) — still in use, left untouched

Each has live inbound references in the graph; legacy-triage suspected drift (`legacy=DRIFTED`) but the proof shows the spec is still referenced, so it is kept.

| Spec | Live inbound refs |
|------|-------------------|
| auto-capture | 4 |
| backlog/chrome-devtools-mcp-mux | 3 |
| backlog/claude-in-chrome-multisession | 2 |
| claude-mem-integration | 2 |
| codex-cli-support | 5 |
| extension-beta-flag | 2 |
| forbid-root-artifacts | 1 |
| global-dir-guard | 4 |
| install-diagnostics | 3 |
| onboard-repo-phase0 | 2 |
| personal-pomogator | 16 |
| pomogator-doctor | 21 |
| spec-phase-gate | 6 |
| spec-variant-matrix | 2 |
| specs-management-as-skill | 1 |
| strong-tests | 9 |
| test-statusline | 33 |
| verify-generic-scope-fix | 1 |
| worktree-setup | 1 |

## NEEDS_HUMAN (5) — ambiguous, escalated (NOT archived)

All five are **graph-clear** (the MCP proof found no live inbound refs → `proof=ARCHIVE`), but the **legacy-triage supersession verdict is `DRIFTED`**, not one of the archive-eligible classes `{SUPERSEDED, REMOVED, ABSORBED}`. The tool refuses to auto-archive a spec whose supersession status is merely "drifted" — drift means the spec diverged from code, which is NOT proof it was retired/superseded/absorbed. The two signals disagree, so each is handed to a human rather than force-archived.

| Spec | Why ambiguous |
|------|---------------|
| create-specs-bdd-enforcement | graph-clear (no live inbound refs) but supersession = DRIFTED, not SUPERSEDED/REMOVED/ABSORBED — drift ≠ retirement, so archival is not proven |
| plan-pomogator-plain-language | same: graph-clear, but supersession = DRIFTED (proof=ARCHIVE vs legacy=DRIFTED disagreement) |
| plan-pomogator-prompt-isolation | same: graph-clear, but supersession = DRIFTED |
| tui-statusline-mode | same: graph-clear, but supersession = DRIFTED |
| tui-test-runner-v2 | same: graph-clear, but supersession = DRIFTED |

**Recommended human action for each:** decide whether the spec is genuinely retired (then mark its supersession as SUPERSEDED/REMOVED/ABSORBED so it archives on the next run) or still intended work (then it should keep living and the drift should be reconciled against code). The tool will not move them until the supersession class is resolved.

## Honest verdict

**Nothing archivable — all 24 candidates are either still referenced (19) or ambiguous (5), which is the correct conservative outcome. 0 specs archived, 0 false archival.**
