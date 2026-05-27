# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/strong-tests/SKILL.md` | create | [FR-1](FR.md#fr-1-greenfield-strong-test-generation-with-pbt), [FR-2](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue), [FR-3](FR.md#fr-3-mutation-feedback-loop-until-threshold), [FR-4](FR.md#fr-4-multi-stack-auto-detection), [FR-5](FR.md#fr-5-12-point-self-eval-as-final-gate-with-passfail-report) — main skill workflow |
| `.claude/skills/strong-tests/references/anti-patterns.md` | create | [FR-2](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue) — 8 anti-pattern detailed catalogue + honnibal 8-category mutation reference |
| `.claude/skills/strong-tests/references/tooling-setup.md` | create | [FR-4](FR.md#fr-4-multi-stack-auto-detection) — 6-stack tooling matrix (TS+Python primary, Java/C#/Go/Rust documentation-only) |
| `.claude/skills/strong-tests/scripts/run-mutation.ts` | create | [FR-3](FR.md#fr-3-mutation-feedback-loop-until-threshold), [FR-4](FR.md#fr-4-multi-stack-auto-detection) — auto-detect stack + dispatch Stryker/mutmut subprocess + standardized JSON output |
| `extensions/test-quality/extension.json` | edit | extension-manifest-integrity rule — add skills.strong-tests + skillFiles.strong-tests entries for installer/updater tracking |
| `.claude/skills/tests-create-update/SKILL.md` | edit | NFR-U4 — add `## Related Skills` cross-link to strong-tests (write-time vs post-write differentiation) |
| `tests/e2e/strong-tests.test.ts` | create | extension-test-quality rule — 1:1 mapping vitest test ↔ strong-tests.feature scenarios (TESTQUAL001_01..05) |
| `.specs/strong-tests/strong-tests.feature` | edit | extension-test-quality rule — replace placeholder with 5 scenarios TESTQUAL001_01..05 for @feature1..@feature5 |
| `.specs/strong-tests/report.html` | create | Phase 6 deliverable — 8-section HTML report (executive summary / empirical foundation / existing-skills audit / incident analysis / spec summary / architecture / verification / limitations) |
| `.specs/strong-tests/REVIEW_NOTES.md` | create | spec-review skill output — already created during mid-Phase 2 smoke test, updated in Phase 3 final pass |
| `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` | create | [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook) — ast-grep based detector for Collection-returning / N×M / composition candidates; produces JSON per SCHEMA |
| `extensions/test-quality/tools/test-quality/posttool-jit.ts` | create | [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook) — PostToolUse hook handler; reads stdin tool_input, filters production paths, spawns detector, emits additionalContext, appends audit log |
| `extensions/test-quality/extension.json` | edit | [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook) — add PostToolUse hook entry array-format per `gotchas/installer-hook-formats.md`; add posttool-jit.ts + detect-invariant-candidates.ts to toolFiles/skillFiles |
| `tests/e2e/strong-tests-jit.test.ts` | create | [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook) — TESTQUAL001_06..08 BDD tests for JiT auto-trigger, suppression, behavioural prior |
| `.gitignore` | edit | [NFR-S4](NFR.md#security-cont--jit) — add `.claude/logs/strong-tests-skips.jsonl` to gitignore (runtime audit log, not committed) |
