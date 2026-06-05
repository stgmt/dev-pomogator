---
name: spec-get-node
description: >
  Look up a single spec node by its canonical id (FR-7, AC-7.1, SPECGEN004_40, a task id) and
  get its exact file + line + fields — instead of grepping and guessing which slug variant a
  heading uses. Triggers (EN): "where is FR-7 defined", "give me the AC-7.1 node", "find the
  scenario SPECGEN004_40", "what file + line is this requirement", "look up this node".
  Triggers (RU): "где определён FR-7", "дай узел AC-7.1", "найди сценарий SPECGEN004_40",
  "в каком файле и строке требование". Do NOT use to find RELATIONSHIPS of a node (use
  spec-find-refs) or to list many nodes (use spec-find-by-tags / spec-list-specs).
allowed-tools: mcp__dev-pomogator-specs__get_node, Bash, Read
---

# spec-get-node — canonical single-node lookup

**Tool:** `mcp__dev-pomogator-specs__get_node` ({ node_id })

## When
You have an id (FR-7, AC-7.1, SPECGEN004_40, NFR-Reliability-10, a task id) and you want its
authoritative location + fields — to open the right file:line, or to confirm the id exists.

## Why this, not grep
grep on "FR-7" hits every mention across prose and other specs, and a heading's anchor may be
a compact id OR a slug variant — easy to open the wrong line. `get_node` returns the ONE
canonical definition from the built graph, unambiguously.

## How
```
mcp__dev-pomogator-specs__get_node({ node_id: "AC-7.1" })
→ { ok, node: { id, type, file, line, ...fields } }   // ok:false if the id isn't registered
```

## Not for
- "What tests/covers this?" → **spec-find-refs**.
- "Does this anchor resolve?" → **spec-validate-anchor**.
- Listing scenarios by tag → **spec-find-by-tags**.
