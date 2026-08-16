# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Rolling session summary (10 секций) в `tools/advisor/session-summary.mjs` с гейтом (5K/5K+3tool), дельтой, атомарной записью, `wx`-lock, `verifyStructure`.
- MCP-тул `mcp__dev-pomogator-advisor__advisor` (без параметров) + консультация через `buildSummaryPacket` (summary+delta, fallback полный digest).
- Two-pass (luna→sol) + skeptic `balanced` (по умолчанию) / `strict`.
- Bench: `real-sessions.mjs` (сжатие/q), `skeptic-ab.mjs` (A/B), `bench.ts` (детектор).

### Changed
- digest: async-параллельная сборка (git self-check через spawn+Promise.all), `callModel` с `cacheControl`/`usage`.
- Детектор ключевых точек + auto-обновление summary в `advisor_stop.ts` (env `ADVISOR_SESSION_SUMMARY`).

### Fixed
- Живой вызов summary-модели без таймаута + unbounded delta → таймаут (инцидент); фикс: bounded delta ≤40 + AbortController.
- `verifyStructure` требовал дословные italic-описания → модель переписывает их → блокировал апдейт; фикс: требовать только `#`-заголовки.

## [0.1.0] - TBD

### Added
- Initial implementation
