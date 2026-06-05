---
name: spec-list-phase-tasks
description: >
  List the Task nodes belonging to one phase of a spec's TASKS.md — from the graph, so you get
  the parsed tasks (id, status, refs) not a hand-scroll. Triggers (EN): "list tasks in Phase 2",
  "what tasks are in the MCP phase", "tasks for phase X", "show the phase's task list". Triggers
  (RU): "задачи фазы 2", "какие задачи в фазе MCP", "список задач фазы X". Do NOT use for a
  task's verified DONE status from real tests (that's get_coverage / the FR-32 honesty gate).
allowed-tools: mcp__dev-pomogator-specs__list_phase_tasks, Bash, Read
---

# spec-list-phase-tasks — tasks in a phase

**Tool:** `mcp__dev-pomogator-specs__list_phase_tasks` ({ phase })

## When
You want the tasks under a specific phase heading — to see what's planned in "Phase 2: MCP
server + hooks", iterate them, or check their declared statuses.

## Why this, not grep TASKS.md
The graph already parsed TASKS.md (`tools/spec-graph/parsers/tasks.ts`) into Task nodes with
`id`, `phase`, `status`, and `refs`. Querying by phase returns structured nodes; grep gives you
raw lines you'd have to re-parse and would miss the id↔ref links.

## How
```
mcp__dev-pomogator-specs__list_phase_tasks({ phase: "Phase 2: MCP server + hooks" })
→ Task nodes whose `phase` field equals that string
```
Pass the phase string exactly as it appears as the `## ` heading in TASKS.md.

## Not for
- The HONEST DONE status (does a green test back the task?) → **get_coverage** / spec-status.
- Tasks across ALL phases at once → build the graph + read, or get_coverage_summary for counts.
