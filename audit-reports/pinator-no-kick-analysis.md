# Why the pinator did NOT kick a premature stop — root-cause analysis (2026-06-25)

> Incident: the message «…**Берусь за них?** Или сначала довести формальную спеку медленным путём —
> скажи, и пойду.» named the next work + handed the go-decision to the user (announce-and-stop), yet
> the claim-evidence-gate did NOT block. Owner: «и хуле пинатор тебя не пинул на вот это?»

## Verdict: the gate was BLIND to the open work (precondition failed) — NOT a weak judge

Evidence chain (each reproduced against the real bundle / real functions this session):

| Hypothesis | Checked | Result |
|---|---|---|
| `stop_hook_active` free pass after the prior block | code lines 209–216 | **ruled out** — the gate deliberately does NOT short-circuit on it (that hole was already closed) |
| self-marker skip (message about the gate) | `SELF_MARKERS=['claim-evidence-gate','deferred-work']`; report #2 contained neither | **ruled out** |
| analysis-only carve-out guarded out the judge | computed `analysisOnly` on the real transcript | **false** (judge NOT guarded) — but see bug #2 |
| judge ran and approved (weak/borderline judge) | ran the judge 6× on report #2's exact text | **6/6 BLOCK** — judge reliably blocks this phrasing |
| **judge precondition `openWork > 0` was false** | computed `openWork` on report #2's transcript | **openWork = 0 → judge NEVER RAN → approve** ✅ ROOT CAUSE |

### The mechanism (FR-9 + the census cache)

The gate only escalates to the judge when `openWork > 0 && GRAY_SIGNAL` (claim_evidence_gate_stop.ts:392).
`openWork = scoped-spec-open + agent-todos`, where:
- `scoped-spec-open` = open tasks of the specs THIS session edited (`sessionEditedSpecSlugs`, transcript-
  derived) **scoped against the task-census CACHE** (`.dev-pomogator/.task-census.json`).
- `agent-todos` = the agent's own TodoWrite/Task open count.

Measured for report #2:
```
editedSlugs = [claude-mem-integration, claim-evidence-gate, spec-mcp-usability-dogfood]   # CORRECT — door edits detected
census cache = 12 specs; edited slugs PRESENT in census = []   # NONE of the 3 are in the snapshot
scoped-spec-open = 0 ; agent-todos = 0  →  openWork = 0
```
The specs I actively edited were **missing from the census snapshot** — `claim-evidence-gate` (stale: not
rebuilt into the cache), `spec-mcp-usability-dogfood` (created THIS session, predates the snapshot),
`claude-mem-integration` (rewritten, not in cache). So the gate believed there was **zero** unfinished
work, its precondition failed, and the judge that would have blocked never ran.

### The deeper problem (the class of bug)

There is a **disconnect between two sources of truth**: «specs the session edited» is LIVE (read from the
transcript), but «open tasks per spec» is a periodic CACHE that lags. A session doing FRESH spec work — the
exact case most prone to a premature stop — edits specs that aren't in the cache yet, so the gate is blind
precisely when it's most needed. (Mirrors the repo's own `verify-against-real-artifact` lesson: a cache/
snapshot that lags the producer.)

## Secondary bug found along the way

`lastUserPrompt` returned the **gate's OWN block message** («Нужно: реальный прогон…») as the «user
request», feeding `analysisOnly`. The Stop-hook block feedback is being treated as a user turn — the gate's
output pollutes its own user-intent signal. It didn't change this outcome (the judge never ran anyway), but
it can flip `analysisOnly` wrongly in other cases. Worth a separate fix + a stripping test.

## Fixes (implemented 2026-06-25, owner: «всегда когда есть блок дальше надо пропускать на судью … фикси остальное, покрывай тестами»)

1. **DONE — FR-17: a «Дальше:» block ALWAYS arms the judge** (the load-bearing fix). Pure `isJudgeArmed`
   (`meridian-judge.ts`) escalates on `NEXT_SECTION_RE` INDEPENDENT of `openWork` AND `analysisOnly`, so the
   census lag can't keep the judge asleep. The judge's own carve-outs still APPROVE a legit report-stop.
   Proven: unit 7/7 both directions; controlled e2e at openWork=0 → **BLOCK via judge**; legit «Дальше:»
   report-stop → **APPROVE** (no over-fire). Tests: CEGATE001_19/20/21 + judge-bench `next-block-*`.
