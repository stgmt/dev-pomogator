---
name: spec-generator-dev
description: >
  Maintenance & development discipline for the spec-generator-v4 subsystem (the spec-graph,
  its parsers, the MCP server, the authoritative verdict, the judge, the backlog resolvers and
  the auditors). INVOKE when: fixing ANY defect found in spec docs or graph output («почини
  спеку/граф/вердикт», «откуда этот мусор в FR.md», «false positive у audit/conformance»),
  extending the subsystem (new MCP tool, new check, new resolver), or reviewing a change that
  touches tools/spec-graph / tools/spec-mcp-server / tools/specs-generator / tools/spec-backlog /
  tools/spec-llm-judge. Triggers (RU): «поддержка спек-генератора», «разработка спек-плагина»,
  «почини генератор спек», «producer-фикс», «кто породил этот дефект», «ревью спек-генератора», «почини вердикт/счётчик/граф/хук спек», «оживи guard», «ложная находка», «шум в счётчике». Triggers (EN): "spec
  generator dev", "maintain the spec plugin", "producer fix", "what produced this defect", "review the spec generator", "false finding", "noisy counter".
  Do NOT use for authoring a spec's CONTENT (create-spec), per-spec health (spec-status /
  spec-verdict), or corpus hygiene runs (corpus-health).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__conformance_check, mcp__dev-pomogator-specs__search, mcp__dev-pomogator-specs__propose_spec_change, mcp__dev-pomogator-specs__apply_spec_change
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-generator-dev`](../.claude/skills/spec-generator-dev/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
