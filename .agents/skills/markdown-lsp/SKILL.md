---
name: markdown-lsp
description: >
  How & why to use the Markdown LSP (Marksman, registered as a NATIVE Claude Code
  LSP plugin) for spec navigation + refactor. INVOKE when navigating or editing
  specs across files: find every reference to a requirement (FR-N / AC-N) before
  changing it, rename a heading and propagate links, jump to a definition/anchor,
  or list a spec's headings — instead of text-grepping and guessing slug variants.
  Use the agent-callable `LSP` tool (definition / references / rename / hover /
  documentSymbol) over `[[wiki-links]]` and `[text](#anchor)` links. Pairs with the
  spec-graph MCP, which owns spec-DOMAIN traceability (coverage / honesty / broken
  links), NOT prose navigation. Marksman is auto-installed; run /reload-plugins if
  the LSP tool is inactive.
allowed-tools: LSP, Read, Grep, Bash, Skill
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/markdown-lsp`](../.claude/skills/markdown-lsp/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
