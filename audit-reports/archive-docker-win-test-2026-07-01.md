# Archive report — docker-win-test (2026-07-01)

**Action:** `.specs/docker-win-test/` → `.specs/archive/docker-win-test/` (proof-gated, git-revertable).

**Surfaced by:** the FR-57 scaffold-completeness dogfood (`audit-reports/fr57-scaffold-incomplete-dogfood.md`) — docker-win-test topped the list as a finalized-but-stub spec (7 documents still template scaffold). Investigation showed the correct fix is archival, not filling (its code is gone).

## Proof of abandonment

| Signal | Evidence |
|--------|----------|
| Implementation deleted | `tools/hyperv-test-runner/` (the code the README's Quick Start invokes: `docker-fixture.ps1`) does not exist on disk; deleted in the v4.0.0 batch `dab3a1be` (#32) |
| Zero references | `grep -rl "hyperv-test-runner\|docker-fixture\|dockur/windows"` over `tools/` + `scripts/` → none; over `tests/` → none |
| Graph-clear | `get_archival_proof(docker-win-test)` → verdict **ARCHIVE**, `live_inbound_count: 0` (no other spec references its nodes) |
| Both signals agree | supersession (code cut in v4 batch) + graph-clear (0 live inbound) → autonomous archive per the spec-archive skill (FR-45) |

## What moved

Whole spec dir (7 FR / 5 AC / 7 scenarios, all four phases finalized 2026-04-10, 0 tasks). The archive is sealed against the mutation door; the builder drops `.specs/archive/` from the live graph.

## Orphaned tests

None — no `tests/` step-defs or feature files reference docker-win-test / hyperv; its scenarios lived inside its own `.feature`, which moved with the archive. Nothing to prune.

## Reversibility

`git revert` of the move commit (or `git mv` back) restores the spec verbatim. No data destroyed.
