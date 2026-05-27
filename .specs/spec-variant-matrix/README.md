# Spec Variant Matrix

**Status: shipped 0.1.0 — 2026-05-23.** specs-workflow plugin v1.19.0 wires `Skill("variant-matrix-build")` в create-spec Phase 2 step 4c + audit category VARIANT_COVERAGE блокирует STOP #3. См. [CHANGELOG.md](CHANGELOG.md).

Universal prevention механизм для класса факапов "shared pipeline + polymorphic dispatch + per-variant coverage gap" при составлении спеки. Триггер — incident Stocktaking MR / Warehouse Transfer (QA Лилия 2026-04-27): `formData.warehouseId || undefined` silently degraded для одного из 7 доктайпов потому что spec не enforce-ил variant matrix в тасках и тестах.

## Ключевые идеи

- **Detection mechanically (regex), no LLM** — закрытый список polymorphism axis nouns + threshold-2 trigger phrases (mitigation H2 risk).
- **Hard-OUT signals для anti-over-application** — single-incident rules не должны generalize aggressively (mitigation H1 risk).
- **Variant matrix в трёх артефактах** — AC Decision Table + Gherkin Scenario Outline + Examples + per-variant tasks в TASKS.md (8th audit category VARIANT_COVERAGE blocks STOP #3 если incomplete).
- **Escape hatch с audit trail** — `[skip-variant-matrix: reason ≥8 chars]` + JSONL log (mitigation H3 gaming risk).
- **Universal (не warehouse-specific)** — applicable к HTTP middleware, event handlers, plugin lifecycle, i18n, multi-tenant, OS-specific, DB adapters, ролям, feature flags, API versions, payment methods, notification channels.

## Где лежит реализация

- **App-код**: `tools/specs-generator/variant-matrix/`
- **Skill**: `extensions/specs-workflow/.claude/skills/variant-matrix-build/`
- **Rules**: `.claude/rules/specs-workflow/variant-matrix/`
- **Wiring**: `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (commandAuditSpec ~line 1611, categoryCount ~line 2676)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
