---
name: pomogator-doctor
description: |
  Diagnostic tool для dev-pomogator plugin: проверяет 20 environment aspects (Node/Git/Bun/Python/MCP servers/claude-mem plugin/hooks registry/env vars/Claude Code version match/native statusLine/statusline widgets repo+cwd/context-menu install drift) и предлагает fix actions (incl. установка нативного statusLine ccstatusline, добавление repo/cwd виджетов, переустановка контекстного меню — всё по подтверждению). Use при подозрениях на broken plugin install, missing dependencies, stale hooks, или когда команды plugin behave unexpectedly. Triggers (Russian): "проверь окружение", "доктор", "диагностика помогатора", "почему не работает плагин". Triggers (English): "check environment", "doctor", "plugin diagnostics", "verify install". Output: severity-coded report (🟢 self-sufficient, 🟡 needs env vars, 🔴 needs external deps) с actionable hints. Можно invoke через slash-command `/pomogator-doctor` (also distributed via plugin) или напрямую как skill.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# pomogator-doctor — Environment diagnostic

Skill проверяет 21 environment aspect (21 CheckDefinitions в `checks/index.ts`, incl. C-MCPA — MCP auth Context7/Octocode, C-CTXM — context menu install drift) required для dev-pomogator plugin функционирования. Использует self-contained TypeScript engine в `scripts/engine/` для checks; hook вариант в `scripts/doctor-hook.ts` runs at SessionStart events.

## Когда invoke

- Plugin behave unexpectedly (skills missing, hooks not firing, commands fail)
- After `/plugin install dev-pomogator@stgmt` если skills не visible после `/reload-plugins` или Desktop restart
- При подозрениях на missing dependencies (Bun, Python, Docker, MCP servers)
- Diagnostic перед reporting bug
- Russian triggers: «проверь окружение», «доктор», «диагностика помогатора», «почему не работает плагин»

## Когда НЕ invoke

- Routine code review / refactoring
- Initial setup (use `/plugin install` flow вместо)
- Generic Claude Code troubleshooting unrelated к dev-pomogator plugin

## Algorithm

1. Run engine: `npx tsx ${SKILL_DIR}/scripts/engine/index.ts` (or invoke programmatically via `runQuiet()` from `engine/index.ts`)
2. Parse JSON output — array of CheckResult с `{ id, fr, name, group, severity, ok, message, hint?, reinstallable? }`
3. Group by severity: 🟢 self-sufficient (Node/Git/install), 🟡 env vars needed, 🔴 external deps missing
4. For each ⚠/✗ result: print message + hint в actionable format
5. If `reinstallable: true` issues found → suggest `/plugin install dev-pomogator@stgmt --force` или migration script (`tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global` if v1 install detected)
6. **Native statusLine fix-action (id `C-NSL`, FR-7):** если результат `Native statusLine (ccstatusline)` имеет severity `warning` → предложить через `AskUserQuestion` поставить строку сейчас («Поставить нативный statusLine (ccstatusline) сейчас?» / «Не надо»). При согласии — выполнить `details.fixScript` через bootstrap (резолвится из плагина у установленных юзеров):

   ```bash
   node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/native-statusline/apply-statusline.ts"
   ```

   Это пишет `statusLine.command = npx -y ccstatusline@latest` в `~/.claude/settings.json` немедленно (текущая сессия), идемпотентно, не перетирая чужую кастомную строку. Сама строка отрисуется со следующего старта сессии (settings читаются до хуков). Opt-out: `DEV_POMOGATOR_STATUSLINE=off`. Домен NATIVE statusLine ≠ прогресс тестов (compact_bar.py).

7. **claude-mem detect (id `C-CMEM`, FR-6):** если результат `claude-mem plugin installed` имеет severity `warning` (плагин не установлен) → это информационный сигнал: SessionStart-хук `tools/claude-mem-bootstrap/install-claude-mem.ts` поставит claude-mem автоматически на следующей сессии (opt-out: `DEV_POMOGATOR_CLAUDE_MEM=off`). Хинт также предлагает ручную установку (`/plugin marketplace add thedotmack/claude-mem` → `/plugin install claude-mem`, либо `npx claude-mem install`). Чек только детектит — не ставит сам (установщик claude-mem интерактивный; тихую установку делает хук без TTY).

