# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/test-statusline/extension.json` | create | [FR-8](FR.md#fr-8-extension-manifest-feature5) — манифест расширения |
| `extensions/test-statusline/tools/test-statusline/statusline_render.sh` | create | [FR-1](FR.md#fr-1-statusline-render-script-feature1) — рендеринг statusline |
| `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` | create | [FR-4](FR.md#fr-4-test-runner-wrapper-feature2) — обёртка тест-раннера |
| `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` | create | [FR-6](FR.md#fr-6-sessionstart-hook-feature4) — SessionStart hook |
| `extensions/test-statusline/tools/test-statusline/status_types.ts` | create | [FR-2](FR.md#fr-2-yaml-status-file-protocol-feature2) — TypeScript интерфейсы |
| `.claude/settings.json` | edit | [FR-6](FR.md#fr-6-sessionstart-hook-feature4) — регистрация SessionStart hook |
| `tests/features/plugins/test-statusline/PLUGIN011_test-statusline.feature` | create | BDD сценарии для всех FR |
| `tests/e2e/test-statusline.test.ts` | create | Step definitions для BDD |
| `tests/fixtures/test-statusline/mock-status-running.yaml` | create | Mock YAML для тестов рендеринга |
| `tests/fixtures/test-statusline/mock-status-passed.yaml` | create | Mock YAML для тестов рендеринга |
| `tests/fixtures/test-statusline/mock-status-failed.yaml` | create | Mock YAML для тестов рендеринга |
| `tests/fixtures/test-statusline/mock-status-corrupted.yaml` | create | Mock YAML для graceful degradation |
| `tests/fixtures/test-statusline/mock-stdin.json` | create | Mock Claude Code JSON input |
| `tests/e2e/fixtures/test-statusline/setup.ts` | create | BeforeEach hook — temp directory |
| `tests/e2e/fixtures/test-statusline/cleanup.ts` | create | AfterEach hook — cleanup |
| `scripts/docker-test.sh` | create | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — Docker wrapper с session isolation |
| `docker-compose.test.yml` | edit | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — `image:` directive для шаринга образа |
| `package.json` | edit | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — `test:e2e` → `bash scripts/docker-test.sh` |
| `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts` | edit | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — `generateProjectName()` + Docker isolation |
| `.claude/skills/run-tests/SKILL.md` | edit | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — документация Docker isolation |
| `extensions/tui-test-runner/skills/run-tests/SKILL.md` | edit | [FR-9](FR.md#fr-9-docker-test-isolation-feature6) — документация Docker isolation (source) |
| `extensions/hooks-integrity/extension.json` | create | [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7) — манифест расширения hooks-integrity |
| `extensions/hooks-integrity/tools/hooks-integrity/hooks_integrity_check.ts` | create | [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7) — SessionStart hook для валидации hooks |
| `tests/e2e/hooks-integrity.test.ts` | create | [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7) — BDD step definitions |
| `tests/features/plugins/hooks-integrity/PLUGIN012_hooks-integrity.feature` | create | [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7) — BDD сценарии |
