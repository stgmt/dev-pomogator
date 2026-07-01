# Session Dogfood Findings — spec-generator / MCP-door / BDD-workflow (2026-06-18)

> Harvested from a live BDD-migration rollout session (wiring pomogator-doctor + strong-tests
> into the canonical cucumber suite). These are real frictions/bugs the workflow surfaced while
> being *used*, not theoretical. Fix policy (per owner): **capture each as a spec work-item
> (FR/AC/task) so the spec-driven workflow drives the actual code fix** — this doc is the
> analysis + work-plan; the spec additions are the executable queue.

## Summary

| ID | Finding | Area | Severity | Target spec | Owner |
|----|---------|------|----------|-------------|-------|
| F1 | Stale scenario vs in-flight **E-A** door redesign (read-only door removed) | MCP door | HIGH | spec-generator-v4 | E-A author (not me) |
| F2 | Filtered cucumber run **clobbers** the canonical `.last-test-run.ndjson` | BDD workflow | MEDIUM | spec-generator-v4 | open |
| F3 | Anchor-fix tooling (`fix.mjs`) **unusable under enforce** (blocked + bypasses door) | anchor-integrity | MEDIUM | spec-generator-v4 / anchor | open |
| F4 | `validate_anchor` MCP tool semantics **overloaded** (compact-id ≠ Marksman slug) | MCP tools | LOW | spec-generator-v4 | open |
| F5 | **v1→v2 FILE_CHANGES path drift** not auto-detected on migrated specs | spec workflow | MEDIUM | spec-generator-v4 | open |
| F6 | Comment-tag (`# @featureN`) → real-tag promotion is **manual** at wire time | BDD migrator | LOW-MED | spec-generator-v4 (FR-51) | open |
| F7 | `TASK_NO_OWN_SCENARIO` warns on **many→few** task↔scenario (migrator consolidation) | conformance | LOW | spec-generator-v4 | policy |
| F8 | `DONE-but-unverified` coverage-join nuance (strong-tests:t29 maps to a *passed* scenario) | FR-32 coverage | LOW | spec-generator-v4 | open |
| F9 | Stale verdict temp files mislead (no timestamp) — read as current | workflow hygiene | LOW | n/a (process) | me |
| F10 | enforce Bash-guard recurring friction (engine-CLI redirect, fix.mjs block) | enforce policy | LOW-MED | spec-generator-v4 | open |

---

## F1 — Stale scenario vs in-flight E-A door redesign (read-only door removed)

**Symptom.** The full canonical cucumber run is 382/383 — the one red is `SPECGEN004_149`
("the read-only door keeps every session live for reads while writes serialise to the lock owner"):
`AssertionError: apply_spec_change must refuse in a read-only door — true !== false`. Fails identically
in **total isolation** (1 scenario, 1 failed), so it is neither cross-scenario pollution nor my
doctor/strong-tests wiring.

**Evidence / root cause.** `git diff tools/spec-mcp-server/` shows **+293 uncommitted lines** across 7
files implementing a feature self-labelled **"E-A (FR-8..FR-13 plan, 2026-06-18): short per-WRITE lock
for parallel sessions"**. It **deliberately removes** the lifetime write-exclusivity (the read-only
door): `readOnlyRefusal` is rewritten to `const readOnlyRefusal = (_tool, _args) => null;` (no-op →
writes proceed), and `apply_spec_change` now wraps `casCheck→validate→write` in a short re-entrant
`withWriteLock`; `WRITE_LOCK_HELD` (lifetime) is replaced by transient `WRITE_LOCK_BUSY` raised only
during another session's in-flight write. `SPECGEN004_149` + its FR still assert the **old** P21-1
read-only-door semantics (committed in `4cc1aec`/`ff22e91`).

**Class.** verify-divergent-contracts — two sources of truth diverge: the scenario says
"refuse-under-lifetime-lock", the (uncommitted) code says "no lifetime lock, write freely + CAS".

**Not mine.** My session only *called* the door (`apply_spec_change`), never edited spec-mcp-server
source. The E-A change is uncommitted WIP by another session/state.

**Fix (via spec).** The E-A author must, **in the same change that commits E-A**, rewrite
`SPECGEN004_149` and the read-only-door FR to the new semantics: (a) a second session's
`apply_spec_change` **succeeds** (no lifetime read-only door); (b) two sessions editing the **same** doc
race → optimistic `CAS_MISMATCH`; (c) `WRITE_LOCK_BUSY` is raised only during a genuine in-flight write
and is transient/retryable. Until then the canonical suite carries one known-red stale scenario.
**Work-item:** spec-generator-v4 task "update read-only-door BDD to E-A short-write-lock semantics".

---

## F2 — Filtered cucumber run clobbers the canonical ndjson

**Symptom.** After the full canonical run (correct 382/383), I ran one scenario with
`cucumber.js --name "SPECGEN004_149"` to diagnose. That single-scenario run **overwrote**
`.dev-pomogator/.last-test-run.ndjson` → every other spec's verdict then showed `coverage: not_run`
(doctor 40 not_run, strong-tests 11 not_run) until I re-ran the full suite to restore it.

