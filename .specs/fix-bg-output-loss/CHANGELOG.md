# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- `scripts/docker-test.sh`: persistent log в `.dev-pomogator/.docker-status/test-run-<epoch>.log` через `tee` (параллельно со stdout); `mkdir -p` для idempotent создания директории; echo строка `[docker-test] Log: <path>` для early visibility пути
- `.claude/rules/pomogator/no-blocking-on-tests.md`: новая секция `## Anti-pattern: naked \`| tail\` в bg` с reasoning (H1/H2/H3 hypotheses) и safe replacement через `tee`; новый checklist bullet про `| tee <path> | tail -N`
- `tests/features/fix-bg-output-loss.feature`: 6 BDD сценариев FBOL001_01..06 покрывающих tee persistence, exit code preservation, mkdir idempotency, rule content, gitignore coverage
- `tests/e2e/docker-test-tee.test.ts`: integration test с 6 it-блоками 1:1 с BDD сценариями
- `tests/fixtures/docker-test-tee/stub-compose.yml` + README: stub docker-compose для integration test без real Docker daemon dependency

### Changed
- `scripts/docker-test.sh`: invocation строк 69-72 расширена `2>&1 | tee -a "$LOG_FILE"` — exit code propagation сохранён через существующий `set -o pipefail`

### Fixed
- Silent output loss у long-running bg Bash tasks (incident `bd9aii2if`, 2026-04-23): 22-мин prevost с `| tail -40` завершался `exit 0` + 0 bytes capture. Defense-in-depth решение через persistent log на диске закрывает все три plausible hypotheses (H1 harness capture handle drop / H2 Git-Bash pipe EOF race / H3 docker compose -T buffering) одним патчем

## [0.1.0] - TBD

### Added
- Initial implementation
