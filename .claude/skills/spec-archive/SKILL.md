---
name: spec-archive
description: Proof-gated spec archival — proves against the repo that a spec is genuinely abandoned (or catches a false alarm), then archives it, prunes its orphaned tests, and writes a traceable report. Spec work goes through the MCP door (get_archival_proof / archive_spec); git, test removal and reports use Bash. Autonomous on hard proof, escalates ambiguous to a human, git-revertable. Triggers on "архивируй спеку / archive a retired spec / clean up abandoned specs".
allowed-tools: Read, Glob, Grep, Bash, mcp__dev-pomogator-specs__get_archival_proof, mcp__dev-pomogator-specs__archive_spec, mcp__dev-pomogator-specs__find_refs, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs
---

# spec-archive

Retires genuinely-abandoned specs with PROOF, not on a hunch. Built on the
`legacy-triage` suspicion list; the decisive safety gate is the MCP door.

## Boundary (confirmed)
- **Spec content → MCP door ONLY.** Never raw-`Read`/`Edit` `.specs/`.
- **git, test-file removal, report writing → Bash** (non-spec surfaces).

## Flow (per candidate)
1. **Prove** via `get_archival_proof(slug)` — the graph + prose inbound-reference
   bundle. Verdict:
   - `KEEP_FALSE_POSITIVE` → a LIVE spec still references it ⇒ it is NOT abandoned
     (the "наоборот ошибка" case). Record + stop, never touch disk.
   - `ARCHIVE` → no live spec references it ⇒ graph-clear. Combine with the
     `legacy-triage` supersession signal; if both agree → proceed autonomously.
   - `NEEDS_HUMAN` (ambiguous supersession) → escalate, never touch disk.
2. **Archive** via `archive_spec(slug, reason)` — the gated whole-spec move into
   the archive. It re-checks live refs and refuses `ARCHIVE_BLOCKED` if any
   appeared; `DEST_EXISTS` on a clobber. The archive is then SEALED against the
   mutation door (no further `apply_spec_change`/`delete_spec_doc`/`rename_spec_doc`).
3. **Prune** the orphaned test files (Bash) — only those that cover ONLY this spec.
4. **Report** to `audit-reports/archive-<slug>-<date>.md` (Bash) + `git add` the move.

## Autonomy
Acts on hard proof (no live refs + supersession agree); escalates ambiguous;
everything is `git revert`-able. This evolves `FR-43c` ("never auto-retire") to
"auto-retire ONLY on hard proof + audit trail; ambiguous → human".

@see .specs/spec-generator-v4/FR.md FR-45
