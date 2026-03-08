# Facets JSON Schema Reference

## Source

Each file in `~/.claude/usage-data/facets/*.json` represents one analyzed Claude Code session.

## Schema

```json
{
  "session_id": "uuid-string",
  "brief_summary": "One-line summary of what was done in the session",

  "goal_categories": ["debugging", "feature_development", "refactoring"],
  "outcome": "achieved" | "partially_achieved" | "not_achieved",
  "primary_success": true | false,

  "session_type": "coding" | "debugging" | "research" | "planning" | "mixed",

  "user_satisfaction_counts": {
    "happy": 3,
    "satisfied": 5,
    "frustrated": 1
  },

  "claude_helpfulness": 0.85,

  "friction_counts": {
    "wrong_approach": 2,
    "missing_context": 1,
    "tool_limitation": 0,
    "communication_gap": 1,
    "environment_issue": 0
  },

  "friction_detail": [
    {
      "type": "wrong_approach",
      "description": "Tried to use X but Y was needed",
      "resolution": "Switched to Y approach"
    }
  ]
}
```

## Key Fields for Analytics

### Outcome Tracking

| Field | Values | Use |
|-------|--------|-----|
| `outcome` | achieved, partially_achieved, not_achieved | Success rate calculation |
| `primary_success` | boolean | Binary success metric |
| `claude_helpfulness` | 0.0-1.0 | AI effectiveness score |

### Friction Analysis

| Friction Type | Description |
|---------------|-------------|
| `wrong_approach` | Claude tried an incorrect approach first |
| `missing_context` | Not enough context to solve correctly |
| `tool_limitation` | Tool couldn't handle the task |
| `communication_gap` | Misunderstanding between user and Claude |
| `environment_issue` | Environment/setup problems |

### Satisfaction Metrics

| Rating | Meaning |
|--------|---------|
| `happy` | User explicitly positive |
| `satisfied` | Task completed adequately |
| `frustrated` | User expressed frustration or had to correct Claude |

## Observer Session Detection

The aggregation script filters out observer/memory sessions to avoid skewing work metrics.

### Detection markers (OR logic)

| Marker | Field | Example |
|--------|-------|---------|
| Text: `observer` | `brief_summary` or `underlying_goal` | "Memory observer agent watched..." |
| Text: `claude-mem` | `brief_summary` or `underlying_goal` | "User fed Claude-Mem observer..." |
| Text: `memory agent` | `brief_summary` or `underlying_goal` | "Memory agent observed a primary session..." |
| Goal: `memory_observation_creation` | `goal_categories` | `{ "memory_observation_creation": 1 }` |
| Goal: `observation_relay` | `goal_categories` | `{ "observation_relay": 1 }` |

### NOT a marker

`warmup_minimal` is NOT used as an observer marker — proven to cause false positives on real data (legitimate short sessions like checking Docker test results).

### Output fields

| Field | Description |
|-------|-------------|
| `total_facets_count` | All sessions (work + observer) |
| `facets_count` | Work sessions only |
| `observer_count` | Observer sessions filtered out |
| `observer_summary` | Separate outcomes for observer sessions |

## Session Meta Schema

Files in `~/.claude/usage-data/session-meta/*.json` contain detailed per-session metrics including token counts, tool usage, and timing data.

## Report HTML Structure

`~/.claude/usage-data/report.html` contains aggregated visualizations:

| Section | CSS Class | Content |
|---------|-----------|---------|
| Friction categories | `.friction-category` | Friction breakdown with examples |
| CLAUDE.md suggestions | `.claude-md-item` | Ready-to-use rule suggestions |
| Big wins | `.big-win` | Successful pattern examples |
| Usage patterns | `.pattern-card` | Workflow pattern analysis |
| Project areas | `.project-area` | Code area distribution |
