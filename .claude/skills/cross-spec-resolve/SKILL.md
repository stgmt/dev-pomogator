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
7. **Re-invoke reconcile (batch re-check)** — batch fixes mean stale
   findings. Step 7 re-runs `cross-spec-reconcile (mode: full)` exactly once
   and diffs the fresh findings against the originals, stamping each original
   finding's `resolution_status` with the **outcome**:
   - `resolved` — the finding's exact key is gone from the fresh run;
   - `still_present` — the identical finding is still emitted;
   - `transformed` — the exact key is gone but a fresh finding shares its
     `code` (the fix shifted rather than removed it).
   (This OUTCOME stamp is distinct from the per-finding DECISION stamp —
   resolved/acknowledged/deferred/skipped — written during the interactive
   loop; see `scripts/recheck.ts` vs `scripts/update-status.ts`.)

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

## Scripts

- `scripts/walker.ts` — planner: reads the YAML, groups by severity →
  class → location, builds the 5-field explanation block per finding.
  Steps 1–3 of the loop.
- `scripts/update-status.ts` — step-7 closer: atomically rewrites the
  YAML to stamp `resolution_status` + `resolved_at` (+ `override_reason`
  for CRITICAL acknowledgments) on each handled finding. Drops nothing
  — unmatched decisions are reported via the result counters so the
  caller can warn.

The live AskUserQuestion loop (step 4) and Path A/B/C dispatch (step 5)
stay in this skill body — the scripts give the agent the pre-shaped
data + the audit-safe write helper, the skill provides the dialogue.

## Executable workflow (agent body — follow verbatim)

When invoked, execute this sequence:

```ts
// Step 1: Read.
const plan = planResolution({ repoRoot: process.cwd(), slug: SLUG });
if (plan.missing) { return "Run /cross-spec-reconcile first"; }

// Step 2 + 3: walker already deduped + ordered + built explanations.
const decisions = [];
for (const { finding, explanation } of plan.plan!) {
  // Step 4: Confirm via AskUserQuestion.
  // `promptHeader` (walker.ts) is the single source for the header label — the
  // SPECGEN004_40 binding asserts the same function, so skill + test never diverge.
  const header = promptHeader(finding.severity);   // '⚠️ CRIT' | 'WARN' | 'INFO'

  const answer = await AskUserQuestion({
    questions: [{
      question: `${explanation.header}\n` +
                `Files: ${explanation.files.join(', ')}\n` +
                `${explanation.plain}\n` +
                `WHY: ${explanation.why}`,
      header,                                // ≤12 chars
      multiSelect: false,
      options: explanation.options.map(o => ({
        label: o.label,
        description: o.isDefault ? 'recommended' : '',
      })),
    }],
  });

  const chosen = answer[<question-key>];
  let status: ResolutionStatus = 'skipped';
  let overrideReason: string | undefined;

  // Step 5: Path A/B/C dispatch (mechanical fixes — apply via Edit/Write).
  if (chosen.startsWith('Apply suggested fix')) {
    // ... mechanical Edit / Write per the finding.suggested_fix hint
    status = 'resolved';
  } else if (chosen.startsWith('Path A')) {
    // ... update spec body
    status = 'resolved';
  } else if (chosen.startsWith('Path B')) {
    // ... update implementation code
    status = 'resolved';
  } else if (chosen.startsWith('Path C')) {
    // ... append [OUT_OF_SCOPE: <reason>] marker
    status = 'deferred';
  } else if (chosen.startsWith('Acknowledge')) {
    // Step 6: extra confirm for CRITICAL override.
    const reasonAns = await AskUserQuestion({
      questions: [{
        question: `Override reason for ${finding.code}? (logged to JSONL audit)`,
        header: 'Override',
        multiSelect: false,
        options: [{ label: 'Type a reason below' }],
      }],
    });
    overrideReason = reasonAns['Override'] ?? 'no reason provided';
    appendOverride(process.cwd(), {
      timestamp: new Date().toISOString(),
      finding_code: finding.code,
      spec_slug: SLUG,
      reason: overrideReason,
    });
    status = 'acknowledged';
  } else if (chosen.startsWith('Abort')) {
    // Abort STOP → exit the loop and surface a NON-ZERO status (exitCodeForChoice,
    // walker.ts) so the STOP gate stays blocked. SPECGEN004_40 asserts this contract.
    process.exitCode = exitCodeForChoice(chosen);   // non-zero
    break;
  }

  // Step 6 (foreign-spec banner): if the fix edits another slug's file,
  // re-confirm with the banner before committing.
  if (explanation.requiresForeignSpecConfirm && status === 'resolved') {
    const banner = await AskUserQuestion({
      questions: [{
        question: `⚠️ This edits a foreign spec. Continue?`,
        header: 'Foreign',
        multiSelect: false,
        options: [{ label: 'Yes, edit it' }, { label: 'No, mark as deferred instead' }],
      }],
    });
    if ((banner['Foreign'] ?? '').startsWith('No')) status = 'deferred';
  }

  decisions.push({
    findingKey: findingKey(finding),
    status, overrideReason,
    timestamp: new Date().toISOString(),
  });
}

// Step 7: Stamp the YAML.
const res = updateStatus({ repoRoot: process.cwd(), slug: SLUG, decisions });
return `Resolved ${res.matched} findings (${res.unmatched} stale entries dropped).`;
```

This is the agent contract — follow the structure verbatim, only the
mechanical fix bodies (the `// ...` stubs) are filled in based on the
specific finding code. The script imports are:

```ts
import { planResolution, findingKey } from '.claude/skills/cross-spec-resolve/scripts/walker.ts';
import { updateStatus, type ResolutionStatus } from '.claude/skills/cross-spec-resolve/scripts/update-status.ts';
import { appendOverride } from '.claude/skills/cross-spec-reconcile/scripts/overrides-log.ts';
```

## See also

- `../cross-spec-reconcile/SKILL.md` — the analyzer that produces the YAML
- `../cross-spec-reconcile/scripts/overrides-log.ts` — shared JSONL audit
- `.specs/spec-generator-v4/FR.md` FR-18
