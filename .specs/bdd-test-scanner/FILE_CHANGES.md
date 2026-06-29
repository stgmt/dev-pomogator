# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей. Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/_shared/non-bdd-detector.ts` | create | Shared non-BDD detector extracted as single source of truth [FR-2](FR.md#fr-2-shared-non-bdd-test-detector) |
| `tools/bdd-test-scanner/scanner-hook.ts` | create | SessionStart entry that scans and emits the notice [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start) |
| `tools/bdd-test-scanner/engine/scan.ts` | create | Bounded project walk + classify via the shared detector [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start) |
| `tools/bdd-test-scanner/engine/ack.ts` | create | Local marker keyed to the tracking issue gates the notice [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/bdd-test-scanner.ts` | create | Doctor check for hook registration + dependencies [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies) |
| `tests/step_definitions/feature_bdd_test_scanner.ts` | create | BDD step-defs driving the real scanner [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start) |
| `tools/bdd-only-test-guard/guard.ts` | edit | Import the shared detector instead of inline patterns [FR-2](FR.md#fr-2-shared-non-bdd-test-detector) |
| `.claude-plugin/hooks.json` | edit | Register the SessionStart scanner for all plugin users [FR-5](FR.md#fr-5-plugin-wide-distribution) |
| `.claude/settings.json` | edit | Register the scanner for dogfooding [FR-5](FR.md#fr-5-plugin-wide-distribution) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | Register the new doctor check [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies) |
| `cucumber.json` | edit | Wire the new `.feature` into the BDD suite [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start) |
