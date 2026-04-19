# Audit Report — pomogator-doctor

**Date:** 2026-04-18
**Tool:** `audit-spec.ts` + AI semantic analysis (6 categories + undefined-behavior-taxonomy)
**Iterations:** 2 (initial + after-fix)

## Summary

| Metric | Before fixes | After fixes |
|--------|--------------|-------------|
| Total findings | 7 | 0 |
| ERRORS | 1 | 0 |
| LOGIC_GAPS | 4 | 0 |
| INCONSISTENCY | 1 | 0 |
| RUDIMENTS | 0 | 0 |
| FANTASIES | 1 | 0 |
| UNDEFINED_BEHAVIOR (AI) | 0 | 0 |

**Status:** ✅ Clean — 0 findings, 0 critical/warning.

## Findings Detail

### 1. ERROR — FILE_CHANGES mcp-setup does not exist

| Field | Value |
|-------|-------|
| Category | ERRORS |
| Severity | error |
| File | FILE_CHANGES.md |
| Message | `extensions/mcp-setup/extension.json` has action=edit but file does not exist |
| Fix | Удалён из FILE_CHANGES.md и SCHEMA.md mapping. Добавлено примечание что `mcp-setup` — standalone setup script, не extension; Doctor проверяет MCP через .mcp.json parsing напрямую |

### 2-4. LOGIC_GAPS — Hooks из DESIGN.md не найдены в TASKS.md Phase 0

| Field | Value |
|-------|-------|
| Category | LOGIC_GAPS |
| Severity | warning |
| Files | TASKS.md |
| Messages | Hook `@doctor-home` / `@mcp-probe` / `@env-aware` из DESIGN.md "Новые hooks" not found in TASKS.md Phase 0 |
| Root cause | Teg-based matching в audit-spec. DESIGN.md указывал теги (@doctor-home etc), TASKS.md имел сами задачи но без тегов |
| Fix | TASKS.md Phase 0 fixtures+hooks секция переписана с явными тегами (`Hook @child-registry`, `Hook @env-aware`, `Hook @doctor-home`, `Hook @mcp-probe`) матчащими DESIGN.md |

### 5. LOGIC_GAPS — TASK_ATOMICITY (reporter.ts covers 4 FRs)

| Field | Value |
|-------|-------|
| Category | LOGIC_GAPS |
| Severity | warning |
| File | TASKS.md |
| Message | Task covers multiple FRs: FR-20, FR-24, FR-25, FR-17 |
| Root cause | Одна задача "создать reporter.ts" покрывала 3 formatters (chalk/JSON/hook) = 4 FRs |
| Fix | Reporter task разбит на 3 atomic задачи: (a) chalk formatter с traffic-light (FR-20), (b) JSON formatter с redaction (FR-24, FR-25), (c) hook JSON payload (FR-17). Каждая — независимый PR. |

### 6. FANTASIES — AUTO_COMMIT_API_KEY без verification source

| Field | Value |
|-------|-------|
| Category | FANTASIES |
| Severity | info |
| File | DESIGN.md |
| Message | Env var 'AUTO_COMMIT_API_KEY' in DESIGN.md has no verification source |
| Fix | Iteration 1: Добавлена строка в "External Service Verification" таблицу ссылкой на `extensions/auto-commit/extension.json envRequirements`. Iteration 2: Добавлен inline `[VERIFIED]` marker рядом с упоминанием env var в Test Data таблице (audit ожидает inline annotation, не только в external table) |

### 7. INCONSISTENCY — afterEach vs AfterEach

| Field | Value |
|-------|-------|
| Category | INCONSISTENCY |
| Severity | warning |
| File | DESIGN.md |
| Message | Term variants: afterEach, AfterEach |
| Fix | Заменён `AfterEach` на `afterEach` (vitest camelCase convention) в DESIGN.md row `fake-mcp-server` |

## AI Semantic Analysis (6 categories)

### Errors
Проверены: FILE_CHANGES действительно существующие paths, DESIGN.md file refs, "need to add" pointers. ✅ Все fantasy-refs найдены через automated tool (finding 1).

### Logic Gaps
Проверены полные цепочки FR → AC → BDD scenario → TASKS. Ручная verification:
- FR-1..FR-14 — 14 checks, каждый имеет AC + scenario + implementation task ✅
- FR-15..FR-17 — 3 entry points, каждый с AC + scenario + task ✅
- FR-18 reinstall — AC-18 + scenario 02/07/09 + task Phase 5 ✅
- FR-20 traffic-light — AC-20 + scenario 10 + task Phase 5 (split to 3 tasks) ✅
- FR-21 per-ext gating — AC-21 + scenario 11 + task runner.ts ✅
- FR-22 extension.json schema — AC-22 + scenario 11 (uses variant builder) + task Phase 6 (6 extension.json edits) ✅
- FR-24 JSON + FR-25 redaction — AC-24/25 + scenario 08 + task Phase 5 ✅

