# Inner Advisor

In-session AI advisor для Claude Code: модель-пара (executor сам зовёт сильную модель через MCP-тул без параметров) + rolling session summary (10 секций) на диске, чтобы каждая консультация читала компактную память сессии, а НЕ пересобирала весь транскрипт. Часть канонического плагина — работает во всех сессиях установивших плагин.

## Ключевые идеи

- **Само-вызов**: тул `mcp__dev-pomogator-advisor__advisor` без параметров; агент решает когда (nudge), не принуждение.
- **Rolling summary**: 10-секционный `summary.md` (порт нативной Anthropic Session Memory), ведётся по гейту (5K init / 5K роста + ≥3 tool calls), переживает `/compact`/`--resume`.
- **Консультация через summary+delta**: `buildSummaryPacket` — если summary есть, вход = summary + маленький хвост (реально 90MB→~10K); иначе полный digest (fallback).
- **Two-pass + skeptic balanced**: дешевая (luna) выжимка → сильная (sol) совет; «не done» только при реальной причине.
- **Fail-open и bounded input**: нет модели/таймаут/битый транскрипт → `{}`/короткая ошибка, Stop не блокируется; digest-бюджет и delta≤40.
- **Каноническая регистрация**: Stop-hook в `hooks.json`, MCP в `.mcp.json`/manifest через `CLAUDE_PLUGIN_ROOT` — без машинных путей.
- **Изоляция**: не пересекается с `out-session-advisor` (внешний нооу над чужими сессиями).

## Где лежит реализация

- **App-код**: `tools/advisor/` (session-summary.mjs, session-digest.mjs, mcp-server.mjs, fast-evidence.mjs, transcript-packet.mjs, advisor_stop.ts, bench/*)
- **Wiring**: `.claude-plugin/hooks.json` (Stop-hook), `.mcp.json`/plugin manifest (MCP dev-pomogator-advisor), `.dev-pomogator/advisor/config.json` (runtime конфиг)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)