# Changelog

All notable changes to the tui-test-runner extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - Unreleased

### Added

- Skill `/run-tests` — centralized test runner with auto-detection and framework dispatch (FR-11)
- PreToolUse test guard hook — blocks direct test commands, shows /run-tests usage (FR-12)
- Rule `centralized-test-runner` — documents /run-tests requirement (FR-13)
- Dispatch table — framework→command mapping for 6 frameworks (FR-14)
- Rust (Cargo.toml) and Go (go.mod) framework detection

## [1.0.0] - Unreleased

### Added

- 4-tab TUI interface (Tests, Logs, Monitoring, Analysis) via Python Textual framework
- Test tree view with suite/test hierarchy, status icons, sort/filter (FR-2)
- Real-time log viewer with 20+ syntax highlighting patterns (FR-3)
- Monitoring dashboard with phases, progress, duration, counters (FR-4)
- Failure analysis with error pattern grouping and recommendations (FR-5)
- YAML v2 protocol extending v1 with suites[], tests[], phases[] (FR-6)
- Universal framework adapters: vitest, jest, pytest, dotnet (FR-7)
- YAML polling (500ms) with v1/v2 graceful degradation (FR-8)
- Python TUI launcher with Python/Textual detection (FR-9)
- SessionStart hook for status directory initialization (FR-10)
- Backward compatibility with test-statusline extension (v1 YAML)
- extension.json manifest with tools, hooks, postInstall, envRequirements