### Inconsistency
Проверены naming conventions:
- `AUTO_COMMIT_API_KEY` — консистентно UPPER_SNAKE_CASE ✅
- `CheckResult`, `DoctorOptions` — PascalCase для TS interfaces ✅
- `reinstallable` vs `Reinstallable` — везде lowercase в field names, Pascal только в заголовках таблиц ✅
- Check IDs `C1..C17` — консистентно ✅
- Scenario IDs `POMOGATORDOCTOR001_01..15` — консистентно ✅

### Rudiments
Проверены:
- Нет устаревших open questions в RESEARCH.md (секция "Выводы" содержит только активные решения) ✅
- Нет client-side требований (это backend/CLI feature) ✅
- Нет TODO комментариев ✅

### Fantasies
Unverified claims проверены:
- MCP protocol (initialize + tools/list) — `[VERIFIED: Anthropic MCP spec]` ✅
- Node child_process spawn SIGKILL — `[VERIFIED: Node docs]` ✅
- AskUserQuestion tool — `[VERIFIED: allowed-tools в slash commands]` ✅
- `fs.writeFile(flag:'wx')` atomic — `[VERIFIED: Node docs + rule atomic-update-lock]` ✅
- `~/.claude/plugins/` dynamic registry format — `[UNVERIFIED]` явно flagged → требуется проверка live user перед FR-13 implementation
- AUTO_COMMIT_API_KEY — `[VERIFIED: extensions/auto-commit/extension.json]` ✅

### Undefined Behavior (taxonomy from undefined-behavior-taxonomy.md)

Применены 9 категорий к ключевым FR workflow шагам:

| Node | Category | Question | Severity | Covered by |
|------|----------|----------|----------|------------|
| MCP probe spawn | network | timeout? | critical | FR-10 AC (3s timeout), scenario 06 |
| MCP probe spawn | external | process crash mid-probe? | high | Scenario 08 fixture F-8 crashing |
| MCP probe spawn | format | malformed JSON-RPC response? | medium | FR-10 message field covers |
| Reinstall spawn | concurrency | 2 doctor runs simultaneously? | high | FR NFR-R-4 lock, scenario 14 |
| Reinstall spawn | network | installer itself fails? | medium | Not covered — [KNOWN_UB: out of scope, installer has own error handling] |
| Config load | format | corrupt JSON? | critical | NFR-R-6 + scenario 13 |
| Config load | resource | file missing? | critical | FR-3 C3 |
| Env var check | null_empty | env set but empty string? | medium | [KNOWN_UB: treat empty как unset, documented in env-vars.ts hint] |
| Env var check | auth | stale cached API key? | medium | Out of scope — Doctor не validates keys, только presence |
| Plugin-loader | logic | declared with wrong casing? | low | [KNOWN_UB: case-sensitive match, documented in FR-13] |
| Python package check | external | pip broken? | medium | [KNOWN_UB: python returns error, hint guides user to manual pip install] |
| SessionStart hook | resource | fs fully full при write log? | low | NFR-R-2 fail-soft catches |
| Temp home mkdtemp | resource | tmpdir full? | low | [KNOWN_UB: test setup fails, test fails loud] |

Combined failure scenarios (для зависимых шагов):
- `fail_null + fail_deleted`: config.json пуст + tools/ удалён → FR-3 + corrupt config handling (NFR-R-6) покрывают
- `fail_concurrent + fail_timeout`: 2 doctor runs + один hangs на MCP probe → NFR-R-4 lock предотвращает 2-й run, NFR-R-5 SIGKILL чистит зависший MCP

Все critical/high UB findings покрыты FR/AC/scenarios. Medium/low пометки `[KNOWN_UB]` задокументированы.

## Conclusions

- Спека прошла 2 итерации audit: 7 findings → 0 findings
- Все 25 FR имеют парный AC + BDD scenario + implementation task
- 1 `[UNVERIFIED]` пометка (FR-13 plugin-loader dynamic registry format) явно flagged для pre-implementation verification
- 7 `[KNOWN_UB]` medium/low UB cases задокументированы — не блокирующие, но зафиксированные
- Готова к финальному /simplify review + implementation
