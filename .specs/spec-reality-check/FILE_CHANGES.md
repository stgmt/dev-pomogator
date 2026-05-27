# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/extension.json` | edit | [FR-9](FR.md#fr-9-extension-manifest-wiring-feature9) — Register skill + bump version (continues across iterations) |
| `.claude/skills/spec-review/SKILL.md` | edit | [FR-12](FR.md#fr-12-spec-review-category-15-integration-feature12) — Category 15 "Reality Drift" |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | [FR-13](FR.md#fr-13-create-spec-phase-3-integration-feature13) — Phase 3 reality-check step |
| `.specs/dev-pomogator-canonical-plugin/FILE_CHANGES.md` | edit | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Cleanup stale paths after skill applied |
| `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` | edit | [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11) — Document cleanup pass |

<!-- [SHIPPED 2026-05-24 commit 8dee223 — initial implementation] all create rows below were closed:
  - .claude/skills/spec-reality-check/{SKILL.md, scripts/verify.ts, scripts/verify-hook.ts, references/checks.md}
  - tests/fixtures/spec-reality-check/{stale-create,missing-edit,narrative-drift,code-drift,task-orphan}/
  - tests/e2e/spec-reality-check{,-hook}.test.ts
  - .claude/skills/spec-review/references/category-15-reality-drift.md
  - .specs/dev-pomogator-canonical-plugin/REALITY_CHECK_REPORT.md (one-time artifact)
  - extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts edit (FR-15, commit b8a2bca)

[SHIPPED 2026-05-24 commit dfb5e89/7946146/7379829/61d8c75/8292b57/5080bda — iteration-2 + 13 bugs] additional artifacts:
  - .claude/skills/spec-reality-check/evals/{evals.json, run-evals.ts, bench-synthetic.ts, bulk-run.ts, README.md, iterations/iteration-{1,2}/*}
  - .claude/rules/spec-reality-check/maintain-evals-on-edit.md
  - tests/fixtures/spec-reality-check/v2/{fc-create-only, fc-edit-only, fc-delete-only, narrative-only, narrative-fenced-skip, code-drift-only, tasks-fc-only, clean-baseline, fc-malformed, fc-edit-on-existing-no-create, fc-empty, fc-placeholder-paths, fc-glob-paths, fc-cyrillic-header, fc-narrative-glob, fc-non-standard-actions, fc-runtime-paths-skip, narrative-planned-create-skip, tasks-inline-paths}/

These rows were removed from active FC table per spec-reality-check own discovery
of shipped-stale-FC drift class. Self-applied 2026-05-24. -->

