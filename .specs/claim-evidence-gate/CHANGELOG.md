# Changelog

## 2026-07-18 — FR-32..FR-34: flag-less async agents of the new harness

- Incident (lm-saas transcript `0704ee11`): the agent validly awaited 4 collector sub-agents, the gate kicked it. Root cause: newer Claude Code launches `Agent`/`Task` WITHOUT a `run_in_background` field (async by default), and every bg-wait detector filtered on `run_in_background === true` → `awaitingAsync=false` → the judge saw a false «no pending background task» fact.
- FR-32: `agentBgInFlightCount` now counts flag-less Agent/Task launches; a launch-ACK never clears; a non-ACK tool_result with the same id clears (old sync-mode compat, so the gate is never permanently disarmed).
- FR-33: `SendMessage` (resuming a spawned agent) now counts as awaiting until its task-notification lands.
- FR-34: `AWAITS_RESULT_RE` widened to «жду отчёты…, затем свожу анализ» report-waiting phrasings (only meaningful while `awaitingAsync=true`).
- FR-12 status corrected: DEFERRED → DONE since 2026-06-21 (spawn↔completion id-pairing had been implemented but the spec was never updated — which is why this regression had no spec-level tripwire).

## 2026-06-24 — FR-14/FR-15: loud token demand

- FR-15: when the smart judge can't run because no помогатор token resolves, the gate now surfaces a CHAT-VISIBLE block reason demanding the token (env vars + endpoint) instead of a stderr-only silence. Fires for all users without a token until connected; bounded by the FR-11 anti-loop release.
- FR-14: documented the judge token priority chain (`CLAIM_GATE_JUDGE_KEY` → `OPENROUTER_API_KEY` → `CLAUDE_MEM_OPENROUTER_API_KEY` → `AUTO_COMMIT_API_KEY` @ aipomogator.ru/go/v1).
- Spec materialised from a 2-doc stub (FR/AC) to a full spec.

## Earlier

- FR-1..FR-13 implemented in `tools/claim-evidence-gate/`; bg-task monitor/escalation moved to `bg-task-guard` (FR-13/FR-16).
