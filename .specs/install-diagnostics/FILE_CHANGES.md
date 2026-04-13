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
