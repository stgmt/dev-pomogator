# Acceptance Criteria (EARS)

## AC-1 (FR-1): Чтение отчёта insights @feature1

**Требование:** [FR-1: Чтение отчёта insights](FR.md#fr-1-чтение-отчёта-insights)

WHEN suggest-rules executes in Claude Code AND Phase -1 (Memory Context) completes THEN the system SHALL attempt to Read `~/.claude/usage-data/report.html` as the first step of Phase -0.5.

## AC-2 (FR-2): Stale-маркер для устаревшего отчёта @feature2

**Требование:** [FR-2: Проверка свежести отчёта](FR.md#fr-2-проверка-свежести-отчёта)

IF the report's end_date (extracted from `.subtitle` text) is more than 3 days before the current date THEN the system SHALL set insights_mode to `"stale"` AND mark ALL insights candidates derived from this report with `⚠️ stale` marker.

## AC-3 (FR-2): Недоступный отчёт @feature2

**Требование:** [FR-2: Проверка свежести отчёта](FR.md#fr-2-проверка-свежести-отчёта)

IF the report file does not exist OR Read returns an error THEN the system SHALL display `📊 Insights: недоступен (отчёт не найден)` with a hint to run `/insights` AND set insights_mode to `"unavailable"` AND proceed to Phase 0 without delay.

## AC-4 (FR-3): Извлечение friction categories @feature3

**Требование:** [FR-3: Извлечение friction categories](FR.md#fr-3-извлечение-friction-categories)

WHEN the report is successfully read THEN the system SHALL extract from each `.friction-category` element: the text of `.friction-title`, the text of `.friction-desc`, and the list items from `.friction-examples li` AND classify each as candidate type 🔴 Antipattern or ⚠️ Gotcha.

## AC-5 (FR-4): Извлечение CLAUDE.md suggestions @feature4

**Требование:** [FR-4: Извлечение CLAUDE.md suggestions](FR.md#fr-4-извлечение-claudemd-suggestions)

WHEN the report is successfully read THEN the system SHALL extract from each `.claude-md-item` element: the `data-text` attribute value and the text content of `.cmd-why` child element AND classify each as candidate type 🟢 Pattern or 📋 Checklist.

## AC-6 (FR-7): Оценка релевантности pre-candidates @feature7

**Требование:** [FR-7: Создание pre-candidates с оценкой релевантности](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности)

WHEN pre-candidates are created from insights findings THEN each candidate SHALL be assigned a relevance level: HIGH (if keywords match session context technologies/domains/problems from Phase -1 Step 1.5), MEDIUM (if same domain but different specific problem), or LOW (if general workflow improvement without session binding).

## AC-7 (FR-8): Unified mode display @feature8

**Требование:** [FR-8: Unified mode display](FR.md#fr-8-unified-mode-display)

WHEN Phase -0.5 completes THEN the system SHALL display a unified mode line showing memory status (🧠), insights status (📊), and session status (📍) AND the mode name SHALL reflect available sources: `Full (память + сессия + insights)` when all three available, `Full (память + сессия)` when no insights, `Insights + Session` when no memory, `Session-only` when neither memory nor insights.

## AC-8 (FR-9): Маркер источника в Phase 3 @feature9

**Требование:** [FR-9: Маркер источника в Phase 3](FR.md#fr-9-маркер-источника-в-phase-3)

WHEN insights-derived candidates appear in Phase 3 output tables THEN the source column SHALL show `📊 insights` for fresh report candidates AND `📊 insights ⚠️` for stale report candidates.

## AC-9 (FR-10): Дедупликация при совпадении с session @feature9

**Требование:** [FR-10: Дедупликация insights с session findings](FR.md#fr-10-дедупликация-insights-с-session-findings)

WHEN an insights finding matches a session finding (same problem/pattern domain) THEN the system SHALL merge them with session as primary source AND add insights as supplementary evidence with note "также наблюдалось кросс-сессионно" AND the merged candidate source SHALL show combined marker (e.g., `📍 turn #N + 📊`).

## AC-10 (FR-1..FR-9): Пропуск Phase -0.5 в Cursor @feature10

**Требование:** Cross-cutting -- покрывает [FR-1](FR.md#fr-1-чтение-отчёта-insights) через [FR-9](FR.md#fr-9-маркер-источника-в-phase-3)

IF the platform is Cursor THEN Phase -0.5 SHALL be skipped entirely without any output AND the unified mode display SHALL NOT contain an insights status line AND suggest-rules behavior SHALL be identical to the version without Phase -0.5.

> **Note:** AC-10 покрывает платформо-специфичное поведение для FR-1 через FR-9 -- на Cursor ни один из FR Phase -0.5 не применяется.
