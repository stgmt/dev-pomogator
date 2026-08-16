---
name: pomogator-doctor
description: |
  Diagnostic tool для dev-pomogator plugin: проверяет 20 environment aspects (Node/Git/Bun/Python/MCP servers/Codex-mem plugin/hooks registry/env vars/Codex version match/native statusLine/statusline widgets repo+cwd/context-menu install drift) и предлагает fix actions (incl. установка нативного statusLine ccstatusline, добавление repo/cwd виджетов, переустановка контекстного меню — всё по подтверждению). Use при подозрениях на broken plugin install, missing dependencies, stale hooks, или когда команды plugin behave unexpectedly. Triggers (Russian): "проверь окружение", "доктор", "диагностика помогатора", "почему не работает плагин". Triggers (English): "check environment", "doctor", "plugin diagnostics", "verify install". Output: severity-coded report (🟢 self-sufficient, 🟡 needs env vars, 🔴 needs external deps) с actionable hints. Можно invoke через slash-command `/pomogator-doctor` (also distributed via plugin) или напрямую как skill.
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
- Generic Codex troubleshooting unrelated к dev-pomogator plugin

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

   Это пишет `statusLine.command = npx -y ccstatusline@latest` в `~/.Codex/settings.json` немедленно (текущая сессия), идемпотентно, не перетирая чужую кастомную строку. Сама строка отрисуется со следующего старта сессии (settings читаются до хуков). Opt-out: `DEV_POMOGATOR_STATUSLINE=off`. Домен NATIVE statusLine ≠ прогресс тестов (compact_bar.py).

7. **Codex-mem detect (id `C-CMEM`, FR-6):** если результат `Codex-mem plugin installed` имеет severity `warning` (плагин не установлен) → это информационный сигнал: SessionStart-хук `tools/Codex-mem-bootstrap/install-Codex-mem.ts` поставит Codex-mem автоматически на следующей сессии (opt-out: `DEV_POMOGATOR_CLAUDE_MEM=off`). Хинт также предлагает ручную установку (`/plugin marketplace add thedotmack/Codex-mem` → `/plugin install Codex-mem`, либо `npx Codex-mem install`). Чек только детектит — не ставит сам (установщик Codex-mem интерактивный; тихую установку делает хук без TTY).

8. **Statusline widgets fix-action (id `C-NSW`, FR-11):** если результат `Statusline widgets (repo + cwd)` имеет severity `warning` (конфиг ccstatusline отсутствует или стоковый — на баре нет имени репо и cwd) → предложить через `AskUserQuestion` («Добавить repo + cwd на statusline сейчас?» / «Не надо»). При согласии — выполнить тот же `apply-statusline.ts` (см. выше): он дополнительно сидит/обогащает `~/.config/ccstatusline/settings.json` виджетами `git-root-dir` + `current-working-dir`. Кастомные layouts никогда не трогаются (check репортит для них `ok`).

9. **MCP auth fix-action (id `C-MCPA`, FR-MCP):** если результат `MCP auth (Context7 / Octocode)` имеет severity `warning` (Context7 без API-ключа = анонимный тир, и/или Octocode без GitHub-доступа; `details.unconfigured` перечисляет какие) → предложить настроить сейчас. Действие — **invoke `Skill("configure-mcp")`** (`details.fixSkill`): он просит ключ у пользователя / говорит где взять / пробует добыть сам (Context7 OAuth `npx ctx7 setup`; Octocode `gh auth login`), вписывает секрет в user-global `~/.Codex.json` через `tools/mcp-setup/set-mcp-key.ts` и реально проверяет результат. Сами серверы ставит SessionStart-хук `tools/mcp-setup/mcp-bootstrap.ts` (opt-out: `DEV_POMOGATOR_MCP_SETUP=off`); этот чек только про auth-настройку. Реальная проверка «настроено» (не вслепую): ключ Context7 непустой / `gh auth status` exit 0 — см. `tools/mcp-setup/mcp-auth-detect.ts`.

