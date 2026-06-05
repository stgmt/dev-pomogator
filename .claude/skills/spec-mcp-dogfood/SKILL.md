---
name: spec-mcp-dogfood
description: >
  Dogfood the spec-graph MCP — drive EVERY tool's real handler against the REAL `.specs/` graph
  and record what each actually returns, so you find live/dead/buggy tools by RUNTIME evidence,
  not grep. Catches the class of bug a green suite hides: a tool that's broken because the suite
  reaches its data by a side-channel (tags) the tool itself never uses (edges). INVOKE before a
  scope update / pruning decision, after changing the graph builder / parsers / tool handlers,
  or to confirm a "dead by no consumer" tool is dead-vs-just-unwired. Triggers (EN): "dogfood
  the spec mcp", "collect the mcp tool dataset", "which spec tools are dead/live at runtime",
  "runtime-check the mcp tools", "does each spec tool return data". Triggers (RU): "прогони
  dogfood спек-mcp", "собери датасет mcp тулзов", "какие тулзы живы/мертвы в рантайме",
  "проверь mcp тулзы на реальном графе". Do NOT use to write tests (tests-create-update) or for
  the FR-32 honest DONE verdict (get_coverage / spec-status).
allowed-tools: Bash, Read
---

# spec-mcp-dogfood — runtime dataset of every spec-MCP tool

`tools/spec-mcp-server/dogfood-dataset.ts` builds the real graph from `.specs/`, samples real
inputs from it (a node id, a tag, a phase, a scenario id, an anchor), then calls **every** tool's
actual handler and records `{ tool, input, dataPresent, size, note }`. The output is the evidence
a scope-update / prune decision should rest on — not a grep guess.

## Run it
```bash
node --import tsx tools/spec-mcp-server/dogfood-dataset.ts > dataset.json
```
Then read `dataset.json` (or pipe through `jq`/node to a table). Each row tells you whether that
tool returned real data on real input.

## Read the result
- `dataPresent: true, size: N` → the tool WORKS on real data (size = rows/count it returned).
- `dataPresent: false, size: 0` → the tool returned empty / `ok:false` on real input. **This is
  the signal** — a tool that returns nothing on a real graph is either (a) correctly empty for
  the sampled input, or (b) BROKEN. Check (b) by probing across the corpus (loop the tool over
  all FRs / all phases), not one sample.
- Cross-reference with `grep` for a CONSUMER: "no consumer + returns rich data" = a working
  engine that's just unwired → make it discoverable (a skill), don't delete it.

## Why this catches what the suite misses
A green test suite can reach a tool's data by a SIDE-CHANNEL the tool itself doesn't use. Real
case: `get_coverage` maps tasks→scenarios by **@featureN tags**, so the suite was green — yet
`get_trace` returned `scenarios:[]` for ALL 47 FRs because it relied on **graph edges** that are
never built (0 edges into any Scenario node). No test asserted `get_trace`'s output, so the bug
was invisible. The dogfood ran the tool and saw the empty output immediately. Same run also
caught `list_phase_tasks` (Task nodes had no `phase` field). See
`audit-reports/spec-mcp-dogfood-dataset.md`.

## When to run
- BEFORE a scope update or a "prune dead tools" decision (evidence, not grep).
- AFTER touching `tools/spec-graph/builder.ts`, the parsers, `tools/spec-mcp-server/tools.ts`, or
  any edge logic — to confirm tool OUTPUTS still resolve, not just that the suite is green.
- When a tool looks "dead": dogfood distinguishes dead-broken from dead-unwired.

## Extend it
To add a probe for a new tool, add its sampled input to the `inputs` map in
`dogfood-dataset.ts`; the harness picks real values from the graph automatically.
