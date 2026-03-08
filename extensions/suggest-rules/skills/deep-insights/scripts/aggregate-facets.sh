#!/usr/bin/env bash
# aggregate-facets.sh — Aggregate all Claude Code facets JSON files into a summary
# Used by deep-insights skill for cross-session analytics
#
# Output: JSON summary to stdout
# Requirements: jq

set -euo pipefail

FACETS_DIR="${HOME}/.claude/usage-data/facets"

# Check if facets directory exists
if [ ! -d "$FACETS_DIR" ]; then
  echo '{"status":"missing","error":"facets directory not found","facets_count":0}'
  exit 0
fi

# Count facets files
FACETS_COUNT=$(find "$FACETS_DIR" -name '*.json' -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$FACETS_COUNT" -eq 0 ]; then
  echo '{"status":"missing","error":"no facets files found","facets_count":0}'
  exit 0
fi

# Check if jq is available
if ! command -v jq &>/dev/null; then
  # Fallback: output file list and count without jq
  echo "{\"status\":\"no_jq\",\"facets_count\":${FACETS_COUNT},\"facets_dir\":\"${FACETS_DIR}\"}"
  exit 0
fi

# Aggregate all facets into a single JSON array, then process
jq -s '
{
  status: "ok",
  facets_count: length,
  date_range: {
    earliest: (map(.session_id // empty) | sort | first // "unknown"),
    latest: (map(.session_id // empty) | sort | last // "unknown")
  },
  outcomes: (group_by(.outcome) | map({
    outcome: .[0].outcome,
    count: length
  }) | sort_by(-.count)),
  satisfaction: {
    happy: (map(.user_satisfaction_counts.happy // 0) | add // 0),
    satisfied: (map(.user_satisfaction_counts.satisfied // 0) | add // 0),
    frustrated: (map(.user_satisfaction_counts.frustrated // 0) | add // 0)
  },
  friction_summary: (
    [.[] | .friction_counts // {} | to_entries[]] |
    group_by(.key) |
    map({
      type: .[0].key,
      total: (map(.value) | add),
      sessions: length
    }) |
    sort_by(-.total)
  ),
  friction_details: (
    [.[] | .friction_detail // [] | if type == "array" then .[] else empty end] |
    group_by(.type // .category // "unknown") |
    map({
      type: .[0].type // .[0].category // "unknown",
      count: length,
      examples: (.[0:3] | map(.description // .detail // .message // ""))
    }) |
    sort_by(-.count) |
    .[0:10]
  ),
  session_types: (group_by(.session_type) | map({
    type: .[0].session_type,
    count: length
  }) | sort_by(-.count)),
  goal_categories: (
    [.[] | .goal_categories // {} | if type == "object" then to_entries[] | .key elif type == "array" then .[] else empty end] |
    group_by(.) |
    map({category: .[0], count: length}) |
    sort_by(-.count) |
    .[0:10]
  ),
  helpfulness: (
    [.[] | .claude_helpfulness // "unknown"] |
    group_by(.) |
    map({level: .[0], count: length}) |
    sort_by(-.count)
  ),
  success_rate: (
    (map(select(.outcome == "fully_achieved" or .outcome == "mostly_achieved")) | length) as $success |
    if length > 0 then ($success / length * 100 | round) else 0 end
  )
}
' "$FACETS_DIR"/*.json 2>/dev/null || {
  echo '{"status":"error","error":"jq aggregation failed","facets_count":'"${FACETS_COUNT}"'}'
}
