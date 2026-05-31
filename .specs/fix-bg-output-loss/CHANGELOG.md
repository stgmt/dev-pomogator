# Changelog

All notable changes to this feature will be documented in this file.

## [0.3.0] - 2026-05-11

### Refactor

- **Откат FR-7 (bg-log.sh duplicate)**: удалены `scripts/bg-log.sh` и `tests/e2e/bg-log-helper.test.ts`. Удалены FBOL002_01..03 scenarios из обоих `.feature` файлов. FR-7 / AC-7 помечены DEPRECATED. Причина: `test_runner_wrapper.cjs` уже реализует persistent log через `logStream.write()` (test_runner_wrapper.ts:366-374) — bg-log.sh был дублем.

### Added

- **FR-11: Generic passthrough adapter в test_runner_wrapper**: `extensions/tui-test-runner/tools/tui-test-runner/adapters/generic_adapter.ts` (5-line `GenericAdapter extends AdapterBase`). Добавлено `'generic'` в `TestFramework` union (`adapters/types.ts`), в `KNOWN_FRAMEWORKS` set + `getAdapter()` switch (`test_runner_wrapper.ts`), в DISPATCH/FILTER_FORMAT/getFrameworkInfo (`dispatch.ts`). Любая long bg команда теперь идёт через единый wrapper.
- **FR-12: Smart converter hook**: `test_guard.ts` BLOCKED_PATTERNS реструктурированы в `Array<{pattern, framework}>`. При deny — `buildConvertedCommand()` генерирует готовую к копированию строку `node wrapper.cjs --framework <fw> -- <orig>` и вставляет в `permissionDecisionReason`. AI копирует без построения вручную.
- **FR-13: /run-tests SKILL.md update**: frontmatter description убрано misleading "Auto-detects framework", добавлены 8 trigger keywords (dotnet test, pytest, cargo test, vitest, jest, run tests, in background, long bg). Добавлена секция Generic mode с examples (`--framework generic -- npm run build`). Расширена "When triggered" с proactive auto-invocation guidance.
- **FR-14: Skill trigger analysis report**: `.specs/fix-bg-output-loss/ANALYSIS_SKILL_TRIGGER.md` — почему `/run-tests` не auto-fired в incident 2026-05-10. Findings: skills в Claude Code не имеют built-in auto-trigger, description misleading, install path investigation.
- **FR-15: Three-benchmark report**: `.specs/fix-bg-output-loss/BENCHMARK.md` — (a) trigger rate via 20 synthetic prompts, (b) performance overhead wrapper vs raw, (c) reliability YAML status accuracy vs `--reporter=json`.
- **FR-16 (conditional)**: Если investigation подтвердит — fix installer hook install path bug в ~~`src/installer/claude.ts`~~ (removed in v2 migration). **Investigated 2026-05-11**: NOT APPLICABLE (legacy install pre-FR-2, не bug). Re-run installer мигрирует.
- **FR-17: Windows path mangling fix**: `tui_session_start.ts` writes `cwd` к CLAUDE_ENV_FILE. На Windows backslashes (`D:\repos\dev-pomogator`) интерпретируются bash при `source` → mangled `D:reposdev-pomogator`. Fix: `cwd.replace(/\\\\/g, '/')` normalization. Discovered through FR-15 reliability benchmark, fixed в том же commit.

### Changed

- `extensions/tui-test-runner/tools/tui-test-runner/adapters/types.ts`: `TestFramework` union теперь содержит `'generic'`
- `extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts`: KNOWN_FRAMEWORKS + getAdapter switch обновлены
- `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts`: DISPATCH/FILTER_FORMAT/getFrameworkInfo записи для generic
- `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts`: BLOCKED_PATTERNS реструктурированы + buildConvertedCommand()
- `.claude/skills/run-tests/SKILL.md`: description + body update (FR-13)

### Deprecated

- **FR-7** (bg-log.sh wrapper) — DEPRECATED, replaced by FR-11
- **AC-7** (bg-log.sh test) — DEPRECATED, replaced by AC-11
- **FBOL002_01..03 scenarios** в `.feature` файлах — REMOVED

## [0.2.0] - 2026-05-11

### Added
- `scripts/bg-log.sh`: generic wrapper для любых long bg команд (`dotnet test`, `pytest`, `cargo test`). Пишет stdout+stderr через `> file 2>&1` (без pipe, обходит #16305) в `.dev-pomogator/.bg-logs/<epoch>-<slug>.log`. Echo'ит путь к log первой строкой stdout. Сохраняет exit code оригинальной команды. Sanitizes slug filename. (FR-7)
- `.claude/rules/pomogator/no-blocking-on-tests.md`: новые subsection'ы `## Confirmed Anthropic bugs` (таблица 4 GitHub issue: #16305/#21915/#36915/#50616) + `## Preferred pattern: file redirect (Windows-safe)` с examples для dotnet/pytest/cargo + ссылкой на `scripts/bg-log.sh`. Existing Anti-pattern секция (v0.1.0) сохранена backward-compat. (FR-8)
- `tests/features/fix-bg-output-loss.feature`: 3 новых BDD сценария FBOL002_01..03 (bg-log.sh wraps echo, preserves exit code, sanitizes slug) tagged `@feature7`
- `tests/e2e/bg-log-helper.test.ts`: integration test через spawnSync, 3 it-блока 1:1 с FBOL002 сценариями
- `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_bg-tail-windows-claude-code-bugs.md`: feedback memory entry с rule + Why (4 confirmed Anthropic bugs + 25-min incident 2026-05-10) + How to apply (long bg → file redirect или bg-log.sh)

### Changed
- `.specs/fix-bg-output-loss/RESEARCH.md`: добавлена секция `## Confirmed root causes (post-incident 2026-05-10)` — H1 hypothesis → confirmed #21915 (Windows empty output), H2 → #16305 (pipeline lost), H3 → #36915 (ConPTY leak), новый #50616 (Windows hang since 2026-04-18). Все 4 issue closed as "not planned" / "duplicate" — официального fix не будет

### Fixed
- Silent output loss у `dotnet test`/`pytest`/`cargo test` background команд на Windows + Git Bash (incident 2026-05-10): `dotnet test --filter MBIL001` через `run_in_background: true` висел 25 минут, реальный процесс умер через `taskkill`, capture 0 байт. Generic `bg-log.sh` wrapper + rule update + feedback memory предотвращают повторение

## [0.1.0] - 2026-04-23

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
