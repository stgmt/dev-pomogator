---
name: deep-insights
description: "Deep analysis of Claude Code usage from /insights data (facets JSON + report.html). Aggregates cross-session friction trends, satisfaction metrics, tool errors, and generates quantitative evidence for rule candidates."
allowed-tools: Read, Glob, Grep, Bash
---

# Deep Insights — Cross-Session Analytics

## Mission

Perform deep quantitative analysis of Claude Code `/insights` data to produce structured analytics output. This skill reads **existing** data from `~/.claude/usage-data/` — it does NOT generate new insights.

## Data Sources

| Source | Path | Content |
|--------|------|---------|
| Facets JSON | `~/.claude/usage-data/facets/*.json` | Per-session structured metrics |
| Report HTML | `~/.claude/usage-data/report.html` | Aggregated visual report |
| Session Meta | `~/.claude/usage-data/session-meta/*.json` | Detailed session metadata |

## Execution Steps

### Step 1: Data Discovery

```bash
# Check data availability
ls ~/.claude/usage-data/facets/ 2>/dev/null | wc -l
ls ~/.claude/usage-data/report.html 2>/dev/null
```

**If no data found:**
```
📊 Deep Insights: NO DATA
   Facets: 0 files | Report: missing
   💡 Run /insights first to generate usage analytics
```
→ Stop execution, return status `missing`.

### Step 2: Aggregate Facets

Run the aggregation script:
```bash
bash !`.claude/skills/deep-insights/scripts/aggregate-facets.sh`
```

This produces a JSON summary of all facets data.

### Step 3: Freshness Check

From facets JSON timestamps, determine date range:
- Extract earliest and latest `session_id` timestamps
- Calculate staleness: `days_since_latest`

| Condition | Status | Action |
|-----------|--------|--------|
| days_since_latest ≤ 3 | `fresh` | Full analysis |
| days_since_latest 4-7 | `stale` | Analyze with warning |
| days_since_latest > 7 | `very_stale` | Analyze with strong warning |

### Step 4: Cross-Session Analysis

Perform the following analyses on aggregated facets data:

#### 4.1 Friction Trends

For each `friction_counts` key across all sessions:
- Count total occurrences
- Determine trend (rising/stable/declining) by comparing first-half vs second-half
- Correlate with `outcome` field: which friction types lead to `partially_achieved` or `not_achieved`

#### 4.2 Satisfaction Distribution

Aggregate `user_satisfaction_counts` across all sessions:
- Calculate percentages: happy, satisfied, frustrated
- Determine trend over time

#### 4.3 Tool Errors & Gotcha Candidates

From `friction_detail` entries:
- Group by error type/pattern
- Count occurrences
- Generate gotcha pre-candidates for recurring errors (3+)

#### 4.4 Workflow Insights

From `session_type`, `goal_categories`:
- Identify dominant workflow patterns
- Find sessions with low `primary_success` — analyze what went wrong
- Cross-reference with `claude_helpfulness`

#### 4.5 Quantitative Metrics

Calculate:
- `total_sessions`: number of facets files
- `success_rate`: percentage of `achieved` outcomes
- `avg_friction`: average friction count per session
- `top_friction_types`: top 3 friction categories

### Step 5: Report HTML Cross-Reference

Read `~/.claude/usage-data/report.html` for additional data:
- Big wins section
- CLAUDE.md suggestions
- Usage patterns
- Project areas breakdown

### Step 6: Structured Output

**Output format — consumed by suggest-rules Phase -0.5:**

```
📊 Deep Insights Analysis
========================

## Freshness
Status: fresh|stale|very_stale|missing
Date Range: YYYY-MM-DD to YYYY-MM-DD
Sessions Analyzed: N

## Friction Trends
| Type | Count | Trend | Correlated Outcome |
|------|-------|-------|--------------------|
| wrong_approach | 12 | rising | partially_achieved |
| missing_context | 8 | stable | achieved |
| tool_limitation | 5 | declining | achieved |

## Satisfaction
| Rating | Count | Percentage | Trend |
|--------|-------|------------|-------|
| happy | 15 | 45% | stable |
| satisfied | 12 | 36% | rising |
| frustrated | 6 | 18% | declining |

## Tool Errors (gotcha candidates)
| Error Pattern | Count | Suggested Gotcha |
|---------------|-------|------------------|
| <pattern> | N | <kebab-name> |

## Workflow Insights
| Insight | Finding | Rule Candidate |
|---------|---------|----------------|
| <title> | <description> | <kebab-name or N/A> |

## Quantitative Evidence
- Total Sessions: N
- Success Rate: N%
- Avg Friction per Session: N.N
- Top Friction Types: [type1, type2, type3]

## CLAUDE.md Suggestions (from report.html)
| Suggestion | Source | Priority |
|------------|--------|----------|
| <text> | report.html | HIGH|MEDIUM|LOW |
```

## Error Handling

- **No facets directory**: Return `missing` status
- **Empty facets directory**: Return `missing` status
- **No report.html**: Run facets-only analysis, note report unavailable
- **Malformed JSON**: Skip individual files, log count of skipped
- **Script execution failure**: Fall back to direct file reading via Read tool

## Integration with suggest-rules

This skill's output is consumed by `/suggest-rules` Phase -0.5:
- `friction_trends` with `trend=rising` → +10 to PREVENTS score
- `tool_errors` → ready-made gotcha pre-candidates
- `quantitative_evidence` → QUANTITATIVE_EVIDENCE bonus (+10)
- `workflow_insights` → pattern/checklist pre-candidates
- `claude_md_suggestions` → HIGH priority pattern candidates
