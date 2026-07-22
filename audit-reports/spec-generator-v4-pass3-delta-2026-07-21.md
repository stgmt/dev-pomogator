# spec-generator-v4 — audit Pass 3 delta (2026-07-21)

**Auditor:** strict spec-conformance (third independent session today) · **Branch:** `feat/spec-generator-v4-release-prep`
**Scope:** delta over the two same-day reports — `spec-generator-v4-conformance-2026-07-21.md` (Pass 1) and `spec-generator-v4-verdict-pass-2026-07-21.md` (Pass 2). Both read; neither edited (shared tree).
**Method:** `spec-verdict.ts --no-semantic` (GRAPH_GREEN / OVERALL NOT_READY — independently reproduced, exit 1) + cucumber envelope parse of `.test-results.ndjson` (32,141 messages, 537 pickles, 522 testCaseStarted) + `.feature` tag walk + cucumber profile inspection. MCP door permission-denied here too; CLI chain compensates.

Pass 2's verdict, lane scorecard, N1 (50-task list), N2–N5 **confirmed in full** — my measurements match. This delta adds 2 new defects, 1 correction, and 1 precision.

---

## ❌ CORRECTION of Pass 2 release-blocker #1 — the 15 `not_run` are a PERSISTENT gap, not a full-run artifact

Pass 2 claims: «полный прогон `scripts/docker-bdd.sh` … закроет 15 not_run». **False.** Evidence:

1. `cucumber.json:54` and `cucumber.docker.json:54` — BOTH profiles: `"tags": "not @wip and not @manual and not @windows-only and not @e2e"`.
2. All 15 never-started scenarios are exactly the 15 `@wip`-tagged ones (verified per-scenario in `.feature`):
   - `SPECGEN004_520–525` (`@feature60` — door: section-targeted append / `read_for_edit` / diagnostics / multi-doc proposal / CAS auto-rebase / domain helpers)
   - `SPECGEN004_554–561` (`@feature62/63/64` — release track: WSL-root precheck, precheck MCP+verdict inventory, full-run evidence taxonomy, AC readiness lanes, conformance evidence classes, Docker-only inventory, deps-absent launcher, release-candidate control)
   - `SPECGEN004_553` (line-3482 duplicate — see NEW-1)
3. The recorded run in `.test-results.ndjson` already started 522 scenarios (a full-sized run) — the 15 `@wip` were never started there either. The verdict's own NOT_RUN note names this exact case: «A feature absent from the test config … is a PERSISTENT gap a full run won't close».

**Consequence:** FR-60, FR-62, FR-63, FR-64 ship as spec content with **zero execution evidence by construction**. A full `docker-bdd.sh` run canonicalizes `_52/_372` (see PRECISION) but does NOT touch the 15. To clear EXECUTION RED they must be untagged+implemented+green, retired, or the FRs marked `[OUT_OF_SCOPE]` — a product decision, not a test-ops one.

## 🆕 NEW-1 — CONFIRMED 🔴 duplicate slug-id `SPECGEN004_553` (two different scenarios, one id)

`spec-generator-v4.feature:1006` — «mutation validation gates only debt introduced by the candidate edit» (`@FR-40`, executed)
`spec-generator-v4.feature:3482` — «inherited, closed, and noninteractive stdin root handoff is deterministic» (`@wip`, never started)

Graph map dedup is last-writer-wins → one scenario is silently dropped from traceability (the corpus-health disease class, here inside a single feature — Pass-1/Pass-2 counted 521 scenarios without noticing the id collision). Also corrupts any slug-id-keyed coverage rollup for both.
**Fix:** renumber the line-3482 scenario to the next free id, re-tag, re-run.

## 🆕 NEW-2 — precision evidence for the 2 canonical failures (assertion messages)

Pass 2 named the failing ids; the envelope stream gives the assertions, pinpointing what the fixes had to address:

- `SPECGEN004_52`: `AssertionError: hooks.json must declare the spec-conformance-guard hook` — the «additive, nothing dropped» scenario caught a hook dropped from the static plugin manifest during the #124 hook-service-registry migration (cross-confirms Pass-1 D3: the same hook is described in DESIGN at the dead `extensions/` path).
- `SPECGEN004_372`: `Registry-parity snapshot is stale: live=[] snap=[anchor_gate_stop, answer_simple_stop, auto-ingest-hook, auto_commit_stop, capture --event Stop, claim_evidence_gate_stop, dedup_stop, prompt_suggest_stop, simplify_stop, stop-guard, subagent_watchdog --event Stop, test-spec-gate, test_quality_gate_stop]` — live resolved **empty**: Stop hooks moved into the hook-service registry but the parity-check source + `settings-hooks.snapshot.json` were not reconciled.

## ⚠️ PRECISION — `_52/_372` are stale-canonical, not live failures

Today's filtered run `1784649138074-filtered` (15:52 UTC) selected exactly `_228 _229 _230 _231 _232 _372 _52` and went **7 passed / 0 non-passed** — i.e. the fixes for both assertions (commits `dfc0ceae`, `6e3e00b6`) are in the tree and proven at filtered scope. The 2 failures persist only in the canonical rollup, which by the FILTERED_PROOF contract does not change without a full run or accepted attachment. So Pass-2 blocker #1 is correct for `_52/_372` (full run canonicalizes them) — it is wrong only about the 15 `@wip` (see CORRECTION).

---

## Updated release gate (supersedes prior gate lists)

**BLOCK.** In priority:
1. Full `scripts/docker-bdd.sh` run (NOT on host — `no-host-bdd-runs`) → canonicalizes `_52/_372` as passed. Does NOT close the 15 `not_run`.
2. **Product decision on the 15 `@wip`** (FR-60/62/63/64): untag + implement + green, retire, or `[OUT_OF_SCOPE]`. Without it EXECUTION stays RED forever.
3. Renumber duplicate `SPECGEN004_553` (NEW-1).
4. TASK_TRUTH: 50 DONE-but-unverified / 45 unchecked Done-When (Pass-2 N1 list) — wire evidence or demote status.
5. Pass-1 D2 (dead `NEEDS_HUMAN_REVIEW_PACKET.md` links), D1/N5 (README counts + evidence line), D3 (`extensions/`→`tools/` in forward-looking docs), D6 (224× `fr-N`), and Pass-2 N4 (FILE_CHANGES glob + foreign-spec `.specs/pomogator-doctor/*.md`).
6. SEMANTIC lane: skipped ≠ cleared (FR-37c) — re-run once a claude binary is available.

**Honest limits:** MCP door denied (3rd session in a row — worth a permission-policy look); SEMANTIC unmeasured; the exact entities behind `TASK_STARTED_WITHOUT_CHAIN:1` / `TAG_BULK_SUSPECT:2` remain unidentified (door-dependent).
