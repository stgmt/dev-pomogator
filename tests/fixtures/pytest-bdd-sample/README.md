# Real pytest-bdd Cucumber JSON fixture (issue #230)

`cucumber-report.json` is captured output from the fixture's real `pytest-bdd` run; it is not hand-authored.

## Producer

- Python: `3.14.6`
- pytest: `9.1.1`
- pytest-bdd: `8.1.0`
- Capture date: `2026-08-18`
- Capture command (repository root):

```bash
cd tests/fixtures/pytest-bdd-sample
python -m pytest test_issue_230.py \
  --cucumber-json cucumber-report.json -q
```

The committed report is the captured file copied byte-for-byte to `cucumber-report.json`. Regenerate the report after changing the feature so its file mtime remains older than the evidence timestamp; otherwise SpecGraph correctly marks the result stale.

## Ground truth

- `features/issue_230.feature` declares exactly 22 Scenario locations. Regression tests copy it into a temporary `.specs/issue-230/` directory so all 22 nodes share one real SpecGraph spec scope.
- `test_issue_230.py` binds and executes exactly the odd-numbered scenarios.
- The producer report contains exactly 11 scenario elements, all `passed`, at feature lines `3,13,23,33,43,53,63,73,83,93,103`.
- The even-numbered scenarios are intentionally unbound and therefore absent from the producer report.
- The SpecGraph regression must reconcile this as exactly `11 PASSED / 11 not_run`, not `0 PASSED / 22 not_run`.
- Primary identity is normalized `uri + line`; the producer element `id` is retained as the secondary `scenario_id`.

## Regeneration check

Regenerate into a temporary path, parse both JSON files, and compare their structural keys plus feature URI, scenario names, lines, ids, and statuses. Step durations are real timing data and may differ between runs.
