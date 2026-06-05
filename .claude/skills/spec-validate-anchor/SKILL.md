---
name: spec-validate-anchor
description: >
  Check whether ONE anchor alias (a compact id like `ac-7-1` OR a slug) resolves to a registered
  heading definition in the spec graph — a fast single-anchor existence check. Triggers (EN):
  "does this anchor resolve", "is #ac-7-1 a real anchor", "validate this single anchor", "will
  this link target exist". Triggers (RU): "резолвится ли этот якорь", "существует ли якорь
  #ac-7-1", "проверь один якорь". Do NOT use to scan + FIX all broken anchors in the corpus
  (that's the anchor-fix skill), or to jump from a link to its heading (that's markdown-lsp).
allowed-tools: mcp__dev-pomogator-specs__validate_anchor, Bash, Read
---

# spec-validate-anchor — single-anchor existence check

**Tool:** `mcp__dev-pomogator-specs__validate_anchor` ({ anchor })

## When
You're about to write a link `[text](file.md#some-anchor)` and want to confirm `#some-anchor`
actually resolves to a registered heading — ONE anchor, right now, before committing the link.

## How
```
mcp__dev-pomogator-specs__validate_anchor({ anchor: "ac-7-1" })
→ { ok: true,  anchor, registered: true,  location }   // resolves
→ { ok: false, anchor, registered: false }             // does NOT resolve
```
Accepts either the compact id (`ac-7-1`) or the GLFM slug.

## Pick the RIGHT tool (this one is narrow on purpose)
- **Scan the whole corpus for broken anchors + auto-fix them** → the **anchor-fix** skill
  (`check.mjs` — bulk detect + deterministic rewrite; this MCP tool does neither).
- **Jump from a `[text](#anchor)` link to its heading, or rename a heading + propagate** →
  the **markdown-lsp** skill (Marksman `definition` / `rename`).
- This tool = a single yes/no "does this one anchor exist in the graph", nothing more.