2. **DONE — FR-18: `lastUserPrompt` skips a whole Stop-hook feedback message** (first line = ⚠️/📋/«Stop
   hook feedback» marker), so a multi-line block reason no longer leaks its continuation as the «user
   request». Proven: real snapshot now returns the actual prompt («жадбще»), synthetic returns the real
   prompt. Test: CEGATE001_38. (Structural — reuses `HOOK_INJECTION_RE`, not the gate's prose.)
3. **DONE — FR-19: arm openWork from the LIVE spec, not only the cache.** `liveOpenForUncensusedSlugs`
   (`task-census.ts`) counts open tasks of session-edited slugs missing from the census by reading TASKS.md
   directly (top-level `- [ ]`, excluding placeholders/sub-items; fail-open, no hot-path rebuild). Proven:
   on this very session `openWork` went **0 → 4** (the smoking-gun number is now correct). Test:
   CEGATE001_39 (2/0/0). Fixes the root cause directly; FR-17 stays load-bearing for «Дальше» stops.

Bundle rebuilt (`npm run build:claim-gate`, 58.5kb) with FR-17 + FR-18 + FR-19 — the live hook carries all three.

## SECOND incident (2026-06-25, same session): a report NAMING the gate gets a free stop

Owner: «почему тут нет секции дальше? это снова баг». After the three fixes above, a status report ended with
open work (openWork=4 via FR-19) and NO «Дальше:» section — the no-next-section check should have demanded
one, but the gate APPROVED silently (no fires entry, marker unchanged).

**Root cause — the early SELF-REFERENCE skip is too broad.** Line 228:
`if (!claimText.trim() || SELF_MARKERS.some((m) => claimText.includes(m))) return approve();`
with `SELF_MARKERS = ['claim-evidence-gate', 'deferred-work']` (line 62). The report contained the line
«Всё в … + спека `claim-evidence-gate`» → `claimText.includes('claim-evidence-gate')` → **`return approve()`
BEFORE any evaluation** (no-next-section / judge / openWork all skipped). ANY work report that names the gate
or its spec/file by name gets a FREE STOP.

**Proof (this session):** `claimText.includes('claim-evidence-gate') === true`; the live bundle on that exact
truncated transcript → `{}` (approve) with the no-next-section debug NEVER logging (the block was never
reached); fires log has no entry for it. This is the **same class** as the 2026-06-17 removal of the
`пинатор`/`ДОДЕЛЫВАЙ` markers («granted a FREE STOP to ANY message merely mentioning the kicker») — the
remaining offender is the gate's own NAME `claim-evidence-gate`, which appears in every report ABOUT the gate.

**FR-20 — DONE (owner «выпиливай эту хуйню»):** the broad name-based self-skip was REMOVED — `SELF_MARKERS`
and the `claimText.includes(...)` short-circuit at line 228 are gone (kept: `!claimText.trim()` and the
`SELF_MARKER` block-reason prefix). A report ABOUT the gate is now evaluated like any other; the judge's
answer/meta carve-out + the classifier's standalone-claim guard handle genuine meta-discussion without a
blanket name-skip. **Proven (this session):** (1) a works-done claim naming `claim-evidence-gate` with NO
executor → BLOCK (was a free approve); (2) the same claim backed by a real run → APPROVE (no false block);
(3) the exact incident report → BLOCK (no-next-section, openWork=4 via FR-19). Test: CEGATE001_40. Spec:
`.specs/claim-evidence-gate/FR.md` FR-20.

## Reproduction (all run this session)

- `node tools/.../claim_evidence_gate_stop.bundle.mjs` on report #2's transcript → `{}` (approve).
- judge 6×6 BLOCK on the same text with `openTasks:25` (deterministic).
- `sessionEditedSpecSlugs` + `scopeCensusToSlugs` → `openWork = 0` (the smoking gun).
