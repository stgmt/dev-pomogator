# Changelog

All notable changes to this feature will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.0] - 2026-02-22

### Added
- Phase -0.5: Insights Context -- reads `/insights` report (`~/.claude/usage-data/report.html`) for cross-session friction patterns and CLAUDE.md suggestions
- Unified mode display combining memory + insights + session status
- Source marker for insights-sourced candidates in Phase 3 output
- Freshness check (3-day threshold) for insights report
- Graceful degradation when report is missing or stale

### Changed
- Execution Order updated (15 -> 18 steps) to include insights phase
- Mode display now shows three data sources (memory, insights, session)
