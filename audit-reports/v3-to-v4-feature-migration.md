# v3 → v4 feature migration — analysis & adaptation report

**Date:** 2026-06-11
**Scope:** mine the v3-era spec-generator surfaces (`spec-generator-v3`, `tools/specs-generator/`, `tools/anchor-integrity/`) for capabilities `spec-generator-v4` needs; classify each as **preserved / superseded / drifted / real-bug**; recommend concrete v4 adaptations.
**Method:** read the v3 BDD contract (`.specs/archive/legacy-v3.feature`, 28 scenarios), the v3 tool inventory, and v4 FR-19/FR-20/FR-34; cross-check against the 3 v3-era test files that fail on `main` (drift signals). All claims are evidence-backed by file path + the failing-assertion text from the full Docker suite run (`fullsuite2.log`).

---

## 1. v3 feature catalog (from `legacy-v3.feature`, 28 scenarios)

| v3 @feature | Capability | Scenarios |
|-------------|-----------|-----------|
| @feature4 | **5 form-guards** (PreToolUse, exit 2 on violation): user-story (Priority + Why + Independent Test + Acceptance), task (Done When + ≥1 checkbox), design-decision (Decision ⇒ Alternatives), requirements-chk (CHK ⇒ Verification Method + FR linkage), risk-assessment (≥2 rows). Guards ignore `Read`. | _01–_14, _22 |
| @feature5 | **Migration safety + fail-open**: v1/v2 spec (no `progress.json` version) passes unchecked → `ALLOW_AFTER_MIGRATION`; malformed stdin / regex exception → exit 0 + `PARSER_CRASH` log. | _04, _15, _18, _23 |
| @feature1 | **Child skills** (discovery-forms, requirements-chk-matrix) + Jira-imperative byte-preservation + child skills do NOT auto-trigger on NL prompts. | _16, _21, _24 |
| @feature3 | **task-board-forms** skill + `spec-status.ts -Format task-table` (markdown table, idempotent). | _17, _19, _20 |
| @feature7 | **meta-guard**: denies removing a form-guard from `extension.json`; allows adding unrelated hooks. | _25, _26 |
| @feature8 | **audit-logger**: append-only `form-guards.log` (ISO-8601 `Z` lines) + **UserPromptSubmit 24h summary** `📊 Form guards (24h): N DENY / N PARSER_CRASH / N ALLOW_AFTER_MIGRATION`. | _27, _28 |

## 2. v3 tool inventory & v4 status

