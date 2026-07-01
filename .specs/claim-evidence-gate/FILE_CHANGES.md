# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `tools/claim-evidence-gate/meridian-judge.ts` | edit | FR-15 `buildJudgeNoTokenDemand` (loud token demand) + exported `judgeAvailable`. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | FR-15 no-token branch emits the demand as the block reason (not stderr-only). |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Rebuilt bundle (the live Stop hook) with FR-15. |
| `tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` | delete | Retired — coverage migrated to the BDD feature below (commit fb043ad7). |
| `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | edit | Revived the orphan feature to 46 scenarios reconciled against the vitest twin. |
| `tests/step_definitions/feature_claim_evidence_gate.ts` | edit | Real step-defs driving the hook/classifier/turn_window for all 46 scenarios. |
| `cucumber.json` | edit | Wired CEGATE001 into `default.paths`. |
