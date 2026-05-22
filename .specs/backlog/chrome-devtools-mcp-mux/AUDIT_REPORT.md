# Audit Report — chrome-devtools-mcp-mux

**Date:** 2026-04-28
**Audit tool:** `audit-spec.ts -Path .specs/chrome-devtools-mcp-mux`
**Phase:** 3+ Audit (post Finalization)

## Summary

| Category | Initial | After Remediation | Open |
|----------|---------|-------------------|------|
| ERRORS | 6 | 0 | 0 |
| LOGIC_GAPS | 11 | 0 | 0 |
| INCONSISTENCY | 6 | 0 | 0 |
| RUDIMENTS | 0 | 0 | 0 |
| FANTASIES | 7 | 7 | 0 (rejected — see below) |

## Remediated findings

### ERRORS

| Finding | Action | Result |
|---------|--------|--------|
| `src/installer/types.ts` action=edit but file does not exist | Изменили target на `src/updater/github.ts` (актуальное location `ExtensionManifest` interface, проверено через `grep -rn "interface.*Manifest" src/`) в FILE_CHANGES.md и TASKS.md `task-mcp-config-types` | ✅ Resolved |
| FR-2 / FR-4 / FR-5 / FR-6 / FR-8 plain text в TASKS.md (не markdown links) | Конвертированы в `[FR-N](FR.md#fr-n-...)` format во всех `_Requirements:_` блоках | ✅ Resolved |

### LOGIC_GAPS

| Finding | Action | Result |
|---------|--------|--------|
| @feature1..@feature8 присутствуют в `.feature` но отсутствовали в USE_CASES.md / USER_STORIES.md | Добавлены теги к 7 UC + US-6 расширен @feature6 @feature7 @feature8 | ✅ Resolved |
| BDD_HOOKS_COVERAGE: DESIGN.md упоминает TEST_DATA_ACTIVE но без `**Classification:**` поля | Добавили `**Classification:** TEST_DATA_ACTIVE` рядом с `**TEST_DATA:** TEST_DATA_ACTIVE` (validate-spec требует TEST_DATA, audit-spec — Classification; spec удовлетворяет обе версии) | ✅ Resolved |

### INCONSISTENCY

| Finding | Action | Result |
|---------|--------|--------|
| Term variants `afterEach` / `AfterEach` в DESIGN.md | Стандартизировано к `afterEach` (vitest convention) везде в DESIGN.md | ✅ Resolved |

## Rejected findings — FANTASIES (UNVERIFIED_CONFIG, all INFO severity)

Все 7 FANTASIES — false positives. Audit-tool применяет UNVERIFIED_CONFIG check к идентификаторам `[A-Z][A-Z_]+` matching env-var-style naming, но в данной спеке такие токены — **не env vars**:

| Token | Что это на самом деле | Why audit-tool flagged | Decision |
|-------|----------------------|------------------------|----------|
| `PUPPETEER_EXECUTABLE_PATH` | **Real env var** для Chrome path override | Caps_with_underscores style | Marked `[VERIFIED: official puppeteer config docs]` в DESIGN.md inline |
| `INVALID_PARENT_PATH` | TypeScript error code constant в `MCPConfigWriteError.code` discriminated union (DESIGN.md API section) | Caps_with_underscores style | Rejected — это enum value, не env var |
| `INVALID_EXISTING_JSON` | Same — error code constant | Caps_with_underscores style | Rejected — enum value |
| `WRITE_FAILED` | Same — error code constant | Caps_with_underscores style | Rejected — enum value |
| `TEST_FORMAT` | Spec field name (DESIGN.md `**TEST_FORMAT:** BDD`) — schema marker per specs-management Phase 2 Step 6.1b | Caps_with_underscores style | Rejected — это spec schema field |
| `TEST_DATA` | Same — spec schema field (`**TEST_DATA:** TEST_DATA_ACTIVE`) | Caps_with_underscores style | Rejected — spec schema field |
| `DOMAIN_EXT` | Documentation pseudocode placeholder в DESIGN.md (`tests/features/plugins/EXT/DOMAIN_EXT.feature` — где EXT и DOMAIN are template placeholders for "extension name" + "domain code", актуальные значения = `chrome-devtools-mcp-mux` + `PLUGIN017`) | Caps_with_underscores style | Rejected — pseudocode placeholder |

**Action:** документируем здесь, не модифицируем DESIGN.md (false positives засоряли бы read).

**Suggestion для audit-spec.ts maintainer:** UNVERIFIED_CONFIG check нужен whitelist для known non-env tokens (TEST_*, ERROR_*, или scope-restricted к scanning рядом с фразами "env var" / "environment variable" / "process.env" в источнике).

## Final spec health

- **validate-spec.ts:** valid=true, 0 errors, остаточные warnings — все false-positive `{...}` placeholders inside code blocks (real npm tarball file lists, JSON examples).
- **audit-spec.ts post-remediation:** 0 ERRORS, 0 LOGIC_GAPS, 0 INCONSISTENCY, 0 RUDIMENTS. 7 INFO FANTASIES — rejected как false positives с обоснованием.
- **Spec progress:** 100% (Complete). 16/16 spec файлов filled (added AUDIT_REPORT.md).
- **Coverage matrix:** 9 FR ↔ 9 AC ↔ 13 BDD scenarios ↔ 7 USER_STORIES ↔ 8 USE_CASES — все edges traced (post v0.2.0 / FR-9 addition).
- **Implementation:** 27/27 host tests GREEN (skill, mcp-config, conflict, doctor, smoke, configure-browser).

## Next steps

Spec ready for implementation. Следовать TDD-ordered TASKS.md:

1. Phase 0 (Red): создать .feature, fixtures (3), test-helpers, 5 stub test files — все 11 scenarios FAIL.
2. Phase 1-5 (Green): manifest + skill, MCP config writer, conflict detector, doctor checks, smoke test.
3. Phase 6 (Refactor): CLAUDE.md update, spec changelog finalize, final verify.

См. [TASKS.md](TASKS.md) для полного TDD-плана.
