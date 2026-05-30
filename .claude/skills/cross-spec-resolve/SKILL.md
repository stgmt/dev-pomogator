---
name: cross-spec-resolve
description: |
  Sibling to cross-spec-reconcile — walks the user through every finding
  in `.specs/<slug>/consistency-report.yaml` interactively. For each one
  it emits a 5-field explanation (code/severity/class, files/lines,
  plain-language description, WHY it matters, available options), then
  applies the chosen fix. Three resolution paths for
  `impl-drift/architectural-decision-vs-reality`:
    A — update the spec (decision was wrong)
    B — update the code (reality was wrong)
    C — defer with explicit OUT_OF_SCOPE marker
  Foreign-spec edits (modifying another slug's `.md`) fire an additional
  confirmation banner.
allowed-tools: Read, Write, Edit, AskUserQuestion
---

# cross-spec-resolve

The interactive other-half of `cross-spec-reconcile`. Read it before
fixing findings by hand — the 5-field explanation block forces the
agent to surface trade-offs the user might miss otherwise.

## When to invoke

- After `Skill("cross-spec-reconcile")` produced a non-empty
  `findings[]` and the user wants to walk through them
- Explicit `/cross-spec-resolve` (slash) — picks up the most recent
  `consistency-report.yaml`
- Missing report → exit with the literal hint
  «Run /cross-spec-reconcile first» (SPECGEN004_47 — no surprise auto-run)

## The 7-step loop

1. **Read** `.specs/<slug>/consistency-report.yaml`. If absent, hint +
   exit.
2. **Group** findings by severity → class → dedup by (code + spec_a +
   spec_b + location).
3. **Explain** — emit a 5-field block per finding:
   - `code` + `severity` + `class`
   - `files + lines` (concrete navigation anchors)
   - `plain language` (what the agent thinks the problem is)
   - `WHY` (the impact if we ship as-is)
   - `options` (the available paths, default highlighted)
4. **Confirm** — AskUserQuestion with the options from step 3.
5. **Path A/B/C** for `architectural-decision-vs-reality` (mechanical
   fixes go directly to step 6):
   - A — update spec (decision was wrong)
   - B — update code (reality was wrong)
   - C — explicit OUT_OF_SCOPE marker + reason
6. **Foreign-spec confirm** — if the edit touches another slug's `.md`,
   show an extra banner («⚠️ This edits foreign spec: <slug>») and ask
   again. Foreign-spec writes are riskier — the second confirm prevents
   accidental cross-contamination.
7. **Re-invoke reconcile** — batch fixes mean stale findings. Step 7
   re-runs `cross-spec-reconcile` and refreshes `resolution_status` on
   each YAML finding (resolved / acknowledged / deferred).

## Acknowledge & override path

When the user picks «Acknowledge & override» on a CRITICAL finding the
skill stamps the YAML finding with:

```yaml
acknowledged_by: user
override_reason: "<text the user typed>"
override_timestamp: 2026-05-30T03:00:00Z
```

AND writes a parallel JSONL line to
`.claude/logs/cross-spec-overrides.jsonl` via the shared writer in
`../cross-spec-reconcile/scripts/overrides-log.ts`. The two records
together let an auditor reconstruct who overrode what.

## See also

- `../cross-spec-reconcile/SKILL.md` — the analyzer that produces the YAML
- `../cross-spec-reconcile/scripts/overrides-log.ts` — shared JSONL audit
- `.specs/spec-generator-v4/FR.md` FR-18
