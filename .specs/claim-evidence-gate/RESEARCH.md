# Research

## Project Context & Constraints

> Skipped: brownfield — хук в устоявшейся подсистеме `tools/claim-evidence-gate/`; стек и контракт фиксированы (Node builtins, esbuild-бандл, Stop-hook JSON `{decision,reason}`, env `CLAIM_GATE_ENABLED`/токены). FR-15 — локальная правка поведения no-token ветки, без новой архитектуры и без новых зависимостей.

## Инцидент-основание FR-15 (2026-06-24)

Пинатор не дожал спихивание «что дальше — чинить X или коммит?» — владелец пинал руками. Разбор по уликам:

- **Токена судьи нет** — вся цепочка приоритетов пуста (`CLAIM_GATE_JUDGE_KEY`/`OPENROUTER_API_KEY`/`CLAUDE_MEM_OPENROUTER_API_KEY`/`AUTO_COMMIT_API_KEY`) [cmd:env-probe → all empty]. → `resolveEndpoint()===null` → ИИ-судья не запускается [ref:tools/claim-evidence-gate/meridian-judge.ts:148].
- **Причина «нет судьи» уходит в stderr, не в чат** [ref:tools/claim-evidence-gate/claim_evidence_gate_stop.ts:378] — юзер её не видит.
- **Требования «подключи токен» в чат в коде НЕ было** — grep по гейту: только stderr-лог + generic block в узкой ветке.
- Гейт при этом ЖИВ — `.claim-evidence-gate-fires.jsonl` содержит срабатывания этой сессии (бандл рабочий).

Вывод: у любого юзера без токена умный судья тихо выключен и никто не узнаёт про токен. FR-15 переносит «почему» в видимый block-reason + явно требует подключить токен.

## Источники / Пруфы

- Приоритет токена + endpoint [ref:tools/claim-evidence-gate/meridian-judge.ts:115].
- «judgeStop logs WHY to stderr» [ref:tools/claim-evidence-gate/claim_evidence_gate_stop.ts:378].
- Лог срабатываний [cmd:tail .dev-pomogator/.claim-evidence-gate-fires.jsonl → 3 fires, mode=true].
- Долгие задачи/эскалация уже в bg-task-guard (не дублировать) [ref:.specs/bg-task-guard/FR.md].
