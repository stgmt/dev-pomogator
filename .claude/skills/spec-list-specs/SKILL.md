---
name: spec-list-specs
description: >
  Enumerate the `.specs/<slug>/` specs currently present in the spec graph — the authoritative
  "what specs exist" list, before a cross-spec operation or to pick a slug. Triggers (EN):
  "what specs exist", "list all specs", "which specs are loaded", "enumerate .specs". Triggers
  (RU): "какие спеки есть", "список всех спек", "перечисли спеки", "что в .specs". Do NOT use
  to read a spec's contents (Read) or for per-spec coverage counts (spec-coverage-summary).
allowed-tools: mcp__dev-pomogator-specs__list_specs, Bash, Read
---

# spec-list-specs — enumerate the specs in the graph

**Tool:** `mcp__dev-pomogator-specs__list_specs` ({})

## When
You need the canonical set of spec slugs — to choose one, to iterate cross-spec, or to confirm
a spec is actually loaded into the graph (not just a folder on disk that failed to parse).

## Why this, not `ls .specs/`
`ls` lists folders, including ones the parser skipped or that aren't real specs. `list_specs`
returns only the slugs the graph actually built — so "loaded" is guaranteed, not assumed.

## How
```
mcp__dev-pomogator-specs__list_specs({})
→ { ok, specs: [ "spec-generator-v4", "session-pilot", ... ] }
```

## Not for
- Reading a spec's files → **Read**.
- FR/AC/scenario COUNTS per spec → **spec-coverage-summary**.
- Cross-spec drift/contradictions → **cross-spec-reconcile**.
