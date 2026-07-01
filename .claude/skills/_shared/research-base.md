# Research base — shared rigor for research skills (FR-12, T6-45)

The common research foundation referenced by **both** `research-workflow` (4-phase technical
research) and `architecture-research-workflow` (its 7-stage flow calls research-workflow as the
Stage-3 "broad research" primitive). One source of truth for the verification discipline so the
two skills don't drift. Each skill keeps its own workflow; the rules below are SHARED.

## 1. Hypothesis-FIRST

Formulate falsifiable hypotheses BEFORE searching; search for proof/disproof, not for
interpretation. "Research then derive hypotheses from results" is backwards — findings get
fitted to a conclusion. Distribution and discovery are the first two hypotheses for any
package/plugin/tool research ("how is it installed?", "how is it discovered?").

## 2. Source taxonomy (what counts as evidence)

A SOURCE is external + independent of this work:
- ✅ Official docs (fetched + quoted), source code, standards/RFCs, independent community refs
  (issues, blog posts, SO) that don't cite each other.
- ❌ NOT sources: generated artifacts of THIS work — spec files (`.specs/**`), plan files
  (`~/.claude/plans/**`), prior `RESEARCH.md`, the agent's own earlier output. Citing them is
  circular validation → `[CIRCULAR_RISK]`.
- "3 search hits from the same doc/author" = ONE source, not three.

## 3. Triangulation — ≥3 INDEPENDENT sources per load-bearing claim

Every claim the design leans on MUST be verified across ≥3 independent sources with direct
quotes. Fewer → mark it explicitly (below). One source ≠ verified, even if it's the user's
assertion.

## 4. Verification markers (mandatory in output)

Tag every claim:
- `[VERIFIED]` — ≥3 independent sources, direct quotes, dates checked.
- `[SINGLE_SOURCE]` — only one source found; treat as provisional.
- `[UNVERIFIED]` — asserted (incl. by the user) but no docs/code proof.
- `[ASSUMED]` — reasonable default, not checked.
- `[CIRCULAR_RISK]` — only internal/generated artifacts cited.
- `[CITED_NOT_FETCHED]` — a URL listed but not actually fetched+quoted (= `[UNVERIFIED]`).

## 5. Exhaustiveness for schema/API/protocol questions

Enumerate ALL fields with required/optional split — never "the key fields". Read the WHOLE
reference (e.g. `plugins-reference.md`), not just the overview. Undercoverage (4 of 15 fields)
is the most common research failure.

## 6. Recency

For each URL, check the last-updated date. >12 months old → flag the staleness risk; APIs and
install/discovery mechanics drift fast.

## 7. Anti-patterns (do not repeat)

| # | Failure | Guard |
|---|---------|-------|
| AP-1 | Schema undercoverage | enumerate ALL fields, read the full reference |
| AP-2 | Distribution misassumption | distribution = first hypothesis; find the real install command |
| AP-3 | Discovery misassumption | discovery = second hypothesis; ask "how is it found?" |
| AP-4 | Single-source as fact | `[UNVERIFIED]`; user assertion ≠ verified |
| AP-5 | Date-blind quote | recency check per URL |
| AP-6 | Hypothesis-after-research | hypotheses BEFORE search |
| AP-7 | Self-citation / circular | generated artifacts are not sources → `[CIRCULAR_RISK]` |
| AP-8 | Cited-but-not-fetched | every URL actually fetched + quoted, else `[UNVERIFIED]` |

## 8. External-pain validation (does the problem exist outside our head?)

Before committing to a solution, find evidence the PROBLEM is real for someone else: an issue,
a thread, a "why does X hurt" post, a competing tool's existence. No external pain signal →
mark the problem `[ASSUMED]` and treat the whole effort as a bet, not a validated need.

## 9. Misconception flush (before broad research)

List your current assumptions about the topic EXPLICITLY, then actively seek disproof for each.
The goal is to surface what you "already know" that might be wrong (an outdated mental model, a
convention assumed universal) BEFORE it biases the search. Anything that survives a disproof
attempt graduates from `[ASSUMED]` toward a verifiable hypothesis (§1).

---
Consumed by: `.claude/skills/research-workflow/SKILL.md` and
`.claude/skills/architecture-research-workflow/SKILL.md` (Stage 3 broad-research). FR-12 / US-12.
