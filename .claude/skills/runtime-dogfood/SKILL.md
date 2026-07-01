---
name: runtime-dogfood
description: >
  Find dead / broken / silently-empty entrypoints in ANY tool surface by DRIVING each one
  against REAL data and recording what it actually returns — not grep, not a green suite. Works
  for any surface with many entrypoints: CLI subcommands, HTTP/API endpoints, MCP/agent tools,
  plugin commands, library exports, RPC methods, queue handlers. Catches the worst class of bug:
  a feature the test suite reaches through a SIDE-CHANNEL while the real path is broken and
  unasserted (so the suite is GREEN). INVOKE before pruning / a scope decision, after refactoring
  a handler layer or a builder the entrypoints read from, or to tell "dead-because-unused" from
  "dead-because-broken". Triggers (EN): "dogfood the tools/api/cli", "runtime census of the
  endpoints", "which commands/endpoints are dead or broken", "drive every handler on real data",
  "what does each endpoint actually return". Triggers (RU): "прогони все команды/эндпоинты на
  реальных данных", "рантайм-перепись инструментов", "какие команды мёртвые/сломанные",
  "что каждый эндпоинт реально отдаёт", "dogfood поверхности". Do NOT use to triage a RED suite
  (that's suite-failure-triage) or to write the tests themselves (tests-create-update). For the
  dev-pomogator spec-MCP specifically, use the ready-made `spec-mcp-dogfood`.
allowed-tools: Bash, Read, Grep, Glob, Write
---

# runtime-dogfood — drive every entrypoint against real data, record what it returns

A green test suite proves the cases that exist. It does NOT prove that every command / endpoint /
tool actually works, because (a) most have no dedicated test, and (b) a test can reach a feature's
result through a SIDE-CHANNEL the entrypoint itself never uses. The cheap, decisive check is to
RUN each entrypoint on real input and look at the output. That is dogfooding.

## The universal recipe (adapt the mechanics to the surface)

1. **Enumerate the entrypoints.** The full list, from the source of truth — not memory:
   - CLI → `--help` / the subcommand registry / `package.json bin`.
   - HTTP API → the route table / OpenAPI spec.
   - MCP / agent tools → the tool registry (the array of `{name, handler}`).
   - Library → the public exports.
   Reconcile your list count against the registry count so you don't silently miss one.
2. **Sample REAL inputs** from the real system, not hand-made: pull a real id / record / file /
   query from the live data so each call hits something that should return data.
3. **Call each entrypoint, capture the output**, into one row: `{ entrypoint, input, returnedData?,
   size, note }`. `returnedData=false / size=0` is the signal.
4. **Cross-reference a CONSUMER** (`grep` for who calls it): "no consumer + returns rich data" =
   a working engine that's merely unwired (document/expose it, don't delete) vs "no consumer +
   returns nothing" = a candidate to fix or drop.
5. **Confirm a suspicious empty across the corpus** — loop the entrypoint over ALL ids/inputs, not
   one sample, before calling it broken (it may be legitimately empty for that one input).
6. **Write the dataset** (`dataset.json` + a short table) — this is the evidence a prune / scope
   decision rests on.

## The bug class this exists to catch (why a green suite isn't enough)

Coverage blindness: a result reachable two ways — a side-channel the suite exercises and a primary
path it doesn't — hides a broken primary path behind a green suite. Real case in this repo:
`get_trace` returned empty for ALL 47 requirements (its graph-edge path was unbuilt) while the
suite stayed green because coverage maps via tags. No test asserted the tool's output; the dogfood
run saw the empty immediately. After dogfooding, add a test that asserts the entrypoint's OWN
output (see `tests-create-update`, "coverage blindness").

## Make it repeatable

Drop a small harness next to the surface (a script that enumerates + drives + records), commit it,
and wrap it so it re-runs on demand. Concrete instance for this repo's spec-MCP:
`tools/spec-mcp-server/dogfood-dataset.ts` + the `spec-mcp-dogfood` skill — copy that shape for a
new surface.

## See also
- `spec-mcp-dogfood` — the spec-graph-MCP-specific instance (ready to run).
- `tests-create-update` — turn a dogfood finding into a regression test (coverage-blindness rule).
- `suite-failure-triage` — the complement: when the suite is already RED, classify why.

## FR-37d guard — никогда не отмывать структурный pass как здоровье

Этот скилл (и любой агент, репортящий здоровье спеки) **ОБЯЗАН** цитировать
СМАРТ-вердикт — `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/<slug>`
(conformance + coverage + audit + traceability + semantic над одним графом) и его
gap list. **ЗАПРЕЩЕНО** заявлять «valid / clean / done» на основании одного лишь
`validate-spec: 0 errors` — структурный pass это pre-filter, не вердикт. Этот
гард кодирует реальный инцидент 2026-06-05 (false green: structural «valid» при
10 audit-P0 и 1256 smart-находках). Правило:
`.claude/rules/spec-verdict/no-structural-valid.md` (FR-37d).
