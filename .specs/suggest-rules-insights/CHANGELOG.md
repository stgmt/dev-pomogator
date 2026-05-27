# Changelog

All notable changes to this feature will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.1] — 2026-05-23 (paperwork closeout)

> Spec was effectively shipped as v1.4.0 on 2026-02-22 (Phase -0.5 in `.claude/commands/suggest-rules.md` lines 180-313), but TASKS.md was never checked off. This closeout marks all 10 FRs covered and audit-clean.
>
> Real implementation deviation (documented inline in FILE_CHANGES.md): the original spec FR-1 said "Read tool" directly; the shipped path uses `Skill("deep-insights")` as primary with direct `Read(~/.claude/usage-data/report.html)` as Legacy Mode fallback. Functionally equivalent; better encapsulation (skill aggregates ~50 facets JSON + cross-correlates + reads HTML — single point of change vs scattered parsing).
>
> Audit-spec: 0 ERRORS / 14 WARNINGS (propagation hints + DESIGN classification format + term variants — all cosmetic).

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
