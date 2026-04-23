# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/helpers.ts` | edit | [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3) — добавить `runInstallerViaNpx()` helper и `NpxInstallResult` interface |
| `tests/e2e/claude-installer.test.ts` | edit | [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1), [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2) — добавить 2 `describe.skipIf` блока для CORE003_18/19 |
| `tests/features/core/CORE003_claude-installer.feature` | edit | [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1), [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2) — добавить CORE003_18 и CORE003_19 BDD scenarios |
| `.claude/skills/install-diagnostics/SKILL.md` | create | Diagnostic skill для пользователей с silent install failure (создан в этой session) |
| `.specs/install-diagnostics/README.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — Overview спека |
| `.specs/install-diagnostics/USER_STORIES.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — User stories |
| `.specs/install-diagnostics/USE_CASES.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — UC-1..UC-3 + edge cases |
| `.specs/install-diagnostics/RESEARCH.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — Bug evidence + project context |
| `.specs/install-diagnostics/REQUIREMENTS.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — Index links на FR/AC/NFR |
| `.specs/install-diagnostics/FR.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — FR-1..FR-5 с @feature тегами |
| `.specs/install-diagnostics/NFR.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — Performance/Security/Reliability/Usability |
| `.specs/install-diagnostics/ACCEPTANCE_CRITERIA.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — AC-1..AC-6 в EARS |
| `.specs/install-diagnostics/DESIGN.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — архитектура + BDD Test Infrastructure |
| `.specs/install-diagnostics/TASKS.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — TDD-порядок задач |
| `.specs/install-diagnostics/FILE_CHANGES.md` | create | Этот файл |
| `.specs/install-diagnostics/CHANGELOG.md` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) — initial entry |
| `.specs/install-diagnostics/install-diagnostics.feature` | create | [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4), [FR-5](FR.md#fr-5-cross-references-via-featuren-tags-feature5) — own scenarios для skill behaviour |

## Second Failure Mode — Prompt-race (2026-04-20, @feature6)

> Добавляется при реализации FR-6..FR-10. См. TASKS.md Phase 4.

### NEW files

| Path | Action | Reason |
|------|--------|--------|
| `tools/lint-install-commands.ts` | create | [FR-8](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6): CI lint regex check для `.md`/`.rst`/`.txt` files |
| `tests/e2e/docs-install-lint.test.ts` | create | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-feature6): vitest wrapper вызывает lint-install-commands.ts и asserts clean |
| `bin/dev-pomogator-safe.cjs` | create (DEFERRED) | [FR-10](FR.md#fr-10-defensive-bin-wrapper-optionaldeferred-feature6): optional defensive proxy |
| `.lintignore-install` | create | Exception list для lint (исторические примеры в CHANGELOG, etc.) |
| `tests/features/plugins/install-diagnostics/diagnostics-mode-b.test.ts` | create | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-6-feature6): scenarios INSTALL_DIAG_05, 06 для Mode B detection |

### EDIT existing

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/install-diagnostics/SKILL.md` | edit | [FR-6](FR.md#fr-6-promptrace-failure-mode-detection-feature6): Mode A/B/A+B classification + auto-reproduce с --yes + npm/cli#7147 citation |
| `tests/e2e/helpers.ts` | edit | Helper extension: `runInstallerViaNpx` accepts `forceYes?: boolean` (default true), `emptyStdin?: boolean` для FR-9 reproduction |
| `tests/features/core/CORE003_claude-installer.feature` | edit | [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6): add CORE003_20 scenario |
| `tests/e2e/claude-installer.test.ts` | edit | [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6): add integration test for CORE003_20 |
| `README.md` | edit | [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6): replace `npx github:stgmt/dev-pomogator` → `npx --yes github:stgmt/dev-pomogator` во всех install examples |
| `CLAUDE.md` | edit | [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6): same |
| `extensions/*/README.md` | edit | [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6): every extension README mentioning npx install |
| `package.json` | edit | [FR-8](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6): add `"lint:docs": "npx tsx tools/lint-install-commands.ts"` script |
| `.github/workflows/ci.yml` (если есть) | edit | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-7-feature6): invoke `npm run lint:docs` в CI job |
| `.specs/install-diagnostics/RESEARCH.md` | edit | Add section "Second Failure Mode — npm Confirmation Prompt Race (2026-04-20)" с evidence |
| `.specs/install-diagnostics/CHANGELOG.md` | edit | Add entry `[Unreleased] - Second failure mode hardening (2026-04-20)` |
| `.specs/install-diagnostics/README.md` | edit | Update counts + reference to Phase 4 |

### Summary (updated)

- **Create (initial + Phase 4)**: 17 + 5 = 22
- **Edit (initial + Phase 4)**: 3 + 11 = 14 (плюс N `extensions/*/README.md` matched by grep)
- Total delta для Phase 4: 16 new/edit file ops
