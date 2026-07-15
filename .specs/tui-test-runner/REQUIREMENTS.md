# Requirements Checklist Matrix

## CHK-FR20-01: Default-off batch behavior

- **FR:** [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20)
- **AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-opt-in-batched-spec-door-transaction-feature20)
- **Feature:** `@feature20`
- **BDD:** WRAP002_01
- **Verification:** Without `--batch`, `/run-tests` retains its single-command path and does not request a spec-door transaction.

## CHK-FR20-02: Ordered validated transaction

- **FR:** [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20)
- **AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-opt-in-batched-spec-door-transaction-feature20)
- **Feature:** `@feature20`
- **BDD:** WRAP002_02, WRAP002_03, WRAP002_04
- **Verification:** `--batch` sends only dispatch-table commands in order; endpoint validation rejects an invalid batch before execution, otherwise reports a transaction identifier and every command outcome.

## CHK-FR20-03: No partial fallback

- **FR:** [FR-20](FR.md#fr-20-opt-in-batched-spec-door-transaction-for-run-tests-feature20)
- **AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20-opt-in-batched-spec-door-transaction-feature20)
- **Feature:** `@feature20`
- **BDD:** WRAP002_05, WRAP002_06
- **Verification:** An unavailable endpoint or failed validation produces an actionable error and never a local partial execution.
