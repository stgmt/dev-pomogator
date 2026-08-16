---
name: spec-archive
description: Proof-gated spec archival — proves against the repo that a spec is genuinely abandoned (or catches a false alarm), then archives it, prunes its orphaned tests, and writes a traceable report. Spec work goes through the MCP door (get_archival_proof / archive_spec); git, test removal and reports use Bash. Autonomous on hard proof, escalates ambiguous to a human, git-revertable. Triggers on "архивируй спеку / archive a retired spec / clean up abandoned specs".
allowed-tools: Read, Glob, Grep, Bash, mcp__dev-pomogator-specs__get_archival_proof, mcp__dev-pomogator-specs__archive_spec, mcp__dev-pomogator-specs__find_refs, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/spec-archive`](../.claude/skills/spec-archive/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
