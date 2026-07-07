# Changelog

## 2026-06-24 — FR-14/FR-15: loud token demand

- FR-15: when the smart judge can't run because no помогатор token resolves, the gate now surfaces a CHAT-VISIBLE block reason demanding the token (env vars + endpoint) instead of a stderr-only silence. Fires for all users without a token until connected; bounded by the FR-11 anti-loop release.
- FR-14: documented the judge token priority chain (`CLAIM_GATE_JUDGE_KEY` → `OPENROUTER_API_KEY` → `CLAUDE_MEM_OPENROUTER_API_KEY` → `AUTO_COMMIT_API_KEY` @ aipomogator.ru/go/v1).
- Spec materialised from a 2-doc stub (FR/AC) to a full spec.

## Earlier

- FR-1..FR-13 implemented in `tools/claim-evidence-gate/`; bg-task monitor/escalation moved to `bg-task-guard` (FR-13/FR-16).
