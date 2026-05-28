# honest-status-command — Spec Archived (NOT-DONE)

**Status:** archived to backlog 2026-05-23. **No code was written for this spec** — only the 17 spec documents (FR/AC/USER_STORIES/USE_CASES/DESIGN/RESEARCH/TASKS/REVIEW_NOTES/CHANGELOG/README/SCHEMA + .feature + FIXTURES).

**Why archived:**
- Effort estimate: ~5 dev-days (10 FRs: sub-agent delegation, AC evidence audit, test recency check, test quality classifier, env blocker section, structured JSON output, etc).
- Existing workaround: `node extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs audit-spec -Path .specs/<slug>` already produces independent (non-LLM-self-judgment) audit findings on FR↔AC links, FILE_CHANGES paths, scenario counts, etc. We used it 7+ times in the 2026-05-23 closeout session to verify and close real specs (commits `e5fde0b`, `a12359d`, `fd682cb`, `808f8d2`, `fb883e2`, `01f0903`, `ce3f864`, `b6d5d9c`).
- The "honest sub-agent" delegation pattern was novel but our manual practice (spawn Explore agent + cross-check code against FRs) achieves the same independence without a wrapper skill.
- Rework risk: `specs-generator-core.mjs` is currently monolithic; if `spec-generator-v4` (RECOVERED in 2026-05-23) ever lands, it splits the generator into a SpecGraph MCP server with `get_trace()` API. A `/spec-status` skill built on the legacy API would need rewriting.

**What's reusable from this spec:**
- AC evidence classification taxonomy (Verified / Partial / Missing) — could be folded into a future audit-checks.ts category.
- Test quality dimensions checklist — overlaps with the `strong-tests` skill's 12-point self-eval. Worth a cross-reference if resurrected.
- Environmental blockers concept — orthogonal to other audits, may be useful as a separate doctor check.

**To resurrect:**
1. Decide which target API: legacy `specs-generator-core.mjs` (build now, rebuild after v4) or v4 SpecGraph (wait for v4 Phase 1).
2. Restore directory from backlog (`git mv .specs/backlog/honest-status-command .specs/`).
3. Re-evaluate whether existing tooling (`audit-spec.ts` + `deep-insights` skill + manual sub-agent audit) covers the use case before re-implementing.

**Reference:**
- Original spec docs preserved in this directory: `FR.md`, `DESIGN.md`, `REVIEW_NOTES.md`, etc.
- Companion archived specs: `.specs/backlog/{chrome-devtools-mcp-mux,claude-in-chrome-multisession}/`.
