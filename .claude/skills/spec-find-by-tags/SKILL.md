---
name: spec-find-by-tags
description: >
  List every BDD Scenario whose tag set contains ALL the given @feature tags (AND semantics) —
  from the built spec graph, not a grep guess. Triggers (EN): "which scenarios are tagged
  @feature7", "scenarios with both @feature5 and @smoke", "find scenarios by tag", "list
  @featureN scenarios". Triggers (RU): "какие сценарии с тегом @feature7", "сценарии с
  @feature5 и @smoke", "найди сценарии по тегу", "список сценариев по @featureN". Do NOT use
  to look up one node by id (spec-get-node) or to find what tests an FR (spec-find-refs).
allowed-tools: mcp__dev-pomogator-specs__find_by_tags, Bash, Read
---

# spec-find-by-tags — scenarios by @feature tag (AND)

**Tool:** `mcp__dev-pomogator-specs__find_by_tags` ({ tags: string[] })

## When
You want the exact set of scenarios carrying a tag (or a combination): "everything under
@feature7", "@feature5 AND @regression". Useful before changing a feature's scope, or to see
which scenarios a tag really covers.

## Why this, not grep
grep over `.feature` files misses tag INHERITANCE (a `@feature7` on the Feature applies to all
its Scenarios) and gets the AND-combination wrong. `find_by_tags` queries the graph, which
already resolved inheritance, and returns only scenarios matching EVERY supplied tag.

## How
```
mcp__dev-pomogator-specs__find_by_tags({ tags: ["@feature5", "@regression"] })
→ scenarios whose tag set ⊇ { @feature5, @regression }
```
One tag = all scenarios under it. Multiple tags = AND (intersection).

## Not for
- A single node by id → **spec-get-node**.
- "What tests FR-7" (FR→scenario semantic edge) → **spec-find-refs**.
