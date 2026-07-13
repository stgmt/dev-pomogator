# Report Issue

`/report-issue` prepares a privacy-safe GitHub issue from a user-described problem. It sanitizes credential-shaped material before showing or sending the report, presents the exact draft and repository target, and never creates an issue without explicit consent.

## User-visible flow

1. Describe the problem through `/report-issue`.
2. The command prepares and displays a sanitized title, Markdown body, resolved repository, and filled GitHub new-issue URL.
3. When the local GitHub CLI is available and authenticated, it searches for duplicates before proposing creation.
4. If duplicates are found, a separate confirmation is required before a new issue can be created.
5. An issue is created only after explicit approval of the displayed sanitized payload.
6. If `gh` is missing, unauthenticated, or fails, the command preserves the draft, returns the filled URL, and for unauthenticated `gh` advises `gh auth login`.

## Repository resolution

A GitHub checkout supplies its `owner/repository` target. A non-GitHub checkout or unavailable metadata uses the canonical `stgmt/dev-pomogator` target consistently for duplicate search, creation, and the manual URL.

## Implementation and verification

- Runtime modules: `tools/report-issue/types.ts`, `sanitize.ts`, `runtime.ts`, `reporter.ts`, and `cli.ts`.
- Entry points: `.claude/skills/report-issue/SKILL.md` and `.claude/commands/report-issue.md`.
- Integration: `.claude/skills/pomogator-doctor/scripts/engine/checks/gh.ts` provides the local GitHub CLI availability/authentication signal.
- Executable coverage: `.specs/report-issue/report-issue.feature` and `tests/step_definitions/feature_report_issue.ts` cover six Docker-executed scenarios (`RPT001_01`–`RPT001_06`).

## Requirement traceability

| Requirement | Executable scenarios | Task |
|---|---|---|
| [FR-1](FR.md#fr-1-название) | `RPT001_01` | RPT-T1 |
| [FR-2](FR.md#fr-2-название) | `RPT001_02` | RPT-T2 |
| [FR-3](FR.md#fr-3-название) | `RPT001_03` | RPT-T3 |
| [FR-4](FR.md#fr-4-название) | `RPT001_04`, `RPT001_06` | RPT-T4 |
| [FR-5](FR.md#fr-5-название) | `RPT001_05` | RPT-T5 |

The focused Docker BDD result recorded on 2026-07-13 reports all six scenarios as PASSED. See [Tasks](TASKS.md) for the evidence-backed completion board.

## Related specification documents

- [User stories](USER_STORIES.md)
- [Use cases](USE_CASES.md)
- [Requirements](REQUIREMENTS.md)
- [Design](DESIGN.md)
- [Tasks](TASKS.md)
- [Acceptance criteria](ACCEPTANCE_CRITERIA.md)
- [BDD scenarios](report-issue.feature)
