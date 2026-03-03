# Design

## Implemented Requirements

- [FR-1: Чтение отчёта insights](FR.md#fr-1-чтение-отчёта-insights-feature1)
- [FR-2: Проверка свежести отчёта](FR.md#fr-2-проверка-свежести-отчёта-feature2)
- [FR-3: Извлечение friction categories](FR.md#fr-3-извлечение-friction-categories-feature3)
- [FR-4: Извлечение CLAUDE.md suggestions](FR.md#fr-4-извлечение-claudemd-suggestions-feature4)
- [FR-5: Извлечение big wins и usage patterns](FR.md#fr-5-извлечение-big-wins-и-usage-patterns-feature5)
- [FR-6: Извлечение project areas для обогащения доменов](FR.md#fr-6-извлечение-project-areas-для-обогащения-доменов-feature6)
- [FR-7: Создание pre-candidates с оценкой релевантности](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности-feature7)
- [FR-8: Unified mode display](FR.md#fr-8-unified-mode-display-feature8)
- [FR-9: Маркер источника в Phase 3](FR.md#fr-9-маркер-источника-в-phase-3-feature9)
- [FR-10: Дедупликация insights с session findings](FR.md#fr-10-дедупликация-insights-с-session-findings-feature9)

## Architecture

Phase -0.5 is placed between Phase -1 (Memory Context) and Phase 0 (Rules Structure) in the suggest-rules.md execution flow:

```
Phase -1: Memory Context (MCP search)
    │
    ├── Step 1.5: Session context keywords
    │       ↓ (keywords used for relevance scoring)
    │
    ▼
Phase -0.5: Insights Context ◄── NEW
    │
    ├── Step 1: Locate report (~/.claude/usage-data/report.html)
    ├── Step 2: Freshness check (3-day threshold)
    ├── Step 3: Targeted extraction (CSS-class sections)
    ├── Step 4: Pre-candidate output
    ├── Step 5: Deduplication notes
    └── Step 6: Unified mode display
    │
    ▼
Phase 0: Rules Structure (Glob)
    │
    ▼
Phase 0.5: Domain Detection (+ insights project areas)
    ...
```

## Components

### 1. Report Locator (Phase -0.5 Step 1)

Resolves `~` to the user home directory and attempts to `Read` the report file.

- Path: `~/.claude/usage-data/report.html`
- On Windows: `C:\Users\<username>\.claude\usage-data\report.html`
- On macOS/Linux: `~/.claude/usage-data/report.html`
- Sets `insights_mode = "unavailable"` if file not found
- Outputs user-facing hint to run `/insights` when unavailable

### 2. Freshness Checker (Phase -0.5 Step 2)

Parses the date range from `.subtitle` element text and compares the end date with the current date.

- Input: HTML text containing `.subtitle` with format `"N messages across M sessions (K total) | YYYY-MM-DD to YYYY-MM-DD"`
- Threshold: **3 days**
- Output modes:
  - `fresh`: end_date is within 3 days -- full trust
  - `stale`: end_date is older than 3 days -- data still used but all candidates marked with stale warning

### 3. Section Extractor (Phase -0.5 Step 3)

Reads targeted CSS-class-based sections from the HTML report. The agent interprets HTML natively (no parser library needed).

| HTML Section | CSS Class | Data Extracted | Priority |
|-------------|-----------|----------------|----------|
| Friction categories | `.friction-category` | `.friction-title` + `.friction-desc` + `.friction-examples li` | 1 (highest) |
| CLAUDE.md suggestions | `.claude-md-item` | `data-text` attribute + `.cmd-why` text | 2 |
| Usage patterns | `.pattern-card` | `.pattern-title` + `.pattern-summary` + `.pattern-detail` | 3 |
| Big wins | `.big-win` | `.big-win-title` + `.big-win-desc` | 4 |
| Project areas | `.project-area` | `.area-name` + `.area-count` | Domain enrichment |

Extraction is guided by session context keywords from Phase -1 Step 1.5 for relevance scoring.

### 4. Pre-candidate Generator (Phase -0.5 Step 4)

Transforms extracted data into pre-candidate format compatible with Phase 1.5 abstraction pipeline.

For each extracted insight:
- Assigns candidate type (antipattern / pattern / checklist / gotcha) based on source section
- Generates kebab-case name
- Assigns relevance score (HIGH / MEDIUM / LOW) based on keyword overlap with session context
- Formats output in the standard pre-candidate block format

### 5. Mode Display Aggregator (Phase -0.5 Step 6)

Combines memory status (from Phase -1), insights status (from Phase -0.5), and session status into a unified mode display.

| Memory | Insights | Mode String |
|--------|----------|-------------|
| Available | Fresh/Stale | `Full (memory + session + insights)` |
| Available | Unavailable | `Full (memory + session)` |
| Unavailable | Fresh/Stale | `Insights + Session` |
| Unavailable | Unavailable | `Session-only` |

## Data Flow

```
Phase -1 Step 1.5: Session context keywords
    │ (technologies, domains, problems, patterns)
    │
    ▼
Phase -0.5 Step 1: Read ~/.claude/usage-data/report.html
    │
    ├─ [not found] → insights_mode = "unavailable" → skip to unified display
    │
    ▼
Phase -0.5 Step 2: Parse .subtitle → extract end_date → compare with now
    │
    ├─ [fresh] → insights_mode = "fresh"
    ├─ [stale] → insights_mode = "stale" (data used, candidates marked ⚠️)
    │
    ▼
Phase -0.5 Step 3: Extract sections using CSS classes
    │ (guided by session keywords for relevance)
    │
    ▼
Phase -0.5 Step 4: Generate pre-candidates
    │ (type, name, relevance score)
    │
    ▼
Phase -0.5 Step 6: Unified mode display
    │
    ▼
Phase 0.5: Receives project areas (`.project-area`) for domain enrichment
    │
    ▼
Phase 1.5: Receives pre-candidates for abstraction
    │ (merged with session findings, deduplication applied)
    │
    ▼
Phase 2: Source marker 📊 in scoring tables
    │
    ▼
Phase 3: 📊 column in output tables (📊 insights, 📊 insights ⚠️ for stale)
```

## Integration Points

### Phase -1 (provides session context keywords)

Phase -1 Step 1.5 extracts session context (technologies, domains, problems, patterns). These keywords are used by Phase -0.5 Step 3 to score relevance of each extracted insight against the current session.

### Phase 0.5 (receives project areas for domain enrichment)

Project areas extracted from `.project-area` CSS class elements are passed to Phase 0.5 Domain Detection as an additional source of domain information alongside existing sources (rule file names, session context, project files).

### Phase 1.5 (receives pre-candidates for abstraction)

Pre-candidates from Phase -0.5 enter the abstraction pipeline alongside session findings:
- If an insight overlaps with a session finding: **MERGE** (session = primary source, insights = additional evidence: "also observed cross-session")
- If an insight has no session overlap: independent candidate with source `📊 insights`

### Phase 2 (source marker in scoring tables)

Insights-sourced candidates display `📊 insights` in the "Source" column of scoring tables. Stale insights show `📊 insights ⚠️`.

### Phase 3 (source column in output tables)

Final output tables include the source marker:
- `📊 insights` for fresh insights candidates
- `📊 insights ⚠️` for stale insights candidates
- `📍 turn #N + 📊` for merged session + insights candidates

## Platform Gate

Phase -0.5 is **Claude-only** via implicit check: the Cursor version of suggest-rules.md simply does not contain the Phase -0.5 section. This is documented in `extensions/suggest-rules/adaptation-report.md` under "Claude-only sections."

The Cursor version continues to use the simpler mode display from Phase -1 Step 3 directly, without insights integration.

## Files and Directories

| File | Action | Purpose |
|------|--------|---------|
| `extensions/suggest-rules/claude/commands/suggest-rules.md` | edit | Add Phase -0.5 section, update Execution Order, update Phase 3 sources |
| `extensions/suggest-rules/cursor/commands/suggest-rules.md` | verify | Confirm no Phase -0.5 references exist |
| `extensions/suggest-rules/adaptation-report.md` | edit | Add Claude-only note for Phase -0.5 |
| `extensions/suggest-rules/extension.json` | edit | Bump version to 1.4.0 |

## BDD Test Infrastructure

N/A -- this feature modifies a Markdown prompt file (command), not executable code. No setup/teardown, hooks, or shared fixtures are needed. BDD scenarios validate the structure and content of the command file itself.
