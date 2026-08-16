# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.specs/inner-advisor/*` (scaffold 15 файлов) | edit | спека фичи (эта работа) |
| `tools/advisor/session-summary.mjs` | edit | Rolling summary core (FR-1, FR-2) — уже частично реализовано |
| `tools/advisor/session-digest.mjs` | edit | buildSummaryPacket + callModel(cacheControl/usage) + async (FR-4, FR-5, FR-8) |
| `tools/advisor/mcp-server.mjs` | edit | MCP-тул advisor, режимы, trace (FR-4) |
| `tools/advisor/advisor_stop.ts` | edit | Stop-hook: ключевые точки + гейт-обновление summary (FR-3) |
| `tools/advisor/fast-evidence.mjs` | edit | паттерн-выборка (FR-5) |
| `tools/advisor/transcript-packet.mjs` | edit | locate транскрипта + model call (FR-5) |
| `tools/advisor/bench/real-sessions.mjs` | edit | bench сжатия/слоёв (FR-8) |
| `tools/advisor/bench/skeptic-ab.mjs` | edit | A/B скепсиса (FR-6) |
| `tools/advisor/mindlas-stats.mjs` | edit | bridge: чтение MINDLAS scorecard/status в консультацию (FR-10) |
| `tools/advisor/bench/bench.ts` | edit | офлайн-бенч детектора (FR-8) |
| `tools/advisor/README.md` | edit | документация |
| `.claude-plugin/hooks.json` | edit | регистрация Stop-hook через CLAUDE_PLUGIN_ROOT (FR-3, FR-4) |
| `.mcp.json` (проект dogfood) + plugin manifest | edit | регистрация MCP dev-pomogator-advisor (FR-4) |
| `.specs/inner-advisor/inner-advisor.feature` | edit | BDD сценарии (FR-1..FR-8) |
| `tests/step_definitions/feature_inner_advisor.ts` | create | step definitions (Phase 0) |
| `.dev-pomogator/advisor/config.json` | create | runtime конфиг (enabled/mode/skeptic/sessionSummary), fail-open (FR-3) |
| `.dev-pomogator/advisor/summary/<sid>.md` | create | rolling summary (runtime, gitignored) |
| `.dev-pomogator/advisor/state/<sid>.json` | create | state экстракций (runtime, gitignored) |