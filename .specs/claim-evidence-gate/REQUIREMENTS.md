# Claim-Evidence Gate — Requirements Summary

## Problem

Pinator currently mixes claim detection with work discovery and can interfere with ordinary dialogue. The feature must protect only explicit unfinished work owned by the current session.

## Required behavior

1. Activate only for an open current-session Claude task/todo, an approved plan still being executed, an actively worked spec with open mapped work, or an active native `/goal`.
2. With no active source, approve immediately and silently before classifier, judge, credential warning, spec census, fire log, or marker state.
3. Merge every simultaneous source with provenance and conflicts.
4. Give the judge a bounded, redacted packet containing active commitments, current response, result-confirmed tools, real-human mandate, and async facts.
5. Turn off a source only from its real lifecycle: task close, evidence-complete plan ledger, closed mapped spec work, native goal completion/clear, or explicit supersede/abandon.
6. Remove prose-based global activation and incident-specific prompt carve-outs that no longer support explicit work contexts.
7. Preserve warn-not-block for missing judge credentials, but only when an eligible context needs the judge.
8. Preserve the shipped Stop route, bundle, endpoint resolver consumer, and deps-absent operation.
9. Treat Codex as a separate input contract: prove an adapter or fail open; do not assume Claude transcript records.

## Source rules

- **Task:** `pending|in_progress` and owned/claimed by this session.
- **Plan:** successful result-correlated `ExitPlanMode`, per-commitment evidence ledger, ALL complete to close.
- **Spec:** session selection/mutation AND open mapped task/phase.
- **Goal:** verified native `goal_status` lifecycle; clear/resume parser branches require real fixtures.

## Quality gates

- BDD/integration first, real Stop bundle, Docker only.
- First invariant: ordinary no-context chat has zero classifier/judge/state side effects.
- Real-artifact fixtures for every external transcript shape.
- Mutation pins for eligibility, lifecycle closure, ALL-not-ANY, source merge, and final-message precedence.
- Smart spec verdict, full Docker suite, bundle build, hook review, pack inspection, and deps-absent installed-plugin smoke before completion.
