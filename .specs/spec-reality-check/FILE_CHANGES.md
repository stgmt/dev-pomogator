# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/spec-reality-check/SKILL.md` | create | [FR-1](FR.md#fr-1-skill-bundle-layout-feature1) — Skill bundle entry point + auto-trigger description |
| `.claude/skills/spec-reality-check/scripts/verify.ts` | create | [FR-2](FR.md#fr-2-file_changes-verification-checks-feature2), [FR-3](FR.md#fr-3-narrative-path-verification-feature3), [FR-4](FR.md#fr-4-code-drift-detection-via-git-log-feature4), [FR-5](FR.md#fr-5-tasksfile_changes-consistency-feature5), [FR-6](FR.md#fr-6-three-output-formats-feature6), [FR-14](FR.md#fr-14-graceful-file_changes-parser-fallback-feature14) — Main entry, 6 verification checks, 3 output formats |
| `.claude/skills/spec-reality-check/scripts/verify-hook.ts` | create | [FR-7](FR.md#fr-7-pretooluse-hook-on-exitplanmode-feature7), [FR-8](FR.md#fr-8-hook-fail-open-on-exception-feature8) — PreToolUse hook wrapper, fail-open behaviour |
| `.claude/skills/spec-reality-check/references/checks.md` | create | [FR-1](FR.md#fr-1-skill-bundle-layout-feature1) — Reference doc для 6 checks: descriptions + examples + root causes |
| `tests/fixtures/spec-reality-check/stale-create/FR.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture spec для FC_CREATE_EXISTS test |
| `tests/fixtures/spec-reality-check/stale-create/FILE_CHANGES.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture spec FILE_CHANGES |
| `tests/fixtures/spec-reality-check/missing-edit/FR.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture для FC_EDIT_MISSING test |
| `tests/fixtures/spec-reality-check/missing-edit/FILE_CHANGES.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture FILE_CHANGES |
| `tests/fixtures/spec-reality-check/narrative-drift/FR.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture для NARRATIVE_PATH_MISSING test |
| `tests/fixtures/spec-reality-check/narrative-drift/FILE_CHANGES.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture FILE_CHANGES |
| `tests/fixtures/spec-reality-check/code-drift/FR.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture для CODE_DRIFT_FR_ALREADY_DONE test |
| `tests/fixtures/spec-reality-check/code-drift/FILE_CHANGES.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture FILE_CHANGES |
| `tests/fixtures/spec-reality-check/task-orphan/FR.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture для TASKS_FC_CONSISTENCY test |
| `tests/fixtures/spec-reality-check/task-orphan/FILE_CHANGES.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture FILE_CHANGES |
| `tests/fixtures/spec-reality-check/task-orphan/TASKS.md` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Fixture TASKS с orphan file ref |
| `tests/e2e/spec-reality-check.test.ts` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Vitest scenarios SRC001_01..07 для verify.ts |
| `tests/e2e/spec-reality-check-hook.test.ts` | create | [FR-10](FR.md#fr-10-test-coverage-feature10) — Vitest scenarios SRCHOOK001_01..03 для hook integration |
| `extensions/specs-workflow/extension.json` | edit | [FR-9](FR.md#fr-9-extension-manifest-wiring-feature9) — Register skill в skills + skillFiles, add PreToolUse hook entry, bump version 1.20.0→1.21.0 |
| `.claude/skills/spec-review/SKILL.md` | edit | [FR-12](FR.md#fr-12-spec-review-category-15-integration-feature12) — Add Category 15 "Reality Drift" в trigger таблицу + раздел |
| `.claude/skills/spec-review/references/category-15-reality-drift.md` | create | [FR-12](FR.md#fr-12-spec-review-category-15-integration-feature12) — Reference doc для Category 15: 6 sub-checks + severity mapping |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | [FR-13](FR.md#fr-13-create-spec-phase-3-integration-feature13) — Phase 3 Finalization workflow вызывает spec-reality-check перед ConfirmStop |
| `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` | edit | [FR-15](FR.md#fr-15-bug-fix-plan-gate-phase-25--already-shipped-feature15) — **ALREADY SHIPPED commit b8a2bca** — Phase 2.5 denyAndExit конвертирует string→ValidationError objects |
| `.specs/dev-pomogator-canonical-plugin/FILE_CHANGES.md` | edit | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Cleanup stale paths after skill detection |
| `.specs/dev-pomogator-canonical-plugin/FR.md` | edit | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Fix narrative refs если skill flag-нёт WARNINGs |
| `.specs/dev-pomogator-canonical-plugin/REALITY_CHECK_REPORT.md` | create | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Markdown report skill findings для historical reference |
| `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` | edit | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Document cleanup pass entry |