8. **Statusline widgets fix-action (id `C-NSW`, FR-11):** если результат `Statusline widgets (repo + cwd)` имеет severity `warning` (конфиг ccstatusline отсутствует или стоковый — на баре нет имени репо и cwd) → предложить через `AskUserQuestion` («Добавить repo + cwd на statusline сейчас?» / «Не надо»). При согласии — выполнить тот же `apply-statusline.ts` (см. выше): он дополнительно сидит/обогащает `~/.config/ccstatusline/settings.json` виджетами `git-root-dir` + `current-working-dir`. Кастомные layouts никогда не трогаются (check репортит для них `ok`).

9. **MCP auth fix-action (id `C-MCPA`, FR-MCP):** если результат `MCP auth (Context7 / Octocode)` имеет severity `warning` (Context7 без API-ключа = анонимный тир, и/или Octocode без GitHub-доступа; `details.unconfigured` перечисляет какие) → предложить настроить сейчас. Действие — **invoke `Skill("configure-mcp")`** (`details.fixSkill`): он просит ключ у пользователя / говорит где взять / пробует добыть сам (Context7 OAuth `npx ctx7 setup`; Octocode `gh auth login`), вписывает секрет в user-global `~/.claude.json` через `tools/mcp-setup/set-mcp-key.ts` и реально проверяет результат. Сами серверы ставит SessionStart-хук `tools/mcp-setup/mcp-bootstrap.ts` (opt-out: `DEV_POMOGATOR_MCP_SETUP=off`); этот чек только про auth-настройку. Реальная проверка «настроено» (не вслепую): ключ Context7 непустой / `gh auth status` exit 0 — см. `tools/mcp-setup/mcp-auth-detect.ts`.

10. **Context menu drift fix-action (id `C-CTXM`, FR-CTXM):** если результат `Context menu install drift (Windows)` имеет severity `warning` (правая кнопка мыши → «Claude Code» крутит УСТАРЕВШИЙ код — `~/.dev-pomogator/scripts/launch-claude-tui.ps1` и/или `C:\Program Files\Nilesoft Shell\imports\claude-code.nss` не совпадают с актуальным `tools/context-menu/postinstall.ts`, потому что `/context-menu` — once-run установщик, который ничего не обновляет автоматически) → предложить через `AskUserQuestion` («Переустановить контекстное меню сейчас (обновит то, что реально запускает правая кнопка)?» / «Не надо»). При согласии — выполнить:

    ```bash
    node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/context-menu/postinstall.ts"
    ```

    Копирует актуальный `launch-claude-tui.ps1` поверх установленного, перегенерирует `claude-code.nss`, перезагружает Nilesoft Shell (elevated copy — может всплыть UAC). После — перечитать оба файла и подтвердить совпадение с источником, не доверять только коду выхода (инцидент 2026-06-30: фикс был в исходниках плагина, но установленные копии оставались старыми — правая кнопка продолжала падать идентично «до» и «после», пока не запустили установщик вручную).

## Engine structure (scripts/engine/)

| File | Purpose |
|------|---------|
| `index.ts` | Main entry; exports `runQuiet()` and `runVerbose()` |
| `runner.ts` | Check executor (timeout, error capture) |
| `lock.ts` | Prevents concurrent doctor runs |
| `reporter.ts` | Formats output (text + JSON) |
| `constants.ts` | Timeouts + paths |
| `types.ts` | CheckDefinition / CheckResult interfaces |
| `testing.ts` | Test helpers |
| `checks/index.ts` | Imports + exports all checks |
| `checks/<name>.ts` | Individual check implementations (17 total) |

## Hook variant (scripts/doctor-hook.ts)

`doctor-hook.ts` registered как SessionStart hook через plugin's `.claude-plugin/hooks.json`. Quiet mode — outputs только при detected problems. Fail-soft per NFR-R-2: any error logs к `~/.dev-pomogator/logs/doctor.log` и exits clean.

## Slash command companion

`.claude/commands/pomogator-doctor.md` provides `/pomogator-doctor` slash command — alternative invocation от skill. Both call same engine; command output verbose with severity grouping, skill output adapted к conversation context.

## Migration note (v2.0)

В v1, doctor engine жил в `src/doctor/` and was invoked through `dev-pomogator --doctor` CLI binary. После canonical refactor v2.0:
- Engine moved к `.claude/skills/pomogator-doctor/scripts/engine/` (skill-internal location per Anthropic plugin convention)
- Hook script `tools/pomogator-doctor/doctor-hook.ts` → `.claude/skills/pomogator-doctor/scripts/doctor-hook.ts`
- CLI binary `dev-pomogator --doctor` deprecated; users invoke through skill OR slash command `/pomogator-doctor`
