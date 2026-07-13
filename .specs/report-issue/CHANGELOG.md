# Changelog

## 2026-07-13 — Finalized

### Added

- `/report-issue` command and skill for preparing privacy-safe GitHub issue drafts.
- Report preparation modules in `tools/report-issue/` for sanitization, runtime interaction, repository resolution, URL rendering, and local GitHub CLI orchestration.
- Docker-executed BDD coverage in `.specs/report-issue/report-issue.feature` and `tests/step_definitions/feature_report_issue.ts`.

### Delivered

- Credential-shaped material is removed before the report payload or GitHub-bound URL is displayed or used.
- GitHub issue creation requires explicit consent; a duplicate result requires a distinct second confirmation.
- Missing, unauthenticated, or failing `gh` preserves the sanitized draft and provides a filled manual new-issue URL; the unauthenticated path also provides `gh auth login` guidance.
- GitHub repository metadata is used when available; non-GitHub or unavailable metadata falls back consistently to `stgmt/dev-pomogator`.

### Verification

- Focused Docker BDD execution recorded on 2026-07-13 passed all six report-issue scenarios: `RPT001_01` through `RPT001_06`.
- The five requirement-backed tasks `RPT-T1` through `RPT-T5` are DONE because every mapped executable scenario is PASSED. The supplemental scenario `RPT001_06` strengthens the FR-4 unauthenticated fallback coverage.

### Scope

- This feature uses the user’s locally installed GitHub CLI and does not add a direct GitHub API client or token configuration.
- The existing pomogator-doctor GitHub CLI check (`C-GH`) remains the availability and authentication integration point.
