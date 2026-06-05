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

# suite-failure-triage — turn a red suite into per-failure verdicts

A full Docker suite shows N failures. The trap is treating them as one bucket — or
waving them off as "flakes." In a real incident 7 reds split into: 1 my-regression,
2 pre-existing-main, 1 isolation-bug, 5 dirty-tree-artifacts (overlapping) — and the
"flakes" were mostly **deterministic bugs**. This skill is the method that separates them.
See `.claude/rules/.../feedback_verify-regressions-on-clean-checkout` memory + issue #45.

## The one rule before you start

**Do NOT trust a failure from a dirty working tree.** `scripts/docker-test.sh` builds the
image with `COPY . .`, shipping every uncommitted/untracked file. A dirty tree both
**fakes** failures (bloated image → timeouts; stray fixtures) AND **masks** real ones (an
isolated run uses the dirty copy that already has an uncommitted fix). Always re-run from a
**clean `git worktree` of HEAD** first.

## Step 1 — Enumerate the FULL failing set (no truncation)

From the suite's persistent log, list EVERY failure — do not `tail` the list:
```bash
PLOG=$(ls -t .dev-pomogator/.docker-status/test-run-*.log | head -1)
sed -E 's/\x1b\[[0-9;]*m//g' "$PLOG" | grep -nE "^ ?FAIL " | sort -u
sed -E 's/\x1b\[[0-9;]*m//g' "$PLOG" | grep -E "Test Files|Tests "   # the count to reconcile against
```
Reconcile `count == len(your list)`. If they differ, your grep truncated — re-extract. (This
is `verify-breadth-not-truncated` firing.)

## Step 2 — Clean-vs-clean: rule out the dirty tree

```bash
git worktree add --detach ../triage-clean HEAD
cp .env.test ../triage-clean/.env.test          # gitignored — not in the commit, copy it
( cd ../triage-clean && bash scripts/docker-test.sh )   # full clean run
```
Failures present on clean HEAD are REAL. Failures that vanish were dirty-tree artifacts
(commonly: 10s+ timeouts from a bloated `.feature`/fixture scan). Clean up after:
`git worktree remove --force ../triage-clean`.

## Step 3 — Determinism: is it a bug or a real flake?

Re-run the full clean suite a SECOND time. Same test red both runs = **deterministic**
(an ordering / shared-state bug — fixable, NOT a flake). Red once, green once = a genuine
nondeterministic flake (timing, chokidar, ports). First check the config — if
`fileParallelism:false` + a huge `testTimeout`, it is NOT contention/timeout; it is
sequential shared-state corruption.

## Step 4 — Attribution: mine vs pre-existing-main

For each REAL clean-HEAD failure, check whether your branch caused it:
```bash
git log origin/main..HEAD --oneline -- <test-file> <the-files-it-tests>
git worktree add --detach ../triage-main origin/main
cp .env.test ../triage-main/.env.test
( cd ../triage-main && bash scripts/docker-test.sh npx vitest run <suspect files> )
```
- Passes on `origin/main` + fails on your branch → **YOUR regression**. Fix it.
- Already failing on `origin/main` → **pre-existing main debt**. Flag (file an issue), don't
  own; do NOT game it green.
- File doesn't exist on main → branch-new; attribute by host/isolated repro instead.

## Step 5 — Mechanism for the deterministic ones

- **Shared on-disk file.** A test mutated/deleted a file a later test reads. Hunt it:
  `grep -rnE "\.mcp\.json|writeFileSync\(.*appPath|fs\.remove\(appPath|process\.chdir" tests/`.
  Fix the MUTATING test (capture in `beforeAll`, restore in `afterAll`) — not the victim.
- **Dirty-tree masking.** `git diff -- <test-file>`: an uncommitted change in the working
  tree is a fix that hasn't been committed. The clean-HEAD failure is the truth — commit it.
- **Stale hardcoded value.** `expected 13 to be 11` on a registry/count — the code grew; the
  assertion rotted. Fix the assertion to an exact SET (see `tests-create-update`).

## Output: a verdict table

```
| Failure | Real on clean HEAD? | Deterministic? | Verdict | Action |
|---|---|---|---|---|
| bundle.test | yes | yes (both runs) | isolation bug (mcp-setup deletes .mcp.json) | fix mutating test |
| hooks-stdin | yes | yes | stale count (dirty-tree masked the fix) | commit the set assertion |
| score-diff  | yes | yes | pre-existing main heuristic | file issue, don't game |
| analyze-features ×5 | NO (clean green) | — | dirty-tree timeout artifact | none |
```

## Anti-patterns (what this skill exists to stop)

- Calling a full-suite-only failure a "flake" without a 2nd run + isolated repro. Most are bugs.
- "Fixing" a failure by relaxing the assertion to match buggy output → gaming. Fix the cause; if
  it's a heuristic-design call (a threshold/pin), flag the owner via an issue, do not bump.
- Declaring "my work is clean" off a single dirty-tree run, or off an isolated run that misses a
  cross-file pin. The FULL clean-HEAD suite is the authoritative check.

## See also

- `.claude/skills/tests-create-update/SKILL.md` — how to WRITE tests that don't cause these
  (the isolation & drift anti-patterns).
- Memory `feedback_verify-regressions-on-clean-checkout` — the underlying discipline.
- Issue #45 — automated guards (tracked-file mutation detector, auto clean-vs-clean triage) that
  would mechanize this skill.
