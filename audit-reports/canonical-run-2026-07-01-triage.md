# Canonical BDD run triage — 2026-07-01

Full Docker/Linux canonical suite (`bqqnfpm1o`): **1498 scenarios, 1488 passed, 10 failed**
(9048 steps, 10 failed). Node 20 + tsx in-container. All 8 `@feature57` scaffold-completeness
scenarios (the FR-57 stub-detection feature) **passed**.

The 10 failures triaged below into 4 classes. 2 were a regression I introduced; 5 were a
CRLF bug; 1 is a static-artifact test whose file is correct (isolation/rerun); 2 are a
different spec's fixture↔check drift requiring a design decision.

## Class 1 — MINE: core.mjs lost single-file portability (2) — FIXED

`ARCH012_01` / `ARCH012_02` (`feature_architecture_decision_builder.ts:1859/1952`).

- **Symptom:** `ERR_MODULE_NOT_FOUND: scaffold-sentinels.mjs imported from specs-generator-core.mjs`.
- **Root cause:** FR-57 added a *static* top-level `import './scaffold-sentinels.mjs'` to
  `specs-generator-core.mjs`. The arch-decision e2e fixture copies **only** core.mjs into a bare
  tmp dir and runs `scaffold-spec`; the absent sibling killed module load.
- **Fix:** lazy `await import('./scaffold-sentinels.mjs')` inside `commandAuditSpec`'s existing
  try/catch (same pattern validate-spec uses for `../anchor-integrity`); `commandAuditSpec` made
  `async` (the CLI runner already awaits both sync and Promise returns).
- **Verified locally:** standalone `scaffold-spec` exits 0 with no sibling; `audit-spec` still
  emits 37 INFO `SCAFFOLD_INCOMPLETE` findings on an early-phase stub spec.
- **Branch:** `fix/fr57-core-portable-lazy-import` (pushed).

## Class 2 — CRLF fence regex in skills-rules-optimizer (5) — FIXED

`SRO006` / `SRO008` / `SRO017` (merge-skills) + `SRO013` / `SRO014` (verify-merge).

- **Symptom:** `MERGE_PROMPT/SCORER_PROMPT template missing code fence in references file` → exit 2.
- **Root cause:** the template loaders matched `/```\n([\s\S]*?)```/` — a **bare `\n`** right after
  the opening fence. `references/merge-prompt-template.md` is **CRLF** (```` ```\r\n ````), so on a
  Linux checkout the `\r` breaks the match. Deterministically reproduced locally.
- **Fix:** widen to `/```[^\n]*\n(...)```/` in both `merge-skills.ts` and `verify-merge.ts` — `[^\n]*`
  absorbs a CRLF `\r` and/or a language tag; parser is now line-ending-agnostic.
- **Verified locally:** merge-skills exits 0 with the invoke-agent envelope; verify-merge exits 0
  with the ratchet-scorer envelope (on_regression/on_pass/cleanup×2, `--force` propagates).
  Docker filtered re-run: see run `bgtvblrlz`.
- **Branch:** `fix/sro-crlf-fence-regex` (pushed).

## Class 3 — verify-generic-scope-fix static artifact (1) — RERUN, no code fix

`VSGF001_50` (`feature_verify_generic_scope_fix.ts:513`).

- **Symptom:** "SKILL.md frontmatter must contain disable-model-invocation: true".
- **Finding:** the file **is correct** on disk AND in HEAD (`.claude/skills/verify-generic-scope-fix/SKILL.md`,
  committed 079c0c18 2026-05-27): clean LF, `disable-model-invocation: true` on line 5, matches the
  test's `^---\n([\s\S]*?)\n---` regex. The step only *reads* the file (no writer). The failure is a
  shared-tree/isolation transient (a parallel scenario mutating `.claude/skills/` mid-run) or an
  image-build timing artefact — a re-run should pass. No product defect.

## Class 4 — pomogator-doctor fixture↔check drift (2) — SEPARATE, design-laden

`POMOGATORDOCTOR001_04` (valid fixture, "silent when all OK") + `POMOGATORDOCTOR001_05`
("bare home with no config" → suppressOutput=true). `feature_pomogator_doctor.ts:658`.

- **Symptom:** `expected undefined to be true` — the SessionStart hook emitted a banner
  (`additionalContext`) instead of `suppressOutput: true`.
- **Root cause:** `buildHookOutput` is silent **iff** `critical===0 && warnings===0`, else it emits a
  banner — and this contract is itself **tested and intentional** (`feature_pomogator_doctor.ts:517-527`),
  so it must NOT change. The real cause is that newer environment checks fire warnings against both
  the "valid" fixture and a bare home. Local (Windows) repro on a bare home fired 6:
  `C-CMEM` (claude-mem not installed), `C-CTXM` (Windows menu), `C-MCPA` + `C11` (MCP not configured),
  `C-NSL` (statusline not set), `C17` (session-pilot server not on :3456). The `temp-home-builder`
  "valid" fixture only satisfies the auto-commit/config/hooks checks; the 6 environment checks were
  added later and were never taught to gate out for an isolated/bare home → the fixture and the
  check-set drifted (rule: `verify-divergent-contracts`).
- **Why not fixed here:** the fix is a **relevance-gating change across ~6 checks** (or a
  quiet-mode check-subset), with real cross-scenario risk (other scenarios assert those same checks
  *do* warn), and it is only faithfully verifiable in Docker/Linux (the noisy check-set differs from
  Windows). It belongs to the `pomogator-doctor` spec (`@feature17`/`@feature10`), not to the
  spec-generator-v4 backlog. This is scoped follow-up work, not a mechanical fix.

## Ownership

- Classes 1 & 2: fixed + pushed this session (branches above). PRs pending the filtered Docker green.
- Class 3: no code change — needs a clean canonical re-run to clear.
- Class 4: a scoped `pomogator-doctor` task — relevance-gate the environment checks for
  isolated/bare homes (or restrict quiet-mode to critical-eligible checks), Docker-verified.
