---
name: spec-mcp-usability-dogfood
description: >
  Harvest REAL usability friction with the spec-graph MCP door (`mcp__dev-pomogator-specs__*`) out of
  Claude Code SESSION TRANSCRIPTS, so the painful spots surface as DATA (errors, retries, door-bypasses)
  instead of being re-typed from memory. Sibling of `spec-mcp-dogfood`: that one checks each tool WORKS
  (runtime), THIS one checks how USABLE each tool is (lived friction across past sessions). INVOKE after
  a session where the door felt clunky, before improving door DX (tool descriptions / error messages),
  or periodically to rank what to fix next. Triggers (EN): "dogfood spec mcp usability", "what door
  tools were painful", "mine session logs for mcp friction", "rank door DX fixes". Triggers (RU):
  "догфуд юзабилити спек-mcp", "что в двери было неудобно", "собери трение по двери из сессий",
  "где мучился с mcp дверью". Do NOT use to check if tools WORK (that is `spec-mcp-dogfood`), nor for the
  honest DONE verdict (`get_coverage` / `spec-status`).
allowed-tools: Bash, Read
---

# spec-mcp-usability-dogfood — friction dataset of the spec-MCP door

`tools/spec-mcp-usability-dogfood/harvest.ts` reads Claude Code session transcripts
(`~/.claude/projects/<encoded-cwd>/*.jsonl`), parses every `mcp__dev-pomogator-specs__*` tool call
+ its result, and reports where the door caused friction. Builtins-only (`fs`/`path`/`os`), fail-open.

**Governing rule — `verify-against-real-artifact`:** the producer is the Claude Code transcript writer.
The harvester PARSES each door result as JSON and checks `ok === false`; it NEVER substring-matches
"error" on raw text (that flags `ok:true` reads as failures — the canary bug this tool avoids). Its
error count is pinned to an independent ground-truth (a one-liner that counts `ok:false` the hard way).

## Run it

```bash
# all sessions for the current repo (auto-finds ~/.claude/projects/*<basename>* dirs)
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts            # markdown report
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts --json     # machine-readable

# one specific session
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts --session ~/.claude/projects/<dir>/<uuid>.jsonl
```

## What it surfaces (each derived from data, not pre-listed)

| Signal | Meaning | Maps to fix |
|--------|---------|-------------|
| `error` (anchor-not-found) | `apply_spec_change`/`propose_spec_change` "old_string not found" | document the whole-doc `content` param + add a CRLF hint to the error |
| `error` (form-contract) | `VALIDATION_FAILED` / non-empty `findings` | expose the doc's required form UP FRONT (describe-contract / in create/propose output) |
| `error` (other) | e.g. `LIVE_INBOUND_EDGES`, `SPEC_EXISTS` | add a targeted, actionable hint for that code |
| `retry-after-fail` | same tool+spec+doc re-issued right after a failure | the error wasn't actionable on first read — make it self-correcting |
| `raw-specs-access` | a raw Bash/Write/Read/Grep touched `.specs/` (door bypass) | a door tool was missing / undiscoverable / avoided after friction |

The **proposals are ranked by observed friction** (count) — the ranking is the value. Act on the top item.

## Workflow

1. Run the harvester (default = all sessions; `--session` for one).
2. Read the ranked proposals. The top one is where the door hurt most this/last session.
3. Turn a proposal into a door fix (tool description / error message / a new tool) — the door code lives
   in `tools/spec-mcp-server/` (`tools.ts`, `mutations.ts`), spec `.specs/spec-generator-v4/` FR-39/40.
4. Re-run on the next sessions to confirm the friction dropped (the tool keeps earning its keep on
   friction you can't predict).

## Honest scope

- `raw-specs-access` counts ALL raw `.specs/` touches, NOT strictly "within K steps after a door failure"
  (windowing that to post-failure escapes is a planned refinement) — some are habit, some follow a fail.
- Sidechain/subagent door calls are SKIPPED (not attributed to the main agent).
- Unparseable result text is bucketed separately (`unparseableResults`), never silently dropped.

## See also

- Sibling: `.claude/skills/spec-mcp-dogfood/SKILL.md` (does each tool WORK at runtime).
- Spec: `.specs/spec-mcp-usability-dogfood/` (this skill + the door-DX fixes it surfaces).
- Door internals: `.specs/spec-generator-v4/` FR-39 (access) / FR-40 (mutation validation).