`tools/specs-generator/` is a **mixed tree** — it carries BOTH v3-era CLIs and v4 engines (v4 reuses, it didn't fork):

| Tool | Era | v4 status |
|------|-----|-----------|
| `validate-spec.ts`, `audit-spec.ts`, `spec-status.ts`, `scaffold-spec.ts`, `fill-template.ts` | v3 | **Reused** — v4 `spec-verdict.ts` composes validate + audit; spec-status is FR-21's task-table CLI contract. |
| `analyze-features.ts` | v3 | **DRIFTED** (see §3.2). |
| `spec-verdict.ts`, `legacy-triage.ts`, `legacy-judge.ts`, `list-specs.ts`, `variant-matrix/`, `architecture-decision/` | v4 | New v4 engines. |
| `tools/anchor-integrity/` (`check.mjs`, `fix.mjs`, `marksman-slug.mjs`, `anchor_gate_stop.ts`, `claude-fallback.mjs`) | v3-origin | **Preserved as v4 FR-34** (anchor-integrity guard + auto-fix). |

## 3. The three drift signals (v3-era tests failing on `main`)

These are NOT a single regression — they are three distinct v3→v4 stories. Evidence = the failing assertions.

### 3.1 `spec-generator-v3.test.ts` SPECGEN003_28 — **SUPERSEDED**
- **Fails:** `expected '📊 Spec conformance: 3 unresolved DEN…' to match /Form guards \(24h\)/`.
- **Cause:** v4 **FR-20** (author-facing conformance summary at prompt time) took over the SAME UserPromptSubmit slot the v3 `📊 Form guards (24h)` summary occupied. The v3 summary string is gone; the v3 test still asserts it.
- **Classification:** v3 feature SUPERSEDED by FR-20. The 24h *form-guards* roll-up is no longer surfaced — only the v4 conformance roll-up is.
- **Recommendation:** **retire/adapt SPECGEN003_28** (it pins a superseded contract — a false-RED). IF the per-event form-guards 24h counts (DENY / PARSER_CRASH / ALLOW_AFTER_MIGRATION) still carry value, **adapt** them as an additional line inside the FR-20 summary rather than a competing hook. Decision belongs in FR-20's scope, not a silent test failure.

### 3.2 `specs-generator.test.ts` PLUGIN006 analyze-features (5 tests) — **DRIFTED**
- **Fails:** `TypeError: Cannot read properties of undefined (reading 'totalFeatures')` — the tool's JSON no longer carries `totalFeatures` (or it errors before emitting JSON).
- **Cause:** `analyze-features.ts` output contract drifted away from what PLUGIN006 expects (`{totalFeatures, stepDictionary, namingPatterns}` + `-DomainCode` / `-FeatureSlug` filters).
- **Classification:** v3 tool with a DRIFTED producer contract. Open question v4 must answer: **is `analyze-features` still a live v4 consumer, or is it superseded by the spec-graph** (`get_coverage` / `find_by_tags` already enumerate scenarios by `@featureN`)?
- **Recommendation:** run `runtime-dogfood` on `analyze-features.ts` against the real corpus. If a live v4 path consumes it → **fix the output shape + re-pin fixtures** (`verify-against-real-artifact`). If nothing consumes it → **retire the tool + its tests** (dead-integration). Do NOT leave it as a silent RED.

### 3.3 `anchor-integrity/templates.test.ts` — **REAL v4 BUG**
- **Fails:** `FR.md:36 [UC-5] #uc-5-название (ambiguous): expected […(2)] to deeply equal []` — a scaffold **template** (`FR.md.template`) emits a link `[UC-5](#uc-5-название)` whose GLFM slug resolves to **2** headings.
- **Cause:** the FR-34 anchor-integrity guard is doing its job — it caught a genuinely broken/ambiguous anchor that the v4 scaffold templates ship. This is the v3-origin anchor capability correctly guarding v4 output.
- **Classification:** real v4 defect (not drift, not superseded). The guard works; the template is wrong.
- **Root cause (driven, not guessed — `checkLinks` on the template set):** exactly 2 broken anchors — `FR.md.template:29` `[UC-4]` and `:36` `[UC-5]` link to `USE_CASES.md#uc-4-название` / `#uc-5-название`, but `USE_CASES.md.template` defined only UC-1/2/3 (`currentSlug: null` — no target heading). FR.md.template scaffolds FR-1..FR-5 each linking UC-1..UC-5; USE_CASES lagged at 3.
- **Resolution — DONE (this report's commit):** added UC-4 + UC-5 blocks to `USE_CASES.md.template`; re-ran `checkLinks` → **0 broken**. The `anchor-integrity/templates.test.ts` RED is closed.

## 4. What v4 already inherited (no action — preserved correctly)

- **Form-guards (5) + meta-guard** → v4 **FR-19 SOFT TIER** (fail-open + `form-guards.log`, "preserved verbatim from v3 FR-10"), hardened by the new HARD TIER (`spec-conformance-guard`, FR-5).
- **Child skills** (discovery-forms, task-board-forms, requirements-chk-matrix) → still live skills, invoked by `create-spec` phases.
- **`spec-status -Format task-table`** → v4 **FR-21** (backward-compat contract).
- **Anchor-integrity** → v4 **FR-34**.

## 5. Adaptation backlog for v4 (the "take what we need" list)

| # | Item | Action | Owner FR | Size | Status |
|---|------|--------|----------|------|--------|
| A1 | v3 form-guards 24h summary | Decide: retire SPECGEN003_28 OR fold the 3 counts into the FR-20 summary line | FR-20 | S | open |
| A2 | `analyze-features.ts` drift | runtime-dogfood → fix-shape-and-repin OR retire tool+tests | FR-31/FR-21 area | M | open |
| A3 | scaffold template UC-4/UC-5 broken anchors | added UC-4+UC-5 to `USE_CASES.md.template` → `checkLinks` 0 broken | FR-34 | S | **DONE** |

These three close the 3 false/real REDs the full suite carries, and they are the only v3 capabilities not already cleanly inherited by v4. Everything else in the v3 catalog (§1) is preserved (§4).

---

**Verification note (honesty gate):** the 3 failing assertions were read verbatim from `fullsuite2.log`; the v3 catalog from `legacy-v3.feature` via the MCP read door; FR-19/FR-20/FR-34 mapping from the v4 FR.md via the read door. No claim here rests on an exit code — each rests on a named file + assertion.
