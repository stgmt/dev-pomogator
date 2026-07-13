# File Changes

| Path | Change | Requirements | Purpose |
|---|---|---|---|
| `extensions/test-statusline/extension.json` | Existing | FR-8 | Test-statusline extension manifest. |
| `extensions/test-statusline/tools/test-statusline/statusline_render.sh` | Existing | FR-1, FR-1a | Statusline renderer. |
| `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` | Existing | FR-2, FR-3, FR-4 | YAML status lifecycle wrapper. |
| `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` | Existing | FR-6, FR-7 | SessionStart setup and cleanup. |
| `extensions/test-statusline/tools/test-statusline/status_types.ts` | Existing | FR-2 | Status protocol types. |
| `tools/test-statusline/test_runner_wrapper.cjs` | Modify | FR-12, AC-12 | Canonical CJS entry point. Preserve valid `--framework` and post-`--` arguments; fail closed with stderr and non-zero status for invalid input and target, loader, bootstrap, dependency, or UNC execution failure. |
| `tests/features/plugins/test-statusline/PLUGIN011_test-statusline.feature` | Modify | FR-12, AC-12 | Full-document `PLUGIN011_36` through `PLUGIN011_42`, with exactly one scenario per acceptance path. |
| Existing BDD step-definition module for `PLUGIN011_test-statusline.feature` | Modify | FR-12 | One-to-one integration steps invoke the real CJS entry point and assert stderr plus exit code. |
| Canonical-plugin runtime fixture | Add or modify | FR-12 | Executable installed-root artifact for `CLAUDE_PLUGIN_ROOT` resolution. |
| Plugin-cache runtime fixture | Add or modify | FR-12 | Executable installed-cache artifact used only after installed-root resolution is unavailable. |
| Dependencies-absent runtime fixture | Add or modify | FR-12 | Proves missing runtime dependencies fail non-zero with stderr rather than silently succeeding. |
| WSL UNC-safe runtime fixture | Add or modify | FR-12 | Proves UNC execution is safe or explicitly rejected with stderr and a non-zero status. |
| `.specs/test-statusline/test-statusline.feature` | Modify | FR-12, AC-12 | Source scenario document mirrored to the production feature file. |
