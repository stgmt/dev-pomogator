# P16-8 STOP-confirm triage

Date: 2026-07-08

## Purpose

P16-8 fixes the prompt-time STOP-confirm behavior: the hook must warn loudly for the active spec, not nag every prompt with a corpus-wide count. This report is the explicit deferred-note for legacy specs that still have unconfirmed STOP state.

## Evidence

Measured with a repo-local scan of `.progress.json` files. The scan found 30 specs/partial-spec directories with at least one unconfirmed STOP state:

- 20 complete spec directories have all required docs plus a `.feature` file, but their old `.progress.json` state still has an unconfirmed STOP.
- 10 `spec-v3-verify-46316-*` directories are incomplete verification scratch specs: each has `.progress.json` only, no `.feature`, and is missing all 12 required markdown docs.

The important behavioral change is not to auto-confirm these silently. Auto-confirming would turn stale state into a false-green claim. Instead, the hook now keeps unrelated legacy specs quiet by default and surfaces the exact confirmation command only when the prompt names the active spec.

## Disposition

| Group | Count | Disposition | Why |
|---|---:|---|---|
| Active spec named by prompt/env | 1+ | Loud prompt-time STOP warning | The agent is working there now; skipping the phase checkpoint is actionable and must be visible. |
| Complete legacy specs with stale STOP state | 20 | Deferred, not auto-confirmed | They need per-spec review before `spec-status.ts -ConfirmStop ...`; mass-confirm would claim evidence the session did not verify. |
| `spec-v3-verify-46316-*` scratch dirs | 10 | Deferred cleanup candidates | They are incomplete verification artifacts, not real finished specs: no `.feature`, missing all required markdown docs. |

## Legacy specs deferred for future review

These complete legacy specs remain intentionally unconfirmed until a future per-spec review proves the phase output is actually complete:

- `auto-capture` — first unconfirmed: Discovery; current phase: Requirements.
- `bdd-mutation-quality` — first unconfirmed: Discovery; current phase: Discovery.
- `bdd-only-migration` — first unconfirmed: Discovery; current phase: Discovery.
- `bdd-test-scanner` — first unconfirmed: Discovery; current phase: Requirements.
- `carl-integration` — first unconfirmed: Discovery; current phase: Discovery.
- `claim-sanity-check` — first unconfirmed: Discovery; current phase: Discovery.
- `codex-init` — first unconfirmed: Discovery; current phase: Discovery.
- `context-menu` — first unconfirmed: Discovery; current phase: Discovery.
- `fix-bg-output-loss` — first unconfirmed: Finalization; current phase: Complete.
- `forbid-root-artifacts` — first unconfirmed: Finalization; current phase: Finalization.
- `lint-self-bootstrap` — first unconfirmed: Discovery; current phase: Discovery.
- `personal-pomogator` — first unconfirmed: Finalization; current phase: Complete.
- `plan-evidence-enforcement` — first unconfirmed: Discovery; current phase: Discovery.
- `prompt-suggest` — first unconfirmed: Discovery; current phase: Complete.
- `session-pilot` — first unconfirmed: Finalization; current phase: Finalization.
- `spec-generator-v4` — first unconfirmed: Finalization; current phase: Finalization; this is the active ongoing backlog and must not be confirmed until current work is closed.
- `spec-mcp-usability-dogfood` — first unconfirmed: Discovery; current phase: Discovery.
- `spec-variant-matrix` — first unconfirmed: Finalization; current phase: Complete.
- `specs-workflow-jira-mode` — first unconfirmed: Discovery; current phase: Discovery.
- `undefined` — first unconfirmed: Discovery; current phase: Discovery.

## Ten incomplete legacy scratch specs

These are explicitly deferred as cleanup candidates, not candidates for STOP confirmation:

- `spec-v3-verify-46316-1`
- `spec-v3-verify-46316-2`
- `spec-v3-verify-46316-3`
- `spec-v3-verify-46316-4`
- `spec-v3-verify-46316-5`
- `spec-v3-verify-46316-6`
- `spec-v3-verify-46316-7`
- `spec-v3-verify-46316-9`
- `spec-v3-verify-46316-10`
- `spec-v3-verify-46316-12`

Note: the scan shows ten numbered scratch directories in the current checkout, while the old validator symptom reported nine. The disposition is the same for every scratch directory: do not confirm; either archive/delete through the spec door in a dedicated cleanup, or leave ignored by the active-spec-only prompt surface.

## Resulting rule

- Default prompt: no corpus-wide `N specs with unconfirmed STOP` line.
- Active spec prompt: exact active spec + exact phase + exact `spec-status.ts -Path ".specs/<slug>" -ConfirmStop <phase>` command.
- Verbose mode: full corpus dump remains available with `SPECS_VALIDATOR_VERBOSE=1`.