**Root cause.** The default `cucumber.json` has `format: ["message:.dev-pomogator/.last-test-run.ndjson", …]`.
**Any** filtered/scoped invocation through the default config rewrites the canonical coverage artifact
with a partial result — there is no guard, and `spec-verdict`/census/the Stop-gate all read that file
as authoritative. (FR-32 already *notes* "the last run was FILTERED" but does not *prevent* the clobber.)

**Class.** workflow/tooling footgun (silent coverage corruption).

**Fix (via spec).** Make the canonical ndjson clobber-safe: (a) a thin `run-bdd` wrapper that forces
any filtered/`--name`/scoped run to a throwaway ndjson and only a *full* run writes the canonical; or
(b) the message-format target keys off a "FULL_RUN=1" gate; or (c) `spec-verdict` records the scenario
**count** in the ndjson header and warns/aborts when a coverage read is from a partial run. **Work-item:**
spec-generator-v4 task "canonical ndjson is written only by a full run (filtered runs → throwaway)".

---

## F3 — Anchor-fix tooling unusable under enforce

**Symptom.** The `anchor-integrity` Stop-gate (FR-34) flagged 3 broken link anchors in
`spec-reality-check/FR.md` (truncated `#edge-case-1-fail-open` vs the real heading slug). The gate's
suggested fix — `node tools/anchor-integrity/fix.mjs --spec .specs/… --apply` — is **doubly unusable
under `SPEC_ACCESS_ENFORCE`**: (1) the Bash-guard denies any command with `.specs/` in its text unless
it's a whitelisted engine-CLI (fix.mjs is not), and (2) `fix.mjs` writes `.specs/` **directly** with
`fs`, bypassing the mutation door entirely. I had to hand-compute the GLFM slug via `marksman-slug.mjs`
in a throwaway script and apply the link fix through `apply_spec_change`.

**Root cause.** The anchor fixer predates the MCP-door enforce model; there is no door-routed anchor-fix
path, and the gate advertises a command that the enforce policy forbids.

**Class.** workflow gap (tooling vs enforce) — and the gate's own remediation hint is wrong under enforce.

**Fix (via spec).** Either (a) add an `apply_anchor_fix`/`fix_anchors` MCP door tool that computes the
canonical slug (shared `marksman-slug.mjs`) and writes via the validated door, or (b) make
`anchor_gate_stop` emit a door-compatible remediation under enforce (and stop advertising the raw
`fix.mjs` command). **Work-item:** spec-generator-v4 (or anchor-integrity spec) task "anchor-fix works
through the door under enforce; gate hint is enforce-aware".

---

## F4 — `validate_anchor` MCP tool semantics overloaded

**Symptom.** I tried `validate_anchor` to confirm a Marksman heading slug; it returned
`registered: false` for every candidate — because it checks the **spec-graph compact-id/alias registry**,
not Markdown heading slugs (FR-34 Marksman). "Anchor" means two different things in this codebase and the
tool silently answers about the wrong one.

**Root cause.** Naming/scope ambiguity + a missing capability (no tool validates that a
`DOC.md#heading-slug` link actually resolves to a real heading).

**Class.** MCP-tool clarity / missing capability.

**Fix (via spec).** Clarify `validate_anchor`'s description ("compact-id/alias registry, NOT Marksman
heading slugs"), and add a heading-slug resolution check (reuse `marksman-slug.mjs` + the doc's headings).
**Work-item:** spec-generator-v4 task "validate_anchor scope clarified + heading-slug link validation".

---

## F5 — v1→v2 FILE_CHANGES path drift not auto-detected

**Symptom.** `pomogator-doctor/FILE_CHANGES.md` carried **14 `edit` rows** pointing at `src/*` and
`extensions/*/extension.json` — the v1 layout removed in the v2.0 canonical-plugin migration. The audit
gate flagged them only as generic `FILE_CHANGES_VERIFY` (file-not-exist); nothing recognised "these are
dead v1 paths; the real files moved to `.claude/skills/<x>/`". I verified `src/**` and
`extensions/**/extension.json` return **nothing**, then reconciled the 14 rows by hand via the door.

**Root cause.** Migrated/v2 specs inherit v1-era FILE_CHANGES paths; there is no v1→v2 drift detector and
no remap guidance. (`check:status-drift` covers status markers, not FILE_CHANGES layout drift.)

**Class.** workflow gap (migration drift, recurs for every migrated spec).

**Fix (via spec).** A v1→v2 path-drift detector: when a FILE_CHANGES `edit` path matches a known-removed
v1 prefix (`src/`, `extensions/`) AND the file is absent, emit a specific finding "v1 layout path — remap
to v2 `.claude/...` or drop". **Work-item:** spec-generator-v4 task "audit recognises v1→v2 FILE_CHANGES
layout drift with remap guidance".

---

## F6 — Comment-tag → real-tag promotion is manual at wire time

