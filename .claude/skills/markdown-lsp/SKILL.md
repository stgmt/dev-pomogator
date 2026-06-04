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

# /markdown-lsp — navigate & refactor specs with the Markdown LSP

## Mission

Specs (`.specs/**/*.md`) are a cross-linked graph of prose: `FR-7` is referenced
from `ACCEPTANCE_CRITERIA.md`, a `.feature`, `TASKS.md`, `DESIGN.md`. When you
**edit** a spec — rename a requirement, move an anchor, check what depends on a
heading — text grep is the wrong tool: it can't tell a heading from a mention,
misses slug variants (`FR-7` vs `fr-7-phase-2-…`), and renames inconsistently.

Marksman is a real Markdown language server. dev-pomogator registers it as a
**native Claude Code LSP plugin** (`.lsp.json` → `plugin.json` `lspServers`), so
its primitives are exposed through Claude Code's built-in **`LSP` tool** — which
you can call directly. Prefer it for navigation/edit; keep the spec-graph MCP for
spec-domain reasoning.

## When to invoke

- About to **rename/change a requirement** (`FR-N`, `AC-N`, a heading) → find
  every reference FIRST (`LSP` references), then rename with propagation.
- Need to **jump from a link to its definition** (`[AC-1.1](#ac-1-1)` /
  `[[FR-1]]`) → `LSP` definition.
- Need the **outline** of a spec file (all headings/anchors) → `LSP`
  documentSymbol.
- Auditing **what links into** a heading across the spec set → `LSP` references.

## How (agent-callable `LSP` tool)

Once the plugin is active, the `LSP` tool serves Marksman's primitives over any
`.md` file:

| Intent | LSP primitive | Use for |
|--------|---------------|---------|
| Go to definition | `definition` | link → the heading/anchor it points at |
| Find references | `references` | every place that links to a heading |
| Rename + propagate | `rename` | rename a heading, update all `[[…]]`/`[…](#…)` |
| Hover | `hover` | preview the target section at a link |
| File outline | `documentSymbol` | list headings/anchors in one spec |
| Workspace symbols | `workspaceSymbol` | find a heading by name across specs |

Diagnostics are ambient: after each `.md` edit the LSP reports broken links /
duplicate headings automatically — read and fix them.

## Measured slug rules (do NOT guess — verified against the real Marksman binary)

These were measured with `textDocument/definition` at the link position; an earlier
guess ("`[[FR-1]]` resolves `## FR-1`") was WRONG — bare `[[X]]` is a *document*
reference. Trust this table, not intuition:

- **Bare `[[X]]` targets a DOCUMENT**, not an H2 heading — it resolves to a note
  whose H1 title (or filename) is `X`. `[[note]]→# Note` is document/H1 resolution.
- **To reach an H2 heading**, the reference carries the slug: `[text](#slug)`
  (markdown, same- or cross-file `[text](other.md#slug)`), `[[#Heading]]`, or
  `[[doc#Heading]]`. All three resolve; bare `[[Heading-id]]` does not.
- **Slug rule = GitHub-style with one trap: DOTS ARE REMOVED, dashes kept.**
  `## FR-7` → `fr-7`; `## NFR-Performance-1` → `nfr-performance-1`;
  `## AC-1.1` → `ac-11` (NOT `ac-1-1`); `## AC-27.1` → `ac-271`;
  `## FR-7: Phase 2 — Title` → `fr-7-phase-2-title`.
- **Custom anchors `{#id}` do NOT work** — Marksman parses `## H {#fr-7}` as a
  "Tag" symbol, but `[…](#fr-7)` stays unresolved.
- **Slugs match within OR across files** as long as the target file is in the
  workspace (`.marksman.toml`/`.git` marker present).

## Why over grep (the failure grep can't avoid)

- **Slug semantics.** Marksman matches a markdown anchor / `[[#heading]]` link by the
  target heading's slug (rules above). `[FR-7](FR.md#fr-7)` resolves only if the
  heading's slug is exactly `fr-7` (i.e. `## FR-7`), NOT `## FR-7: Title`
  (slug `fr-7-title`). The LSP knows this; grep `FR-7` cannot distinguish the
  heading, a link, and an unrelated mention.
- **Safe rename.** `rename` rewrites the heading AND every inbound link in one
  atomic edit. Grep-and-sed misses links whose slug differs from the visible
  text and silently desyncs the cross-references.
- **Cross-file precision.** `references` returns exact file:line locations of real
  links, not substring hits in code fences or prose.

## Division of labour — LSP vs spec-graph MCP

Do not reimplement navigation in custom code, and do not ask the LSP for things it
has no concept of:

- **LSP (Marksman) owns**: navigation + edit over links/headings — definition,
  references, rename, hover, documentSymbol. This is *prose structure*.
- **spec-graph MCP owns**: spec-*domain* reasoning the LSP cannot model —
  `get_trace` / `get_coverage` (FR → AC → Scenario → Task → test), the honesty
  gate, conformance, and **broken-link detection** (`wikilinks.ts` flags
  unresolved `[[…]]` as a conformance signal, NOT as a navigation fallback).

Typical combined flow: use `LSP` references to see what links into `FR-7`, `LSP`
rename to retitle it, then the spec-graph MCP `get_coverage` to confirm the
FR→AC→Scenario→Task chain is still complete.

## Setup & troubleshooting

- **Auto-installed.** A `SessionStart` hook (`ensure-marksman`) resolves the
  binary PATH-first, else downloads a managed copy to `.dev-pomogator/bin/`. You
  do not install anything.
- **LSP tool inactive?** The tool activates only when the plugin registers a
  server. After first install (or a plugin update) run **`/reload-plugins`**; the
  binary path change needs it to take effect.
- **`Executable not found in $PATH` in the `/plugin` Errors tab** → the managed
  download has not completed; re-run the session so `ensure-marksman` finishes,
  then `/reload-plugins`.
- **No js-fallback.** When Marksman is genuinely unavailable (offline +
  unsupported platform), navigation features are simply absent with a message —
  the system does not fake a degraded Markdown LSP. Use the spec-graph MCP for
  trace/coverage in the meantime.

## See also

- `.specs/spec-generator-v4/FR.md` FR-7 / FR-7a–d — the architecture this skill ships with.
- `tools/marksman-installer/launch-marksman.cjs` — the launcher the `.lsp.json` `command` points at.
- spec-graph MCP (`tools/spec-mcp-server/`) — `get_trace` / `get_coverage` for spec-domain traceability.
