---
name: spec-find-refs
description: >
  Find every SPEC-DOMAIN reference to a graph node — what covers / tests / implements it —
  BEFORE you rename or change a requirement, AC, scenario, or task. This is the semantic graph
  (covers / tested-by / implements + task refs), NOT markdown links — Marksman/LSP can't see
  these edges. Triggers (EN): "what tests FR-7", "what covers this AC", "what depends on this
  requirement", "who references this node before I change it", "impact of changing FR-N".
  Triggers (RU): "что тестит FR-7", "что покрывает этот AC", "что зависит от требования",
  "на что повлияет если поменять FR-N", "кто ссылается на узел". Do NOT use for markdown
  wiki-link / anchor navigation (that's the markdown-lsp skill / Marksman LSP).
allowed-tools: mcp__dev-pomogator-specs__find_refs, Bash, Read
---

# spec-find-refs — semantic "find all references" over the spec graph

**Tool:** `mcp__dev-pomogator-specs__find_refs` ({ node_id })

## When
Before you rename/edit a requirement (FR), criterion (AC), scenario, or task — find everything
semantically tied to it: what **covers** it, what **tests** it, what **implements** it, which
**tasks** reference it. So a change doesn't silently orphan its coverage.

## Why this, not grep or Marksman
- **grep** finds the text "FR-7" everywhere (including prose), with no idea which is a *covers*
  edge vs a passing mention, and misses refs that use a slug/alias.
- **Marksman LSP** finds markdown `[[wiki-links]]` / `[anchor]` references — it has **no concept**
  of "tested-by / implements / covers". Those edges live only in the spec graph. (server.ts says
  so explicitly.) This tool is the complement to markdown-lsp, not a duplicate.

## How
```
mcp__dev-pomogator-specs__find_refs({ node_id: "FR-7" })
→ { ok, node_id, references: [{ id, type, file, line, relation, direction }], count }
```
`relation` ∈ covers / tested-by / implements / task-ref; `direction` = incoming|outgoing.

## Not for
Jumping from a `[text](#anchor)` link to its heading, or renaming a heading and propagating
links → use the **markdown-lsp** skill (Marksman `definition`/`references`/`rename`).
