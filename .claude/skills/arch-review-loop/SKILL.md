---
name: arch-review-loop
description: >
  Autonomous fix→verify→re-verify loop for architecture-decision-builder. Runs the whole
  verification battery via one driver (arch-review.ts), triages findings, fixes the mechanical
  ones, re-runs, and repeats until PASS — WITHOUT a human prompting each cycle. Triggers:
  "прогони цикл починок", "self-review loop", "verify-fix loop", "погоняй проверки сам",
  after editing any architecture-decision helper/spec, or before declaring the skill done.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, mcp__context7__resolve-library-id, mcp__context7__query-docs
---

# arch-review-loop

## Mission

Stop making the user prompt every fix→check→review step. ONE driver command surfaces the full
health of architecture-decision-builder; this skill loops on it: run → triage → fix mechanical
findings → re-run → repeat until **PASS** (or only known-false-positives + genuine design forks
remain). Report once at the end with the iteration log, not after every step.

## The driver (one command = the whole battery — ANY spec)

```
npx tsx tools/specs-generator/architecture-decision/arch-review.ts [--spec <slug>] [ARCHITECTURE-dir]
```

- **`--spec <slug>`** → runs the battery for `.specs/<slug>` (default `architecture-decision-builder`). Generic: validate-spec + audit-spec work for ANY spec; eval-runner runs only for architecture-decision-builder (it's the only one with `eval-runner-adb.py`). Use it to self-review any spec — e.g. `--spec pomogator-doctor` (caught real FR-link + scenario-count drift from a sibling commit).
- no `ARCHITECTURE-dir` → **skill/spec-source health** (eval if applicable + validate-spec + audit-spec). This is the loop's PASS condition.
- with an `ARCHITECTURE/` dir → also runs `audit` / `audit-completeness` / `audit-markers` on that generated artefact (informational about that run, not source).

Returns JSON `{verdict: PASS|FINDINGS, checks[], finding_count}` to stdout + a human TO-FIX list to stderr. Exit 0 = PASS, 1 = FINDINGS.

## Loop algorithm (autonomous — do NOT prompt between iterations for mechanical fixes)

1. **Run** the driver (no arg for skill-health). Record the iteration in a short log.
2. **Triage** each finding into one of three buckets:
   - **Mechanical** (fix silently, no user): paperwork drift (CHANGELOG count, @featureN not in TASKS, traceability rows), code typecheck errors, missing spec rows, broken cross-refs, stale fixtures, lint. **Fix it.**
   - **Known false-positive** (log + skip): e.g. audit-spec `PARTIAL_IMPL_DETECTION` on FR-1 matching the BMAD tier name "Deferred" (not a real partial impl). Append to `.claude/logs/arch-review-accepted.jsonl` `{ts, check, reason}` and do NOT treat as blocking. Do not invent false-positives to dodge real work.
   - **Genuine design decision** (the ONLY reason to stop and ask): a finding that needs a human choice — conflicting requirements, a trade-off, an external constraint, deleting someone's work. Collect ALL such forks and ask the user ONCE at the end in plain language (≤2 options each), not mid-loop.
3. **Re-run** the driver after applying mechanical fixes.
4. **Repeat** 1-3 until `verdict: PASS` (ignoring logged known-false-positives) OR no new mechanical finding was fixable this iteration (stuck → report).
5. **Guard:** max 6 iterations. If still FINDINGS after 6, stop and report what's stuck — do not thrash.
6. **Verify-for-real before PASS:** if any finding was an `UNBACKED_VERIFIED_MARKER`, do NOT just delete the marker — actually run context7 (`resolve-library-id` → `query-docs`) and `record-verify <dir> <lib> <ver>` if the claim holds, else downgrade the claim to `[UNVERIFIED]`. Never game your own verification step (see memory `never-fabricate-verification-markers`).
7. **Heavy gate (optional, end only):** after PASS on the fast battery, run Docker `bash scripts/docker-test.sh npx vitest run -t "ARCH"` once (background, per `no-blocking-on-tests`) to confirm e2e — don't run it every iteration.

## Reporting (once, at the end)

Emit a compact iteration log + final verdict:

```
arch-review-loop: PASS after N iterations
  iter 1: 4 findings → fixed CHANGELOG count, @feature23→TASKS; logged FR-1/deferred false-positive
  iter 2: PASS (skill-source)
  Docker: 34/34 ARCH ✓
  Design forks for you (if any): …
```

Only surface design forks + the accepted-false-positive list. Do not narrate every fix.

## Anti-gaming

- Do NOT mark a real finding as "false-positive" to skip work — the accepted-log is audited.
- Do NOT delete a failing assertion / unbacked marker to force green — fix the cause or genuinely verify.
- Do NOT loop-edit the same file with no net progress — if a check stays red after 2 fix attempts, it's a design fork → ask.

## Related

- Driver: `tools/specs-generator/architecture-decision/arch-review.ts`
- Skill under review: `.claude/skills/architecture-decision-builder/SKILL.md`
- Memory: `never-fabricate-verification-markers`, `self-review-must-be-default-not-prompted`
