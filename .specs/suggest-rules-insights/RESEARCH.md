# Research

## Objective

Исследовать структуру отчёта `/insights` Claude Code, механизм чтения HTML, ограничения платформы и стратегию интеграции Phase -0.5 в suggest-rules command.

## Sources

- Claude Code CLI `/insights` command output (`~/.claude/usage-data/report.html`)
- Existing suggest-rules command: `extensions/suggest-rules/claude/commands/suggest-rules.md`
- Cursor adaptation report: `extensions/suggest-rules/adaptation-report.md`
- Phase -1 (claude-mem) integration as pattern reference

## Technical Findings

### 1. /insights Command and Report Generation

`/insights` is a built-in Claude Code CLI command that generates a self-contained HTML report at `~/.claude/usage-data/report.html`. The command analyzes cross-session usage data and produces an analytics dashboard.

Key facts:
- Cannot be invoked programmatically from a command prompt file
- Must read the existing report file via `Read` tool
- Report is regenerated when user manually runs `/insights` in Claude Code
- Report is self-contained HTML (~71KB) with inline CSS and JS

### 2. Report HTML Structure

The report uses CSS classes to organize sections. Relevant classes for extraction:

| CSS Class | Content | Rule Candidate Type |
|-----------|---------|---------------------|
| `.friction-category` | Cross-session friction patterns with `.friction-title`, `.friction-desc`, `.friction-examples li` | Antipattern / Gotcha |
| `.claude-md-item` | CLAUDE.md improvement suggestions with `data-text` attribute and `.cmd-why` explanation | Pattern / Checklist |
| `.big-win` | Successful patterns with `.big-win-title` and `.big-win-desc` | Pattern |
| `.pattern-card` | Usage patterns with `.pattern-title`, `.pattern-summary`, `.pattern-detail` | Checklist / Pattern |
| `.project-area` | Project domain areas with `.area-name` and `.area-count` | Domain enrichment for Phase 0.5 |
| `.horizon-card` | Future recommendations (lower priority) | N/A |

### 3. Report Path and Platform Handling

Report path: `~/.claude/usage-data/report.html`

Platform-dependent home directory expansion:
- **Windows:** `C:\Users\<username>\.claude\usage-data\report.html`
- **macOS:** `/Users/<username>/.claude/usage-data/report.html`
- **Linux:** `/home/<username>/.claude/usage-data/report.html`

The `Read` tool in suggest-rules command (listed in `allowed-tools: Read, Write, Glob, Grep`) handles `~` expansion natively.

### 4. Date Range and Freshness

Date range is extracted from the `.subtitle` element text, which follows the format:
```
"N messages across M sessions (K total) | YYYY-MM-DD to YYYY-MM-DD"
```

Freshness threshold: **3 days** from the end date. This balances between:
- Too short (1 day): would miss insights from weekend sessions
- Too long (7 days): insights would be stale and less relevant to current session context

### 5. Reading HTML in Command Context

The suggest-rules command is a Markdown prompt file (not executable code). Claude reads and interprets HTML natively as a multimodal LLM. No HTML parser library is needed -- the agent reads the full HTML content and extracts data by understanding the DOM structure and CSS class semantics.

This is confirmed by `allowed-tools: Read, Write, Glob, Grep` in the Claude version frontmatter.

### 6. Cannot Invoke /insights Programmatically

The `/insights` command is a Claude Code slash command, not a shell command. It cannot be triggered from within a suggest-rules execution. The Phase -0.5 design must:
- Read the **existing** report (if available)
- Gracefully degrade if report is missing or stale
- Suggest running `/insights` to the user when report is unavailable

## Where Implementation Lives

- Claude command: `extensions/suggest-rules/claude/commands/suggest-rules.md`
- Cursor command: `extensions/suggest-rules/cursor/commands/suggest-rules.md` (no Phase -0.5)
- Adaptation report: `extensions/suggest-rules/adaptation-report.md`
- Extension manifest: `extensions/suggest-rules/extension.json`

## Conclusions

1. Phase -0.5 is a natural extension of the existing Phase -1 memory context pattern
2. HTML reading via `Read` tool is sufficient -- no parser needed since Claude interprets HTML natively
3. 3-day freshness threshold provides good signal-to-noise ratio
4. Graceful degradation (file missing, stale, Cursor platform) ensures zero disruption
5. Pre-candidates from insights feed into existing Phase 1.5 abstraction pipeline

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| specs-management | `.claude/rules/specs-management.md` | Spec structure, TDD workflow, 13 files, audit pipeline | "create/update specs" | FR-1..FR-10, task ordering |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json is source of truth for updater; sync files/rules/tools/hooks | File changes in extension | FR-9, FR-10 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Phase -1 (claude-mem) | `extensions/suggest-rules/claude/commands/suggest-rules.md` (Phase -1 section) | MCP search integration pattern, mode display, session context extraction | Direct template for Phase -0.5 structure and integration points |
| Cursor adaptation report | `extensions/suggest-rules/adaptation-report.md` | Documents Claude-only sections that are excluded from Cursor version | Phase -0.5 is listed as Claude-only; Cursor version must not reference it |
| suggest-rules extension.json | `extensions/suggest-rules/extension.json` | Extension manifest with version, platforms, files | Must bump version to 1.4.0 when adding Phase -0.5 |

### Architectural Constraints Summary

1. **Command is a Markdown prompt file** -- all logic is expressed as instructions to the AI agent, not executable code. Phase -0.5 must follow the same pattern: declarative instructions with tool invocations (`Read`, `Glob`).
2. **Claude reads HTML natively** -- the agent can interpret HTML structure, CSS classes, and extract text content without an HTML parser library.
3. **Cursor version must not contain Phase -0.5** -- `/insights` is a Claude Code built-in command; the Cursor version of suggest-rules has no access to it. The adaptation report already documents this as a Claude-only section.
4. **Graceful degradation is mandatory** -- the command must work identically when insights are unavailable (file missing, stale, MCP down). No hard dependency on insights data.
