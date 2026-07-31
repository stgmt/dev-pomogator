# File Changes

| Path | Action | Requirements | Purpose |
|---|---|---|---|
| `tools/claim-evidence-gate/transcript_events.ts` | create | FR-2, FR-3, FR-6, FR-8, FR-12 | Parse bounded JSONL once and correlate task, plan, goal, tool-result, and turn events. |
| `tools/claim-evidence-gate/work_context.ts` | create | FR-1..FR-10, FR-12 | Build the pure four-source context with provenance, conflicts, revisions, and plan commitments. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | FR-1, FR-7..FR-12 | Make eligibility the first branch and scope judge/state behavior to active commitments. |
| `tools/claim-evidence-gate/turn_window.ts` | edit | FR-8, FR-12 | Consume shared events and give `last_assistant_message` precedence over lagging transcript text. |
| `tools/spec-graph/task-census.ts` | edit | FR-2, FR-5 | Preserve task replay and require session activity plus mapped open work for spec activation. |
| `tools/plan-pomogator/plan-gate.ts` or shared helper | edit | FR-3, FR-4 | Reuse deterministic plan identity and correlate successful approval results. |
| `tools/claim-evidence-gate/claim_classifier.ts` | edit | FR-9, FR-11 | Classify only claims mapped to active commitments; never discover work from prose. |
| `tools/claim-evidence-gate/game_guard_facts.ts` | edit or delete | FR-11 | Remove global arming and retain only facts relevant to an active commitment. |
| `tools/claim-evidence-gate/meridian-judge.ts` | edit | FR-7..FR-10 | Accept a bounded merged packet and return structured per-commitment judgments while preserving `resolveEndpoint`. |
| `tools/claim-evidence-gate/bench/judge-bench.ts` | edit | FR-9 | Benchmark active-context semantics instead of compensating for global arming. |
| `tests/fixtures/claim-evidence-gate/*.jsonl` | create | FR-2..FR-6, FR-12 | Store sanitized real task, plan, native-goal, and client lifecycle artifacts with provenance. |
| `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | edit | AC-1..AC-12 | Execute eligibility, lifecycle, merge, evidence, state, and distribution behavior through the real hook. |
| `tests/step_definitions/feature_claim_evidence_gate.ts` | edit | AC-1..AC-12 | Drive result-correlated real-hook assertions and side-effect invariants. |
| `tests/step_definitions/feature49_autosurface.ts` | edit | FR-2, FR-5, FR-11 | Keep generic census/router/replay coverage and remove old globally armed Pinator ownership. |
| `.specs/spec-generator-v4/{FR.md,ACCEPTANCE_CRITERIA.md,DESIGN.md,USER_STORIES.md,TASKS.md,spec-generator-v4.feature}` | edit | FR-2, FR-5, FR-11 | Reconcile FR-49 ownership: generic spec census/router/replay stays; Pinator policy moves here. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | replace | FR-12 | Ship the rebuilt dependency-safe Stop runtime. |
| `.env.example` | edit | FR-10 | Explain that judge credentials are consulted only after active eligibility. |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/meridian.ts` and generated mirror/bundle | edit | FR-10, FR-12 | Align diagnostics with conditional judge use without breaking shared provider consumers. |
| `docs/COMPONENTS.md` | edit | FR-1, FR-12 | Describe active-work-only Pinator behavior and distribution boundary. |
| `.codex/hooks.json` plus proven adapter fixtures/docs | edit | FR-12 | Preserve the launcher only with proven ownership mapping; otherwise test explicit fail-open behavior. |
| `.claude-plugin/hooks.legacy.json`, registry, manifests | verify; regenerate only if source wiring changes | FR-12 | Keep the canonical Stop route stable and prove generated parity. |
