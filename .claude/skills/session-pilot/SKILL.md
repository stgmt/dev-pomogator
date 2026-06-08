---
name: session-pilot
description: |
  Worktree dashboard plugin для Claude Code пользователей с 10+ ворктри.
  Триггеры (RU): "открой dashboard", "покажи мои ворктри", "список worktree",
  "launch claude в worktree X", "ресуми клода в ворктри Y", "создай worktree для Z",
  "перезапусти session-pilot", "проверь dashboard работает", "продиагностируй lm-saas LIVE".
  Триггеры (EN): "open worktree dashboard", "list my worktrees", "launch claude in worktree X",
  "resume claude in worktree Y", "create worktree for Z", "restart session-pilot",
  "diagnose live detection".

  Использовать when:
  (1) пользователь хочет открыть dashboard на http://localhost:8083 ИЛИ
  (2) автоматизировать worktree creation + claude launch ИЛИ
  (3) проверить health сервера ИЛИ
  (4) диагностировать почему ворктри не показывается LIVE ИЛИ
  (5) починить broken state (port conflict, stale PID, etc.)

  НЕ использовать для:
  - редактирования server.py — используй Edit tool напрямую
  - debugging Claude Code в общем — это про dashboard, not Claude itself
  - questions about Zellij Web Client itself — это отдельный пакет

allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__screenshot, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp
argument-hint: "<scenario-name>"
---

# session-pilot — Worktree Dashboard Skill

Сопровождает разработку и эксплуатацию плагина session-pilot. Решает 4 типичные задачи:

## Scenario 1: Health check + autostart

**Когда триггерится**: «проверь dashboard работает», «открой worktree dashboard», «session-pilot status».

**Шаги**:
1. `curl -fsS http://localhost:8083/api/health 2>/dev/null` — если 200 OK → server alive, идём к step 4
2. Если fail → `bash tools/session-pilot/start-server.sh` (idempotent)
3. Wait 2s, retry curl. Если fail повторно → `cat /tmp/sp-server.log` и report problem
4. **Verification (anti-халява, обязательно)**: `mcp__claude-in-chrome__navigate` to `http://localhost:8083`, then `mcp__claude-in-chrome__screenshot` to confirm UI loaded. Format: «CONFIRMED: dashboard UI rendered with N worktrees» / «DENIED: <reason>»

## Scenario 2: Launch claude --resume в worktree

**Когда триггерится**: «launch claude в worktree X», «resume claude в feature/auth», «продолжи сессию в lm-saas».

**Шаги**:
1. Получить worktree path от пользователя (если не указан, AskUserQuestion с topN из `git worktree list --porcelain`)
2. `curl -fsS http://localhost:8083/api/index | jq -r '.rows[] | select(.worktree_path=="<path>")'` — найти session_name + claude_max_mtime
3. Если нет Claude history → AskUserQuestion: «Нет UUID для resume. Запустить fresh claude?»
4. Если есть → `curl -fsS "http://localhost:8083/api/claude?path=<path>" | jq '.claude_sessions[0].uuid'` — взять последний UUID
5. POST `/api/launch` с `{worktree_path, session_name, mode: "resume", uuid}`:
   ```bash
   curl -fsS -X POST http://localhost:8083/api/launch \
     -H "Content-Type: application/json" \
     -d "{\"worktree_path\":\"<path>\",\"session_name\":\"<name>\",\"mode\":\"resume\",\"uuid\":\"<uuid>\"}"
   ```
6. **Verification (mandatory)**:
   - `~/.local/bin/zellij list-sessions | grep <session_name>` — must show session
   - `mcp__claude-in-chrome__navigate` to `<response.url>` (Zellij Web Client URL)
   - `mcp__claude-in-chrome__screenshot` — visual confirmation Claude is bootstrapped
   - Report CONFIRMED/DENIED with reasoning

## Scenario 3: Worktree creation pipeline

**Когда триггерится**: «создай worktree для feature X», «новый worktree under <repo>», «branch новый и зайди в него».

**Шаги**:
1. Получить параметры: `<repo>`, `<branch_name>` (default `feat/<slug>`), `<sibling_dir>` (default `D:/repos/<repo>-<slug>`)
2. AskUserQuestion для подтверждения если defaults
3. `git -C <repo> worktree add <sibling_dir> -b <branch_name>` — создать
4. POST `/api/launch` с `{worktree_path: <sibling_dir>, session_name: "<repo>__<branch>", mode: "fresh"}`
5. **Verification**:
   - `git worktree list` shows new worktree
   - `zellij list-sessions` shows new Zellij session
   - Wait 3s, refresh dashboard, verify new row appears
   - `mcp__claude-in-chrome__screenshot` — visual confirmation

## Scenario 4: Diagnose LIVE detection bug

**Когда триггерится**: «почему X не показывается live», «сессия Y в idle хотя я в ней работаю», «debug live indicator».

