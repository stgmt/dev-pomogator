---
name: observability-review
description: >
  See, in one view, WHERE the agent stumbled in this repo — gate bypasses (escape-hatch
  gaming), the last BDD run's reds/pendings, pending self-improve friction, and log errors.
  INVOKE when asked "where did it stumble / break", "show observability / diagnostics",
  "что сломалось / где споткнулся", "посмотри логи / диагностику", before declaring a long
  agent run done, or to audit whether gates are being gamed. Reads files only (dep-safe —
  no SpecGraph build), so it never crashes for plugin users with no node_modules.
allowed-tools: Bash, Read, Grep
---

# observability-review — one view of where the agent stumbled

dev-pomogator's runtime signals are scattered: escape-hatch JSONL logs in `.claude/logs/`,
the cucumber NDJSON in `.dev-pomogator/`, the self-improve ledger, `*.log` files. Reading
them one-by-one loses the picture. `tools/observability/observe.ts` aggregates them into a
single "where did the agent stumble?" report so friction + gate-gaming surface at a glance.

## When to invoke

- Before declaring a long autonomous run "done" — confirm no gate was silently bypassed and
  the last test run was actually green.
- Auditing escape-hatch discipline — `[skip-anchor-fix:]`, `[skip-test-quality:]`,
  `[skip-scope-verify:]`, `[skip-variant-matrix:]`. A burst of short / repeated reasons is the
  gaming signal these gates exist to deter.
- A user asks "where did it break / stumble", "show diagnostics/observability", "почему красно".

## How (one command)

```bash
node --import tsx tools/observability/observe.ts          # human table
node --import tsx tools/observability/observe.ts --json    # machine-readable
```

The report has four panes + a verdict:

| Pane | Source | What to look for |
|------|--------|------------------|
| **Escape hatches** | `.claude/logs/*-escapes.jsonl` | a gate bypassed; recent reasons. SHORT/repeated reasons (`ok`, `skip`, `fix`) = gaming → read the diff that was waved through |
| **Last BDD run** | `.dev-pomogator/.last-test-run.ndjson` | `failed`/`undefined`/`ambiguous` > 0 → not actually green; `pending` = TODO-red, expected for unbuilt work |
| **Self-improve ledger** | `…/SELF_IMPROVE.md` | `pending` entries = friction the agent recorded but a human hasn't merged |
| **Log errors** | `.dev-pomogator/**/*.log` | error/fail/stall lines in the latest run logs |

`Verdict` sums the stumble-signals — 🟢 clean or 🟡 N signals to review.

## How to act on findings

- **Escape with a short reason** → open the gate's audit log, find the diff, verify the bypass
  was legitimate (the gate's own escape-hatch-audit rule lists what's legit vs gaming).
- **failed/undefined > 0** → the run was NOT green; do not call work done. Re-run via `/run-tests`,
  fix the red, or honestly mark the task IN_PROGRESS (the FR-32 honesty gate would cap it anyway).
- **pending self-improve** → surface to the human (the orchestrator's session-start reminder does
  this); never auto-apply a `pending` entry.

## Why it's safe to ship

`observe.ts` imports ONLY `node:fs` + `node:path` — it reads + summarises files, it does NOT
build the SpecGraph (which would pull `@cucumber/gherkin`, a node_modules dep absent for plugin
users → crash). This is the dead-integration-guard discipline: a diagnostic that crashes for the
people who need diagnostics is worse than none. The `plugin-deps-safe` CI test enforces it.

## See also

- `tools/observability/observe.ts` — the aggregator.
- `.claude/rules/scope-gate/escape-hatch-audit.md` + siblings — per-gate gaming guidance.
- `tools/spec-graph/coverage.ts` / the `get_coverage` MCP tool — the deeper per-task honesty
  verdict (needs the graph; use the MCP, which is bundled, not a raw graph build in a hook).
