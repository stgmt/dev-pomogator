# File Changes

| Path | Action | Requirement | Verification |
|---|---|---|---|
| `tools/prompt-suggest/prompt_suggest_core.ts` | Edit direct default and override diagnostics | [FR-1](FR.md#fr-1), [FR-3](FR.md#fr-3) | Prompt-suggest BDD observes exact effective ID. |
| `tools/prompt-suggest/prompt_suggest_stop.bundle.mjs` | Regenerate only from canonical source | [FR-1](FR.md#fr-1), [FR-4](FR.md#fr-4) | Source/bundle entry-point parity. |
| `tools/claim-evidence-gate/meridian-judge.ts` | Implement direct/routed policy, catalog validation, diagnostics | [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3) | Claim-gate BDD with catalog/failure fixtures. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | Regenerate only from canonical source | [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4) | Bundle entry-point parity. |
| `tools/learnings-capture/semantic.ts` | Replace active default, preserve override/fail-soft diagnostics | [FR-3](FR.md#fr-3) | Semantic selector BDD. |
| `tools/claude-mem-bootstrap/install-claude-mem.ts` | Propagate exact verified direct/catalog-selected ID as applicable | [FR-2](FR.md#fr-2), [FR-4](FR.md#fr-4) | Installer exact-ID BDD/current-behavior assertion. |
| `.claude/skills/cross-spec-reconcile/scripts/full-mode.ts` | Update canonical active policy | [FR-4](FR.md#fr-4) | Canonical/mirror parity check. |
| `.agents/skills/cross-spec-reconcile/scripts/full-mode.ts` | Synchronize derived mirror | [FR-4](FR.md#fr-4) | Canonical/mirror parity check. |
| `.claude/skills/meridian-model-call/SKILL.md` | Update canonical model/fallback guidance | [FR-4](FR.md#fr-4) | Exact-current-ID documentation assertion. |
| `.agents/skills/meridian-model-call/SKILL.md` | Synchronize derived mirror guidance | [FR-4](FR.md#fr-4) | Canonical/mirror semantic comparison. |
| `.claude/skills/cross-spec-reconcile/references/semantic-judge-prompt.md` | Update canonical active guidance if it defines behavior | [FR-4](FR.md#fr-4) | Documentation parity check. |
| `.agents/skills/cross-spec-reconcile/references/semantic-judge-prompt.md` | Synchronize derived mirror reference | [FR-4](FR.md#fr-4) | Documentation parity check. |
| `tests/features/plugins/prompt-suggest/PLUGIN010_prompt-suggest.feature` | Extend BDD coverage | [FR-1](FR.md#fr-1), [FR-4](FR.md#fr-4) | Docker BDD. |
| `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | Extend BDD catalog/diagnostic coverage | [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3) | Docker BDD. |
| `tests/features/core/CORE019_claude-mem-integration.feature` | Assert exact installer/current behavior ID | [FR-2](FR.md#fr-2), [FR-4](FR.md#fr-4) | Docker BDD. |
| `tests/step_definitions/feature_claim_evidence_gate.ts` | Add integration step support only | [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3) | Executed by feature scenarios. |
| `tests/step_definitions/feature_claude_mem_bootstrap.ts` | Update exact-ID integration assertions | [FR-2](FR.md#fr-2), [FR-4](FR.md#fr-4) | Executed by CORE019. |
| `tests/fixtures/haiku-to-deepseek-migration/` | Add redacted producer-shaped captures/workloads/pricing metadata | [FR-2](FR.md#fr-2), [FR-5](FR.md#fr-5) | Fixture provenance review and Docker BDD. |