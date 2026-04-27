# Audit Category 7: JIRA_DRIFT

**Conditional:** Только в Jira-mode (`.specs/{slug}/.jira-cache.json` присутствует). Без Jira-mode — категория no-op.

**Что это:** Расхождения между spec artifacts и Jira source — missing trace, scope enumeration gaps, hallucinated FR, visual mismatch, live drift.

## Checks

Агент ОБЯЗАН выполнить cross-check spec artifacts против Jira source:

1. **Missing trace:** Для каждого FR/AC/BDD scenario/TASKS entry — найти `Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_` line. Отсутствие → finding `JIRA_DRIFT / missing_trace` (severity: WARNING). _(Дублирует JIRA_SOURCE_PRESERVED validator для consolidated view в AUDIT_REPORT.md.)_

2. **Scope enumeration gap:** Для каждого `directives[]` с `scope[]` в `.jira-cache.json` — проверить, что **каждый** scope member имеет FR покрытие OR явный `[WAIVED: "{Jira quote}"]` в `## Out of Scope`. Missing enumeration member → `JIRA_DRIFT / scope_gap`.

3. **CRITICAL directive without FR:** Для каждого directive с `severity: CRITICAL` — ОБЯЗАТЕЛЬНО matching FR с `Jira imperative:` соответствующий quote. Missing → `JIRA_DRIFT / missing_trace` severity ERROR (единственный ERROR-level в категории — CRITICAL directive не прощается).

4. **Hallucinated FR:** FR без `Jira imperative:` (в Jira-mode) **И** без явного `[DERIVED: architectural necessity]` markera — `JIRA_DRIFT / hallucinated_fr` severity WARNING (FR не трассируется ни к Jira, ни к явно помеченному derived решению).

5. **Live drift (если MCP доступен):** `checkJiraDrift()` (уже вызван в audit-overview Step 1) — результаты добавить в финальный AUDIT_REPORT категорию JIRA_DRIFT.

6. **Multimodal evidence verify:** Для каждого AC с `Screenshot:` / `Video:` reference — попытаться Read attachment; если success — многомодальный re-check описания AC vs ВИДНО (CONFIRMED/DENIED по правилу `screenshot-driven-verification`). Расхождение → `JIRA_DRIFT / visual_mismatch` severity WARNING.

## Remediation

Для каждого finding:

- Missing trace в FR/AC/BDD/Task → добавить `Jira imperative: "{quote}"` / `Jira acceptance: ...` / `# Jira trace: ...` / `_Jira: ..._` per format в [`jira-mode.md`](jira-mode.md)
- Scope gap → добавить FR для missing member ИЛИ явный `[WAIVED: "{Jira quote}"]` в `## Out of Scope`
- CRITICAL directive без FR → ОБЯЗАТЕЛЬНО создать FR (это ERROR, не WARNING)
- Hallucinated FR → добавить `Jira imperative:` ИЛИ `[DERIVED: architectural necessity {обоснование}]`
- Live drift (новые comments / changed attachments) → пометить spec как `[NEEDS_RESYNC]` и рекомендовать `/jira-intake-resync` skill
- Visual mismatch → re-read AC, исправить описание UI на match с screenshot (CONFIRMED), либо `[EVIDENCE_MISSING: ...]` если file gitignored

## Severity

ERROR — CRITICAL directive без matching FR.
WARNING — все остальные drift findings.

## Связанные правила

- [`jira-mode.md`](jira-mode.md) — full Jira workflow + format Jira trace
- [`validation-rules.md`](validation-rules.md) — `JIRA_SOURCE_PRESERVED`, `JIRA_DRIFT`
