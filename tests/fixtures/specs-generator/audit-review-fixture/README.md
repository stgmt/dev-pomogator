# Audit Review Fixture

Test fixture for FILE_CHANGES_COMPLETENESS, FILE_CHANGES_VERIFY, COUNT_CONSISTENCY checks.

## Metrics

| Aspect | Count |
|--------|-------|
| FRs total | 10 |
| BDD scenarios | 5 |

Intentional errors:
- README claims "10 FR" but FR.md has only 3
- TASKS.md references `src/helpers/csv-parser.ts` and `src/validate.ts` not in FILE_CHANGES.md
- FILE_CHANGES.md has `src/nonexistent-file.ts` with action=edit (does not exist)
