---
name: spec-coverage-summary
description: >
  Quick STRUCTURAL census of every spec — per-spec FR / AC / Scenario / Task counts grouped by
  source directory. Use to see a spec's shape at a glance (how many requirements / criteria /
  scenarios / tasks) or to compare specs. Triggers (EN): "how many FR/AC/scenarios per spec",
  "spec size census", "counts per spec", "structural summary of the specs". Triggers (RU):
  "сколько FR/AC/сценариев в спеке", "размер спек", "сводка по спекам", "счётчики по спекам".
  Do NOT use for HONEST per-task DONE status from real test results — that is get_coverage
  (the FR-32 honesty gate), a different question.
allowed-tools: mcp__dev-pomogator-specs__get_coverage_summary, Bash, Read
---

# spec-coverage-summary — per-spec FR/AC/Scenario/Task counts

**Tool:** `mcp__dev-pomogator-specs__get_coverage_summary` ({})

## When
You want the SHAPE of each spec — "spec-generator-v4 has N FR, M AC, K scenarios, T tasks" —
to gauge size, spot a spec with FRs but zero scenarios, or compare specs at a glance.

## Why this, not grep
grep counts text occurrences (double-counting refs, missing inherited tags). This returns the
graph's NODE counts per source directory — the real structural census.

## How
```
mcp__dev-pomogator-specs__get_coverage_summary({})
→ { ok, perSpec: { "<slug>": { fr, ac, scenario, task }, ... } }
```

## Not for (the important distinction)
This is COUNTS (structure). It does NOT tell you whether tasks are actually DONE / tested.
For the HONEST "is this task backed by a green test" verdict → **get_coverage** (FR-32 honesty
gate) or the **spec-status** skill. Counting ≠ verifying.
