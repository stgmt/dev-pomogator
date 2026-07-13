# Test Statusline

The test-statusline feature displays test progress from session-isolated YAML status files and degrades safely when status data is absent or malformed.

## Runtime components

- `extensions/test-statusline/tools/test-statusline/statusline_render.sh` renders statusline output.
- `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` maintains YAML runner state.
- `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` initializes session state.
- `tools/test-statusline/test_runner_wrapper.cjs` is the canonical fail-closed CJS `/run-tests` entry point for FR-12.

## Fail-closed CJS runner contract

The CJS shim preserves supported `--framework <name>` and `--framework=<name>` arguments and forwards every argument after `--` unchanged. It returns success only after its delegated canonical executable succeeds.

Invalid, missing, or empty framework input; canonical target resolution failure; loader or bootstrap failure; missing runtime dependencies; and unsafe or unexecutable WSL UNC paths must write an actionable diagnostic to stderr and exit non-zero. Resolution prefers `CLAUDE_PLUGIN_ROOT`, then the installed plugin cache. Repository TypeScript sources are not a fallback.

The full-document BDD coverage for this contract is `PLUGIN011_36` through `PLUGIN011_42` in [test-statusline.feature](test-statusline.feature). The scenarios prove forwarding, validation, target and loader failures, installed-root/cache resolution, dependencies-absent behavior, and UNC-safe execution. Every intended failure asserts stderr and a non-zero exit.

## Spec documents

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
- [FR.md](FR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
