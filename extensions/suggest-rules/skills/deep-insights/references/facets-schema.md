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
