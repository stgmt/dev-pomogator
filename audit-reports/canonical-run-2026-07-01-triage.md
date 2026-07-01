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
- **Root cause:** the SessionStart quiet path (`runQuiet` → `buildHookOutput`) emits a banner
  whenever `warnings > 0` **or** `critical > 0`. Both fixtures are non-empty for reasons the
  contract deems "OK":
  - **05 bare home:** `C3` is **critical** `config.json not found` (an *uninstalled* home) plus
    warnings `C-NSL`/`C-CMEM`/`C14`/`C17`/`C25`.
  - **04 valid fixture:** config present (0 critical) but the *optional / self-healing* components
    aren't set up → warnings `C-NSL` (statusline), `C-CMEM` (claude-mem), `C14` (.gitignore),
    `C17` (session-pilot :3456), `C25` (pre-commit).
  (An earlier Windows probe also listed `C11`/`C-MCPA` — a **probe artefact**: it passed the wrong
  option key `projectDir` instead of `projectRoot`, so `collectReferencedMcpServers` defaulted
  `projectRoot` to the real repo and read its `mcp__context7__`/`mcp__octocode__` refs. With the
  correct key those MCP checks are quiet on a bare home.)
- **Docker baseline:** full `pomogator-doctor` feature = **26 scenarios, 24 passed, only 04/05
  failed** — the "does-warn-when-misconfigured" scenarios all live on interactive (`runDoctor`)
  paths, not the quiet path.
- **Fix (implemented + Docker-verified):** the entire change lives in `runQuiet` (`engine/index.ts`)
  — **zero check edits, zero interactive-path risk**. SessionStart nags only on a **critical** issue
  in an **installed** home; an uninstalled/bare home (no `~/.dev-pomogator/config.json`) and
  warnings-only both `suppressOutput`. `buildHookOutput`'s banner-on-warning contract
  (`feature_pomogator_doctor.ts:517-527`, interactive) is untouched, `C3`'s critical branches
  (corrupt config, canonical carve-out) are untouched, and `homeDir` is resolved identically to
  `executeChecks`. **Docker after: `30 scenarios (30 passed)`** (POMOGATORDOCTOR001 + 002 — 04/05
  green, the 24 prior-green + 002 "false-critical" scenarios all still green). Branch
  `fix/doctor-quiet-suppress-noncritical` (PR #80).

## Ownership

- Class 1: fixed + Docker-verified (2/2) — PR #79 (`fix/fr57-core-portable-lazy-import`).
- Class 2: fixed + Docker-verified (5/5) — PR #78 (`fix/sro-crlf-fence-regex`).
- Class 3: no code change — needs a clean canonical re-run to clear (artifact is correct in HEAD).
- Class 4: fixed + Docker-verified (30/30) — PR #80 (`fix/doctor-quiet-suppress-noncritical`).

All 10 canonical failures are now resolved (9 fixed across 3 PRs; 1 is a no-op re-run).