**Symptom.** The migrator leaves scenarios `# @featureN` (comment, concurrent-safe) — graph-invisible →
`UNTAGGED_SCENARIO` / `TASK_UNTESTED` until the main loop promotes them to real `@featureN`. I did the
promotion by hand (`apply_spec_change` `replace_all "  # @feature" → "  @feature"`) for doctor + strong-tests.

**Root cause.** No atomic "promote comment-tags on wire" step; the migrator SKILL documents the manual
recipe but there is no tool.

**Class.** workflow friction (partly hardened in the migrator SKILL).

**Fix (via spec).** A door helper or wire-step `promote_feature_tags(spec)` that converts `# @featureN` →
`@featureN` with the SRO009-style tag-number verification (tag number must match the FR the scenario
actually tests). **Work-item:** spec-generator-v4 FR-51 (migrator) task "atomic tag-promotion at wire".

---

## F7 — `TASK_NO_OWN_SCENARIO` on many→few task↔scenario consolidation

**Symptom.** strong-tests has 12 tasks (t18–t33) covered by 6 consolidated scenarios → conformance emits
`TASK_NO_OWN_SCENARIO:12` (warning, non-gating). The migrator deliberately consolidates related behaviours
into fewer, stronger scenarios.

**Root cause.** The conformance check expects ~1:1 task↔scenario; migrator consolidation is many→few.

**Class.** policy question (warning only — verdict stays GREEN).

**Fix (via spec).** Decide the policy and encode it: either accept many→few for migrated specs (a task is
"tested" if ≥1 covering scenario passes — relax the warning when a tested-by edge exists) or require the
migrator to split. **Work-item:** spec-generator-v4 decision "task↔scenario cardinality policy for
consolidated migrations".

---

## F8 — `DONE-but-unverified` coverage-join nuance (t29)

**Symptom.** After the full canonical run, `strong-tests:t29` (Go detector) maps to `TESTQUAL001_10`
which **passed**, yet the verdict lists it as `DONE-but-unverified` (the other 11 of the original 12
cleared). traceability gate = 0 gaps; verdict still GREEN.

**Root cause.** Unconfirmed — likely a task→scenario→result join edge in the FR-32 rollup (e.g. the
worst-of across all `@feature7` scenarios, some `@manual`/not-run).

**Class.** possible FR-32 coverage bug (low).

**Fix (via spec).** Investigate the t29 join; if the rollup takes worst-of across sibling scenarios
(including not-run `@manual`), scope "verified" to the task's own covering scenario. **Work-item:**
spec-generator-v4 task "FR-32 coverage join: a task is verified by its covering scenario's result, not
worst-of-feature".

---

## F9 — Stale verdict temp files mislead

**Symptom.** At session start, `.dev-pomogator/.tmp/verdict-{tui,sro}.txt` showed RED for two specs that
were actually GREEN — they were pre-fix snapshots. I re-ran `spec-verdict` to get the truth.

**Class / fix.** Process hygiene (mine). Minor: `spec-verdict` could stamp its output header with a
UTC timestamp + the input sha so a cached file is obviously stale. LOW priority; no spec work-item unless
bundled with F2.

---

## F10 — enforce Bash-guard recurring friction

**Symptom.** Under enforce, engine-CLI must redirect to a non-`.specs` temp (`> file`, never `| tail`),
and `.specs/`-bearing commands are denied unless whitelisted — recurring per-session friction (also the
root of F3's blocked `fix.mjs`).

**Class / fix.** enforce-policy ergonomics. Bundle with F3: expand the engine-CLI carve-out (anchor
tooling) and/or improve the deny message. **Work-item:** folded into F3.

---

## Work plan (prioritised → spec capture)

1. **F1 (HIGH, not mine):** flag to the E-A owner — commit E-A *with* the rewritten `SPECGEN004_149` +
   read-only-door FR. Capture a spec-generator-v4 task so it isn't lost. Until then: one known-red stale
   scenario in the canonical suite (documented here, not a regression of my work).
2. **F2 (MEDIUM):** canonical ndjson clobber-safety — the highest-leverage workflow fix (it silently
   corrupts every coverage read). Spec task in spec-generator-v4.
3. **F5 (MEDIUM):** v1→v2 FILE_CHANGES drift detector — recurs on every migrated spec. Spec task.
4. **F3 + F10 (MEDIUM):** door-routed anchor-fix + enforce-aware gate hint. Spec task.
5. **F4 (LOW):** validate_anchor clarity + heading-slug check. Spec task.
6. **F6 (LOW-MED):** atomic tag-promotion at wire → spec-generator-v4 FR-51 (migrator) task.
7. **F7 / F8 (LOW):** task↔scenario cardinality policy; FR-32 join scoping. Spec tasks/decisions.
8. **F9 (LOW):** verdict-output timestamp — fold into F2 or skip.

**Capture target.** spec-generator-v4 is the dogfood spec for the door/MCP/workflow; F1–F8 become tasks
(and where a new behaviour is required, FRs) there. F3/F4 may also cross-link the anchor-integrity spec.

**Ownership boundary.** F1 is uncommitted E-A work by another session — I will NOT edit the door code or
its scenario; I only record the work-item. Everything else is open workflow/tooling hardening.