10. **Context menu drift fix-action (id `C-CTXM`, FR-CTXM):** если результат `Context menu install drift (Windows)` имеет severity `warning` (правая кнопка мыши → «Codex» крутит УСТАРЕВШИЙ код — `~/.dev-pomogator/scripts/launch-Codex-tui.ps1` и/или `C:\Program Files\Nilesoft Shell\imports\Codex.nss` не совпадают с актуальным `tools/context-menu/postinstall.ts`, потому что `/context-menu` — once-run установщик, который ничего не обновляет автоматически) → предложить через `AskUserQuestion` («Переустановить контекстное меню сейчас (обновит то, что реально запускает правая кнопка)?» / «Не надо»). При согласии — выполнить:

    ```bash
    powershell -ExecutionPolicy Bypass -File .\scripts\install-codex-context-menu.ps1 -PostinstallOnly
    ```

    Копирует актуальный `launch-Codex-tui.ps1` поверх установленного, перегенерирует `Codex.nss`, перезагружает Nilesoft Shell (elevated copy — может всплыть UAC). После — перечитать оба файла и подтвердить совпадение с источником, не доверять только коду выхода (инцидент 2026-06-30: фикс был в исходниках плагина, но установленные копии оставались старыми — правая кнопка продолжала падать идентично «до» и «после», пока не запустили установщик вручную).

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

`doctor-hook.ts` registered как SessionStart hook через plugin's `.Codex-plugin/hooks.json`. Quiet mode — outputs только при detected problems. Fail-soft per NFR-R-2: any error logs к `~/.dev-pomogator/logs/doctor.log` и exits clean.

## Codex-mem worker wedged (Windows) — root cause + auto-heal

**Symptom:** `Codex-mem worker unreachable for N consecutive hooks` surfaced as a BLOCKING
PostToolUse error (Codex-mem does `process.exit(2)` at its fail-loud threshold), hitting every
tool call in every project. Users saw it ~3×/day and were told to reboot.

**Root cause (Windows-only, proven live 2026-07-03):** Codex-mem's worker binds a fixed port
(`37700 + (getuid ?? 77) % 100` → always 37777, `getuid` is undefined on Windows). Under load its
observer LLM aborts on timeout → returns empty → after 3 in a row Codex-mem SIGKILLs the worker.
The worker had spawned `chroma-mcp` as a child, which **inherited the 37777 listening-socket
handle** (Windows inherits handles by default). SIGKILL kills the worker but the orphaned
`chroma-mcp` survives and keeps the socket bound under the now-dead worker PID → every new worker
fails `Is port 37777 in use?` → wedge. It is NOT a kernel zombie — a LIVE orphan holds it, so
killing that orphan frees the port **without reboot**. Known unfixed upstream: thedotmack/Codex-mem
issues #415/#1531/#2111/#213/#729.

**Auto-heal (no reboot, no port change):** the `Codex-mem-reaper` SessionStart hook
(`tools/Codex-mem-health/health-check.ts`) runs every session start: probes `/api/health`; if
unhealthy AND the port is held by a dead PID, it kills only orphaned processes whose command line
carries a Codex-mem signature (`chroma-mcp …/.Codex-mem`, `…/Codex-mem/…/worker-service.cjs`)
and whose parent is dead — freeing the port — then resets `hook-failures.json`. Surgical matcher:
a live worker (health 200) is never touched; a non-Codex-mem orphan is never killed. Opt out with
`DEV_POMOGATOR_CLAUDE_MEM_REAP=off`.

**Doctor surface:** check `C-CMEM-W` (`checks/Codex-mem-worker.ts`) reports worker runtime health
(probe + `hook-failures.json` counter) as ok / warning / critical, so a degraded worker is VISIBLE
instead of silently blocking. It does not kill anything (diagnostic only) — the reaper hook owns
the fix and heals on the next session.

## Slash command companion

`.Codex/commands/pomogator-doctor.md` provides `/pomogator-doctor` slash command — alternative invocation от skill. Both call same engine; command output verbose with severity grouping, skill output adapted к conversation context.

## Migration note (v2.0)

В v1, doctor engine жил в `src/doctor/` and was invoked through `dev-pomogator --doctor` CLI binary. После canonical refactor v2.0:
- Engine moved к `.Codex/skills/pomogator-doctor/scripts/engine/` (skill-internal location per Anthropic plugin convention)
- Hook script `tools/pomogator-doctor/doctor-hook.ts` → `.Codex/skills/pomogator-doctor/scripts/doctor-hook.ts`
- CLI binary `dev-pomogator --doctor` deprecated; users invoke through skill OR slash command `/pomogator-doctor`
