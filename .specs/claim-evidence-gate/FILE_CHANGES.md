# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `tools/claim-evidence-gate/meridian-judge.ts` | edit | FR-15 `buildJudgeNoTokenDemand` (loud token demand) + exported `judgeAvailable`. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | FR-15 no-token branch emits the demand as the block reason (not stderr-only). |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Rebuilt bundle (the live Stop hook) with FR-15. |
| `tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` | delete | Retired — coverage migrated to the BDD feature below (commit fb043ad7). |
| `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | edit | Revived the orphan feature to 46 scenarios reconciled against the vitest twin. |
| `tests/step_definitions/feature_claim_evidence_gate.ts` | edit | Real step-defs driving the hook/classifier/turn_window for all 46 scenarios. |
| `tools/claim-evidence-gate/turn_window.ts` | edit | FR-31 detects actionable Stop-hook feedback / blocking errors as a live harness mandate while keeping them out of typed human intent. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.ts` | edit | FR-31 blocks review-only / no-work stops after actionable Stop-hook feedback with `stop-feedback-unaddressed`. |
| `tools/claim-evidence-gate/claim_classifier.ts` | edit | FR-31 adds the hook-synthesized `stop-feedback-unaddressed` claim class to the typed dispatch contract. |
| `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | edit | Adds CEGATE001_56/57 regressions for actionable Stop-hook feedback vs normal review requests. |
| `tests/step_definitions/feature_claim_evidence_gate.ts` | edit | Step-defs drive the real Stop hook and `latestActionableStopFeedback` extractor for CEGATE001_56/57. |
| `tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs` | edit | Rebuilt bundle (the live Stop hook) with FR-31. |
| `cucumber.json` | edit | Wired CEGATE001 into `default.paths`. |
