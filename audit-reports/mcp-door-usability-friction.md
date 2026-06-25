# MCP door usability — friction harvested from sessions + DX fix plan

> Produced by the new `spec-mcp-usability-dogfood` skill (`tools/spec-mcp-usability-dogfood/harvest.ts`),
> which mines Claude Code session transcripts for friction with the spec-graph MCP door. 2026-06-25.

## The skill (built + proven)

- `tools/spec-mcp-usability-dogfood/harvest.ts` — builtins-only, fail-open. Reads
  `~/.claude/projects/<encoded-cwd>/*.jsonl`, pairs every `mcp__dev-pomogator-specs__*` call with its
  result, **parses the result as JSON and checks `ok===false`** (never substring "error" on raw text),
  skips sidechain/subagent calls, buckets unparseable results.
- `.claude/skills/spec-mcp-usability-dogfood/SKILL.md` — sibling of `spec-mcp-dogfood` (that checks tools
  WORK; this checks how USABLE they are).

### Proven (verify-against-real-artifact)

- **Ground-truth exact match.** An independent one-liner counting `ok:false` main-agent door results in
  this session = **5**; the harvester reports **5** (doorCalls 56). The crude first detector claimed 11 —
  false positives from substring "error" in spec text. The precise JSON parse is correct.
- **Earns its keep on unpredicted data.** Run on a *different* session (eb041ff6, 23MB) it surfaced
  friction I never pre-listed: `LIVE_INBOUND_EDGES` on delete, a `RESUME.md` raw-access pattern, 3
  unparseable results — not just a re-print of the 3 known issues.

## Findings on THIS session (ranked by observed friction)

| # | Friction (count) | Proposed door fix |
|---|------------------|-------------------|
| 1 | **raw `.specs` access ×27** (agent went around the door with Bash/Write/Read) | each is a DX gap — a door tool missing/undiscoverable/avoided-after-friction; triage top targets |
| 2 | `VALIDATION_FAILED` ×2 (form-contract surfaces only after a failed save) | **FR-4**: expose the doc's required form UP FRONT (describe-contract tool or in create/propose output) |
| 3 | `LIVE_INBOUND_EDGES`, `SPEC_EXISTS` (uncategorised, unhelpful) | **FR-5**: actionable hint naming cause + exact next move |
| 4 | `old_string not found` ×1 + 1 retry (CRLF breaks the single-line anchor) | **FR-3**: document the whole-doc `content` param + add a CRLF hint to the error |

## Live proof, recorded honestly

Creating the spec for THIS work (`spec-mcp-usability-dogfood`) hit the door's own friction so hard it
became evidence: filling FR.md triggered **21 broken-anchor + form-contract findings** because every
sibling doc (AC/DESIGN/FILE_CHANGES/REQUIREMENTS/TASKS) carries bidirectional links to FR's *placeholder*
anchors — changing FR headings demands rewriting ~10 docs in lock-step. That deadlock is exactly what
fix **FR-4** (form/contract visible up front) and a future **spec-wide-rename door tool** would remove.
I stopped grinding it (the owner said «жадбще»). The spec shell exists; finalizing its docs to GREEN is a
tracked task, best done AFTER the door DX fixes land.

## Plan (tasks)

**A — the door DX fixes (code lives in `tools/spec-mcp-server/`, spec `.specs/spec-generator-v4/` FR-39/40):**
1. FR-3 — `apply_spec_change`/`propose_spec_change` description documents the whole-doc `content` param; the
   "old_string not found" error names CRLF + suggests `content`. (`tools/spec-mcp-server/tools.ts`, `mutations.ts`)
2. FR-4 — expose the form-contract before save (a `describe_contract` tool, or a form checklist in
   `create_spec`/`propose_spec_change` output).
3. FR-5 — actionable hints for `LIVE_INBOUND_EDGES` / `SPEC_EXISTS` (cause + next move).

**B — the harvester/skill (built this turn):**
4. Author the BDD `.feature` + step-def driving `harvest()` on a captured-real fixture; wire `cucumber.json`.
5. Refine `raw-specs-access` to window post-failure escapes (currently counts all raw `.specs` touches).
6. Finalize `.specs/spec-mcp-usability-dogfood/` docs to GREEN (blocked on the bidirectional-link friction
   above — do after fix FR-4).

## How to re-run

```bash
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts            # all sessions, markdown
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts --json     # machine-readable
node --import tsx tools/spec-mcp-usability-dogfood/harvest.ts --session <path>
```
