---
name: spec-status
description: >
  Honest, evidence-backed status of a spec — run it BEFORE claiming a spec/feature
  is done. Delegates verification to an INDEPENDENT sub-agent (fresh context, no
  goal-completion bias) that classifies each AC as verified / blocked / claimed-only
  with an evidence path, audits test-body quality (STRONG / WEAK / FAKE-POSITIVE-RISK),
  reads test-result recency, and separates environmental blockers from real failures.
  Triggers (RU): «статус спеки», «честный статус», «проверь готовность спеки»,
  «что реально сделано», «AC проверены?», «перед тем как сказать готово».
  Triggers (EN): «spec status», «honest status check», «before claiming done»,
  «is this spec actually finished», «verify AC evidence», «what is really done».
  Do NOT use for: writing/scaffolding a spec (use create-spec), running tests
  (use /run-tests), or general progress questions answerable from .progress.json alone.
allowed-tools: Bash, Read, Glob, Grep, Agent
---

# spec-status — honest, sub-agent-verified spec status

Goal (US-1): eliminate the goal-completion bias of the AI that just did the work.
The main AI does NOT judge "done" here — it gathers a compact, credentials-redacted
context bundle and hands verification to an **independent** sub-agent. Read-only:
this skill writes no files.

## When invoked

- `/spec-status [slug]` — explicit, or `Skill("spec-status")` proactively before
  any "done / готово / tests pass / feature complete" claim about a spec.
- No slug → the pre-pass auto-detects the active spec (newest `.progress.json`
  ≤7 days). If none, it prints "Pass slug explicitly" and stops (not an error).

## Workflow

### 1. Deterministic pre-pass (one Bash call)

Run the pre-pass — it auto-detects the spec (or validates an explicit slug),
builds the ≤4KB sub-agent context bundle with credentials redacted, and computes
the deterministic findings (AC claimed-only candidates, test-body quality, YAML
recency, environmental blockers):

```bash
npx tsx .claude/skills/spec-status/scripts/precheck.ts [slug]
```

Parse the JSON it prints:

- `active: false` → print `reason` verbatim (e.g. "Pass slug explicitly") and STOP.
- `active: true` → keep `bundle` and `deterministic` for the steps below.

Do not re-derive any of this yourself — the pre-pass is the single source of truth
for the bundle and the deterministic signals.

### 2. Base progress (reuse spec-status.ts — FR-10)

Wrap, do not reimplement, the existing reporter for phase/progress:

```bash
npx tsx tools/specs-generator/spec-status.ts -Path <bundle.spec_path>
```

Capture its output for the **Spec Progress** section. Never modify that script.

### 3. Delegate to the independent sub-agent (FR-3)

Invoke the sub-agent with the prompt template + the bundle. The sub-agent has NO
access to this conversation — that isolation is the whole point.

- Read `references/sub-agent-prompt.md`.
- Append the `bundle` JSON from step 1 and the `deterministic` findings (as a
  starting hypothesis the sub-agent must independently confirm against real files,
  NOT accept on faith).
- Call `Agent(subagent_type="general-purpose", description="Spec status verification", prompt=<template + bundle + deterministic>)`.
- Expect a single JSON object conforming to `honest-status-command_SCHEMA.md` §2.
- If the output is not valid JSON → fail open: render a skeleton report that marks
  AC verification "unavailable (sub-agent output unparseable)" and surfaces the
  deterministic findings only. Never silently claim verified.

### 4. Parent-computed sections (git — FR-7)

The sub-agent does not see git; compute it here:

```bash
git status --short
git log origin/main..HEAD --oneline
```

Count modified / staged / committed-unpushed / pushed, and how many touch the
spec scope (`.specs/<slug>/` + paths in its `FILE_CHANGES.md`).

### 5. Render (FR-9)

Merge sub-agent JSON + base progress + git + `deterministic.blockers` into markdown:

- `## Spec Progress` — phase + done/total from step 2.
- `## AC Status` — per AC: `✓ verified <evidence>` / `⏸ blocked <reason>` /
  `❌ claimed-only`. An AC is `✓` ONLY with a concrete evidence path — never on a
  bare TASKS.md `[x]`.
- `## Tests` — recency (fresh/stale/not_run + age) and the test-body quality table
  (file:line → STRONG/WEAK/FAKE-POSITIVE-RISK + reason).
- `## Git` — the counts from step 4.
- `## Environmental Blockers` — ONLY if `deterministic.blockers` is non-empty
  (Docker unreachable, dead test heartbeat). Keep these OUT of test "failures".

End with the combined structured JSON (SCHEMA §3) in a trailing fenced block for
programmatic consumers.

## Honesty rules (do not violate)

- A passing/“done” claim requires an evidence path; absence of evidence → `claimed-only`.
- An environmental problem (Docker down, stale heartbeat) is NEVER reported as a
  test failure — it goes under Environmental Blockers.
- The sub-agent's verdict prevails over the main AI's prior belief about the work.

## Reuse

- `tools/specs-generator/spec-status.ts` — base progress (wrapped, unmodified).
- `scripts/*.ts` — deterministic helpers (autodetect, ac-claims, test-quality,
  yaml-recency, env-blockers) driven via `precheck.ts`.
- `.claude/skills/strong-tests/SKILL.md`, `.claude/skills/tests-create-update/SKILL.md`
  — test-quality patterns the sub-agent applies (see `references/sub-agent-prompt.md`).

## Verification

- Deterministic helpers: `tests/e2e/spec-status.test.ts` (HSCMD001_01..05 + invariants).
- Sub-agent orchestration is LLM behaviour → manual-verify: run `/spec-status` on a
  real spec and confirm the Agent is invoked and its JSON parses (HSCMD001_AGENT).
