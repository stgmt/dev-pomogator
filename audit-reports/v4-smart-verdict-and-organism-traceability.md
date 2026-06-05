# v4: the verdict must be SMART-authoritative, and the corpus must trace as ONE organism (cell→atom)

**Trigger:** I ran the *structural* `validate-spec` (0 errors) and reported "spec valid" — false green.
The user's demand: v4 must REQUIRE that the health verdict comes from SMART semantic/graph analysis,
not a dumb structural pass; and ALL specs must be one traceable organism — from FR down to the atom
(task / code line / test result), across every spec, not per-spec. "Whose debt it is" is irrelevant —
it lives in the v4 spec, so it's in scope. This is the evidence + the fix.

## 1. Evidence (all measured this session, not asserted)

| # | Probe | Result | Meaning |
|---|-------|--------|---------|
| A | grep FR.md for semantic/LLM | **FR-8 LLM-as-judge semantic drift EXISTS but is opt-in, default OFF** (`FR.md:121`); the `full` semantic skill mode is opt-in too (`FR.md:258`) | The smart layer is built — but it does NOT gate. The dumb structural check is what runs + gets trusted. |
| B | `validate-spec` v4 | `files_with_errors: 0`, 19 warnings, 173 placeholders | "Valid" = formatting + links only. This is the false-green I reported. |
| C | `audit-spec` v4 | **10 P0 ERROR** — real nature: 1× FR-1 missing AC-link **+ 9× FILE_CHANGES pointing at deleted `extensions/…` / `dist/installer/…` paths** (NOT "FR without AC" — I misreported that earlier) | The structural validator is blind to logic the audit catches. |
| D | `conformance_check` (smart graph, awaited) | **1256 findings**: 1243 `UNTAGGED_SCENARIO`, 11 `UNCOVERED_FR`, 2 `TASK_UNTESTED`; 133 touch spec-generator-v4 | The smart layer SEES the debt the structural one can't. 1243 scenarios are not tagged up to any requirement = loose atoms. |
| E | grep v4 `FILE_CHANGES.md` | **58 stale `extensions/` + `dist/installer` paths** in v4's own FILE_CHANGES | Concrete in-scope debt: the spec references files the canonical-plugin migration deleted. |
| F | repo `specs-validator` hook | **32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP** (corpus-wide) | The organism has 75 dangling atoms + 32 uncovered + 9 specs stuck mid-workflow. |
| G | FR-36 dogfood (this session) | bare-id collision: 46 specs' `FR-2` → 47 nodes (~470 expected); `AC-36` from `pomogator-doctor` leaked into v4's FR-36 trace | You CANNOT trace the corpus as one organism while ids collide across cells. FR-36 is the precondition. |

## 2. Diagnosis — the organism is sick at three levels

1. **Wrong authority (the "dumb verdict" complaint).** v4 has a semantic layer (FR-8 LLM-judge, the
   `full` skill mode, `conformance_check`, `get_coverage` honesty gate, `audit-spec`) — but NOTHING
   makes it the canonical verdict. `validate-spec`'s structural "valid" is reportable and was trusted.
   There is no requirement: *"structural-pass alone is NEVER the health verdict."*
2. **Broken connective tissue (FR-36).** Bare-id collision means cross-spec edges can't resolve →
   the corpus physically cannot be one graph. The 1243 untagged + 75 orphan are partly collision-noise,
   partly real — you can't even measure cleanly until composite ids (FR-36) land.
3. **Loose atoms.** 1243 untagged scenarios, 58 stale FILE_CHANGES paths (→ 9 of the 10 P0), 11
   uncovered FRs, 9 unconfirmed STOPs — molecules/atoms not bound up to the organism.

## 3. The cell→atom traceability model (the user's framing, made concrete)

| Biology | Spec-graph | "Healthy" invariant |
|---------|-----------|---------------------|
| organism | the whole `.specs/` corpus (ONE graph) | every node reachable from the corpus root via edges |
| cell | a spec (`.specs/<slug>/`) | unique-keyed (FR-36), no collision-drop |
| organelle | FR | has ≥1 AC **and** ≥1 Scenario **and** ≥1 Task (no `UNCOVERED_FR`) |
| molecule | AC / Scenario | every Scenario tagged → its FR (no `UNTAGGED_SCENARIO`); every AC ← its FR |
| atom | Task / code-impl / test-result line | every Task has a real test (no `TASK_UNTESTED`); every FILE_CHANGES path exists (no stale `extensions/`) |

**The verdict** = graph reachability (no orphan atom) + semantic conformance (FR-8 on) + coverage
honesty (FR-32) across ALL specs — NOT one cell's formatting. "Structurally valid" must never be
printable as "clean/done."

## 4. Prescription — change spec + scripts + skills, then verify

### Spec (v4) — make it a REQUIREMENT
- **NEW FR-37: "Smart verdict is authoritative + full cell→atom traceability is a hard gate."**
  - The canonical spec-health verdict SHALL be the smart graph analysis (`conformance_check` +
    `get_coverage` + `audit-spec` + a new traceability-completeness check) over the ONE graph (FR-36),
    default-ON. `validate-spec` (structural) is a pre-filter only — its pass SHALL NOT be reportable
    as "valid/clean/done."
  - Traceability gate: 0 stale FILE_CHANGES paths, 0 `UNCOVERED_FR`, 0 `TASK_UNTESTED`, and every
    Scenario tagged → FR (drive `UNTAGGED_SCENARIO` to 0 within v4, measured for the corpus).
  - FR-8 semantic check SHALL be ON in the verdict path (not opt-in) when a `claude` binary is present;
    absent → degrade with an explicit "semantic SKIPPED" note, never a silent "no drift."
- **Fix the 58 stale `extensions/`/`dist/installer` paths** in v4 `FILE_CHANGES.md` (closes 9 P0 +
  part of the 75 ORPHAN).

### Scripts
- `spec-status` / the health entrypoint: verdict = conformance + coverage + audit + traceability-
  completeness across all specs; demote `validate-spec` to a structural pre-filter that cannot emit
  "valid."
- Add a **traceability-completeness** check (the §3 invariants) emitting an actionable gap list.
- Flip FR-8 semantic default to ON-when-binary-present in the verdict path.
- Stale FILE_CHANGES path → hard ERROR in the authoritative verdict (it already is in `audit-spec`;
  wire `audit-spec` into the verdict so it can't be bypassed by reading `validate-spec` alone).

### Skills
- `spec-status` / `spec-mcp-dogfood` / `runtime-dogfood` / `suite-failure-triage`: FORBIDDEN to report
  "valid/clean" off `validate-spec` alone — must cite the smart verdict (conformance/coverage/audit).
  This is exactly the mistake I made → encode it as a skill guard + a rule.

## 5. Sequencing (this is "доделать и проверить", multi-step)
1. Land FR-36 (done — composite ids; the connective tissue). 
2. Add FR-37 (this requirement) to the v4 spec + fix the 58 stale paths.
3. Implement the script/skill changes as FR-37 tasks (Phase 14), each verified against the real graph
   (dogfood before/after: UNCOVERED_FR→0, stale-paths→0, UNTAGGED within v4→0), suite green each step.
4. Re-run the authoritative verdict → it must read RED until the gates pass, then GREEN — and GREEN now
   MEANS the organism traces cell→atom, not "the formatting is fine."

**Bottom line:** the dumb "valid" was a real defect, not just my phrasing. v4 already owns the smart
machinery; it just never made it the boss. FR-37 makes the smart verdict authoritative and full
traceability a gate; the 58 stale paths + 1243 untagged + 11 uncovered are the measured debt to drive
to zero under it.
