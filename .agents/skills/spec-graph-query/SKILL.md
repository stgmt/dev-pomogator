---
name: spec-graph-query
description: >
  Cheatsheet for querying the spec-graph MCP (`dev-pomogator-specs`) instead of grepping
  `.specs/` and guessing slug variants. Pick the right tool for: look up a node by id, find
  what covers/tests/implements a node, list scenarios by @feature tag, list specs, list a
  phase's tasks, per-spec FR/AC/Scenario counts, or check a single anchor. Triggers (EN):
  "query the spec graph", "look up FR-7 / AC-7.1 / a scenario node", "what tests/covers FR-7",
  "what depends on this requirement before I change it", "scenarios tagged @featureN", "what
  specs exist", "tasks in Phase 2", "how many FR/AC/scenarios per spec", "does this anchor
  resolve". Triggers (RU): "запросить граф спек", "найди узел FR-7 / AC-7.1 / сценарий", "что
  тестит/покрывает FR-7", "что зависит от требования", "сценарии с тегом @featureN", "какие
  спеки есть", "задачи фазы 2", "сколько FR/AC/сценариев в спеке", "резолвится ли якорь". Do
  NOT use for: markdown link/anchor NAVIGATION or rename (markdown-lsp / Marksman), bulk
  broken-anchor scan+fix (anchor-fix), the honest per-task DONE verdict (get_spec_status view
  coverage / spec-status), or cross-spec drift (cross-spec-reconcile).
allowed-tools: mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__find_by_tags, mcp__dev-pomogator-specs__conformance_check, mcp__dev-pomogator-specs__search, mcp__dev-pomogator-specs__get_node, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__list_phase_tasks, mcp__dev-pomogator-specs__list_tasks, mcp__dev-pomogator-specs__get_test_result, mcp__dev-pomogator-specs__get_scenario_trace, mcp__dev-pomogator-specs__find_orphans, mcp__dev-pomogator-specs__validate_anchor, mcp__dev-pomogator-specs__validate_requirement_metadata, mcp__dev-pomogator-specs__policy_query_requirements, mcp__dev-pomogator-specs__set_requirement_metadata, mcp__dev-pomogator-specs__list_specs, mcp__dev-pomogator-specs__find_refs, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__read_attachment, Bash, Read
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-graph-query`](../.claude/skills/spec-graph-query/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
