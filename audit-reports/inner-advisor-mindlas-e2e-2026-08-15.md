# Inner advisor + MINDLAS: канон-регистрация и live e2e

**Дата:** 2026-08-15 · **Инструменты:** dev-pomogator plugin (inner-advisor), MINDLAS (venv, pip install mindlas)

## 1. Канон-регистрация inner-advisor (часть плагина)

Цель: адвизор доступен во всех сессиях установивших плагин, без машинных путей.

### Stop-hook (адвизор-хук в канон)
- **`tools/hook-service/registry.json`** — добавлен route `Stop/13/0` → `tools/advisor/advisor_stop.bundle.mjs` (event Stop, timeout 60, matcher '').
- **`.claude-plugin/hooks.legacy.json`** — добавлена 14-я Stop-группа (node-launcher через `hook-runtime.sh`, spawn `tools/advisor/advisor_stop.bundle.mjs`).
- **`.claude-plugin/hooks.json` / `.claude/settings.json`** — регенерированы через `generate-manifest.mjs`: 14 Stop-групп, последняя `node client.mjs "Stop/13/0"` (supervised client: manifest → client → registry → target).
- **`package.json`** — добавлен `build:advisor` (esbuild → `advisor_stop.bundle.mjs`), включён в `build:bundles`.
- Smoke: bundle с stub-stdin вернул `{}` (fail-open) — канон-поток работает.

### MCP-сервер (тул `advisor`) в каноне
- **`.mcp.json`** — `dev-pomogator-advisor`: node-launcher через `CLAUDE_PLUGIN_ROOT` (как dev-pomogator-specs), без машинного пути. Smoke: `tools/list` → тул `advisor` виден.

## 2. Live e2e: Claude Code сессия + MINDLAS + адвизор

### Постановка (ручная live-сессия)
Окружение: `claude -p` с `--settings` overlay (MINDLAS hooks: SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/PostToolUseFailure/Stop/PreCompact/PostCompact) + `ADVISOR_MINDLAS=1`. Задача: создать probe-файл, `git status`, **дважды** выполнить `/bin/nonexistent-probe --flag` (NAIMER повторный сбой → LOOP-сигнал), в конце вызвать адвизора `mcp__dev-pomogator-advisor__advisor`.

### Что произошло (реальные доказательства)
1. **MINDLAS собрал ledger реальной сессии**: `~/.mindlas/sessions/7ed60ff6-1628-4266-bf3e-f4ca3e232164/ledger.jsonl` (3193 B) + `scorecard --json` на этой сессии:
   - `context_rot: final 7/7, alerts 0` · `verification_debt: 0/0, last=none` · `change_blast_radius: 0/0 planned` · `tool_failure_loop: 0/0 controlled`.
2. **Адвизор интерпретировал LOOP-сигнал**: финальный совет агента = «считать повторяющийся `exit 127` намеренным LOOP-сигналом, не блокироваться из-за dirty worktree» — детерминированная метрика MINDLAS коррелируется с советом sol-адвизора.
3. **Прямой мост** (наш `buildSummaryPacket` на сессии `7ed60ff6` при `MINDLAS_BIN=<venv>`):
   `meta.mindlas=true`, пакет содержит секцию:
   ```
   ## MINDLAS METRICS (deterministic, read via mindlas scorecard --json)
   context_rot: 7/7
   verification_debt: 0/0 last=none
   change_blast_radius: 0/0 status=planned
   tool_failure_loop: 0/0 status=controlled
   ```
   → статы MINDLAS реально достигают пакета адвизора.

## 3. Компоненты интеграции

| Файл | Роль |
|---|---|
| `tools/advisor/mindlas-stats.mjs` | bridge: `runMindlas` → `scorecard --json` + `status --plain`, `parseScorecard`, `renderMindlasStats`; fail-open; env `ADVISOR_MINDLAS`/`MINDLAS_BIN` |
| `tools/advisor/session-digest.mjs` | `buildSummaryPacket` больше включает MINDLAS-секцию (summary-mode и digest-fallback) |
| `tests/step_definitions/feature_inner_advisor.ts` | BDD-шаги (@feature1..@feature9): гейт/дельта/атомарность/read-only/MINDLAS |
| `.mcp.json` / `.claude-plugin/hooks.*` / `registry.json` | канон-регистрация (Stop/13/0 + MCP) |

## 4. Осталось (не блокирует контур)

- **BDD Docker-прогон** `docker-bdd.sh --name INNERADV` — отложен, т.к. Docker был занят чужим прогоном (OUTSESS001); шаги typechecked, подождать свободного Docker.
- `cache_control` (prompt caching) для MINDLAS-консультаций — не замерен (суб2api может игнорировать).
- Полный крон live «MINDLAS hooks + канон-registration одной командой» (без overlay) — до канон-marketplace выкатки.

## 5. Примечание по парадигме

MINDLAS = безмодельная «термометрия» (детерминированные гейджи, loop ROT/VERIFY/BLAST/LOOP). inner-advisor = модельная интерпретация (luna→выжимка, sol→совет). Интеграция объединяет: метрика была собрана без модели, а смысловой ответ даёт модель на основе этих метрик + транскрипта/repo-rules.