**Шаги**:
1. Получить worktree path X
2. `python3 tools/session-pilot/server.py --diagnose-livecycle <path>` — full diagnostic
3. Анализировать output:
   - **No matches found** → encoding variant пропущен. Расширить `encode_path_for_claude()` rules. Add regression test in `tests/test_encode_path.py`.
   - **Youngest JSONL > threshold** → Claude batches writes; `LIVE_THRESHOLD_SEC=600 python3 server.py` для retry, OR document baseline behavior to user
   - **JSONL exists but message structure unfamiliar** → server.py JSONL parse logic needs update
4. **Verification**: после fix re-run diagnostic, confirm 🟢 LIVE verdict + screenshot dashboard showing LIVE indicator

## Scenario 5: Standalone-лаунчер / закрепить на таскбаре (Windows, v0.5+)

**Когда триггерится**: «сделай ярлык», «закрепи на таскбаре», «создай лаунчер», «открывается 10/20 окон», «окно мерцает».

**Шаги**:
1. `pwsh -File tools/session-pilot/create-launcher.ps1` — создаёт Desktop `.lnk` → hidden `launch.ps1` (single-instance) со своей иконкой `session-pilot.ico` + AppUserModelID `ClaudeCode.SessionPilot`.
2. Юзер закрепляет вручную: right-click → «Show more options» → «Pin to taskbar».
3. Поведение: клик → окно открыто → фокус; закрыто → ровно одно. Детект окна — по выделенному `--user-data-dir` профилю (`Get-SpDashboardProcess`).
4. **Если плодятся окна ИЛИ мерцает без интерфейса** → см. `single-instance-launcher.md`: мерцание = рассинхрон версии в 3 местах (extension.json + handlers.py + frontend.py FRONTEND_VERSION) → цикл перезагрузки.
5. **Verification**: `SP_GUI_TEST=1 python tools/session-pilot/tests/test_launcher.py` → SP047/SP048 PASS; затем открыть окно + `mcp__claude-in-chrome__screenshot` → CONFIRMED интерфейс виден (не мерцает).

## Anti-халява rules (mandatory для каждого scenario)

1. **Никаких fire-and-forget** — каждый scenario MUST end with verification step
2. **Verification через `mcp__claude-in-chrome__*`** — НЕ PowerShell desktop screenshots (см. rule `mcp-chrome-only.md`)
3. **CONFIRMED/DENIED format** — explicit verdict, не silent success
4. **Если verification fails** — show error to user, suggest next debug step (don't just say "task done")
5. **Cross-link к docs**: при проблемах укажи на FR/AC в `.specs/session-pilot/`

## Common gotchas (lessons learned)

- Zellij `-l <FILE>` ≠ `-n <FILE>`. Use `-n` for new sessions, `-l` adds tab to existing.
- Claude Code batches JSONL writes ~2-3 min — default LIVE threshold 300s, NOT 90s.
- `setsid script -qfc "..." /dev/null` нужен для spawn detached Zellij из HTTP backend (нужен pty).
- `subprocess.Popen` с `stdin=DEVNULL` без TTY → Zellij hangs at startup.
- Cross-OS encoding: `D--repos-foo` (Windows-cwd) AND `-mnt-d-repos-foo` (WSL-cwd) — обе variants нужны.
- WSL2 NAT mode: `netsh portproxy add v4tov4 listenport=8083 connectaddress=<WSL_IP>` для access from Windows host.
- **Версия в 3 местах** (extension.json + handlers.py `/api/health` + frontend.py `FRONTEND_VERSION`) — менять ВМЕСТЕ, иначе фронт уходит в цикл перезагрузки (мерцание, интерфейса не видно). Проверять на живой странице, не только `/api/health`.
- **Single-instance лаунчер**: окно детектится по выделенному `--user-data-dir` профилю; повторный запуск фокусирует, не плодит. Считай ОКНА (`MainWindowHandle != 0`), не процессы Edge (~13 на одно окно).

## Поддерживаемые extensions

Рекомендованные правила which complement this skill:
- `.claude/rules/session-pilot/action-button-injection.md` — write-chars vs new-layout decision tree
- `.claude/rules/session-pilot/claude-projects-encoding.md` — path encoding gotchas
- `.claude/rules/session-pilot/perf-budget.md` — latency targets per endpoint
- `.claude/rules/session-pilot/mcp-chrome-only.md` — verification must use claude-in-chrome MCP
- `.claude/rules/session-pilot/single-instance-launcher.md` — one-window launcher, dedicated-profile detection, 3-place version sync (v0.5+)

## Не делает skill

- Edit server.py — use Edit tool directly with knowledge from `read_spec_doc({ spec: "session-pilot", doc: "DESIGN.md" })` (MCP-rails FR-39 — not a raw Read of `.specs/`)
- Spec authoring — use `Skill("create-spec")` for that
- Zellij configuration — that's separate domain
