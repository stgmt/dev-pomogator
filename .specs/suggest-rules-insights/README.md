# Suggest Rules Insights

Phase -0.5 enhancement for the `suggest-rules` command that reads Claude Code's `/insights` report (`~/.claude/usage-data/report.html`) to extract cross-session friction patterns, CLAUDE.md suggestions, wins, and usage patterns as additional rule candidates.

## Status

**In Progress**

## Key Decisions

- **3-day freshness threshold**: Reports older than 3 days are still used but marked as stale with a warning annotation on all derived candidates.
- **Graceful degradation**: If the insights report is missing or unreadable, the phase is silently skipped and execution continues from Phase 0.
- **Claude-only**: Phase -0.5 is exclusive to Claude Code. The Cursor version of suggest-rules is not modified; the phase is silently skipped on that platform.

## Spec Files

| File | Description |
|------|-------------|
| [USER_STORIES.md](USER_STORIES.md) | User Stories |
| [USE_CASES.md](USE_CASES.md) | Use Cases |
| [RESEARCH.md](RESEARCH.md) | Technical research and project context |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requirements index and traceability matrix |
| [FR.md](FR.md) | Functional Requirements |
| [NFR.md](NFR.md) | Non-Functional Requirements |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | Acceptance Criteria (EARS format) |
| [DESIGN.md](DESIGN.md) | Architecture and component design |
| [TASKS.md](TASKS.md) | Implementation tasks (TDD order) |
| [FILE_CHANGES.md](FILE_CHANGES.md) | Files to be created/modified |
| [CHANGELOG.md](CHANGELOG.md) | Change log |
| [suggest-rules-insights.feature](suggest-rules-insights.feature) | BDD scenarios (Gherkin) |

## Implementation Scope

The suggest-rules command gains a new Phase -0.5 (Insights Context) that executes before Phase 0. It:

1. Locates `~/.claude/usage-data/report.html`
2. Checks freshness (report end_date vs current date, 3-day threshold)
3. Parses the HTML report to extract:
   - Friction categories (mapped to antipattern rule candidates)
   - CLAUDE.md suggestions (mapped to pattern rule candidates)
   - Wins and usage patterns (supplementary context)
4. Merges insights candidates with session findings in Phase 3, using session data as primary and insights as supplementary evidence
5. Displays a unified mode indicator showing all three data sources (memory, insights, session)

## Related

- Extension: `extensions/suggest-rules/`
- Claude command: `extensions/suggest-rules/claude/commands/suggest-rules.md`
- Cursor command: `extensions/suggest-rules/cursor/commands/suggest-rules.md` (no changes)
