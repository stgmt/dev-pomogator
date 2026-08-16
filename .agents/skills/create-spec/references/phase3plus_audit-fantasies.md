# Audit Category 5: ФАНТАЗИИ (Fantasies)

**Что это:** Непроверенные допущения об API, утверждения без источников/пруфов, capabilities выдуманные без верификации.

## Checks

1. Проверить RESEARCH.md — все ли утверждения об API имеют источник (URL, файл, тест, документация)
2. Проверить DESIGN.md — нет ли API endpoints/методов, помеченных как "работает" без пруфа
3. Проверить нет ли утверждений "API поддерживает X" / "метод возвращает Y" без верификации через live API или тесты

## Remediation

Для каждого finding:

- Untested claim → добавить `[UNVERIFIED]` маркер; добавить task в TASKS.md "Live API verification of X"
- API claim без источника → добавить URL/PR/commit reference ИЛИ пометить `[UNVERIFIED]`
- Hallucinated method (не существует в реальном API) → удалить упоминание или заменить на документированный
- Capability claim без теста → пометить `[UNVERIFIED]` + добавить BDD сценарий который реально это проверит

## Severity

WARNING — claim без источника.
ERROR — hallucinated method (API метод фактически не существует).

## Связанные правила

- [`validation-rules.md`](validation-rules.md) — `UNVERIFIED_CONFIG` (для env vars)
- `research-workflow` (standalone skill `.claude/skills/research-workflow/SKILL.md`) — для верификации utility hypotheses
