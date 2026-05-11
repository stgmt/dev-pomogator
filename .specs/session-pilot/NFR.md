# Non-Functional Requirements (NFR)

## Performance

- **NFR-Perf-1** Cold first paint of top-20 rows ≤ 1 second (Performance.now() instrumented)
- **NFR-Perf-2** Warm reload (with localStorage cache hit) ≤ 300ms
- **NFR-Perf-3** Per-row cold enrich (GET /api/claude) ≤ 300ms
- **NFR-Perf-4** Per-row warm fetch (304 path with matching ETag) ≤ 30ms (server processing 5ms + network)
- **NFR-Perf-5** GET /api/index warm cache hit ≤ 150ms
- **NFR-Perf-6** Diagnostic CLI completes ≤ 2s for any worktree

## Security

- **NFR-Sec-1** `worktree_path` parameter в POST /api/launch и /api/open-vscode whitelisted — accepted only if path присутствует в текущем `/api/index` response. Prevents arbitrary-path command injection.
- **NFR-Sec-2** UUID validated через regex `^[0-9a-f-]{36}$` перед использованием в `claude --resume <uuid>` argv. Argv-based passing предотвращает shell-injection: `wt.exe ... -- pwsh -Command "claude --resume <uuid>"` парсит uuid как отдельный argv element, не как shell-substituted строка.
- **NFR-Sec-3** Default bind `127.0.0.1`. Network access (через `0.0.0.0`) — opt-in только если пользователь явно установил `$env:WT_DASHBOARD_BIND=0.0.0.0`.
- **NFR-Sec-4** Никаких arbitrary-shell-execution endpoints. POST /api/launch строит argv programmatically (wt.exe spawn chain), не передаёт user input в shell. POST /api/open-vscode только `code <whitelisted-path>`.
- **NFR-Sec-5** `$env:SP_TERMINAL_CMD` template (опционально) парсится с `{cwd}` и `{cmd}` placeholders, остальные подстановки запрещены — защита от template injection.

## Reliability

- **NFR-Rel-1** Server PID lock prevents double-spawn — `start-server.ps1` idempotent через `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id` liveness check.
- **NFR-Rel-2** SessionStart hook fail-open: ошибка autostart не должна блокировать Claude Code session start.
- **NFR-Rel-3** Каждый spawn в /api/launch — independent detached process. Закрытие сервера не убивает spawned терминалы. Закрытие терминала не влияет на сервер.
- **NFR-Rel-4** ETag/304 caching не должен возвращать stale data — server cache TTL 8s для /api/claude, 5s для /api/index, 2s для max_mtime.
- **NFR-Rel-5** Frontend SWR cache invalidates на mtime change — `localStorage["session_pilot_v1_<id>"].mtime` !== server's `claude_max_mtime` triggers fresh fetch.

## Usability

- **NFR-Use-1** Keyboard accessible: Tab navigation, Enter/Space activates buttons, Esc closes modal (browser default for `<dialog>`)
- **NFR-Use-2** High-contrast mode via `@media (prefers-contrast: more)` — overrides muted greys with brighter shades for accessibility
- **NFR-Use-3** No external CDN dependencies — Tabulator + marked.js vendored locally в `ui/vendor/` для offline + privacy
- **NFR-Use-4** Tooltips on action buttons (hover) — explains каждую кнопку (Resume / Fresh / VSCode)
- **NFR-Use-5** Sort indicators visible (▲/▼ arrows on column headers) — Tabulator default

## Compatibility

- **NFR-Compat-1** Windows 10 (1809+) and Windows 11 — primary AND only target for v0.3. Python ≥3.10 (preinstalled via Store или manual). PowerShell ≥5.1 (preinstalled). Pwsh 7.x supported as fallback.
- **NFR-Compat-2** Terminal: `wt.exe` (Windows Terminal) preferred, `cmd.exe` fallback. `$env:SP_TERMINAL_CMD` template override для пользовательских терминалов (Alacritty, WezTerm, kitty).
- **NFR-Compat-3** Browsers: Chrome/Edge ≥120, Firefox ≥115 (для native `<dialog>` support). Safari out-of-scope (Windows-only platform).
- **NFR-Compat-4** Vendored libs: Tabulator 6.x (MIT, ~150KB), marked.js 12.x (MIT, ~30KB).
- **NFR-Compat-5** Python stdlib only — нет внешних pip dependencies (для лёгкого install через PowerShell).
- **NFR-Compat-6** WSL / Linux / macOS — **OUT OF SCOPE for v0.3**. Если потребуется кросс-платформа в будущем — см. cross-platform-research отчёт (node-pty + xterm.js рекомендация). v0.2 implementation в Zellij/WSL остаётся в git history.

## Anti-Halyava (без халявы)

- **NFR-Anti-1** Каждый skill scenario MUST end with verification step (poll Windows `Get-Process claude` + screenshot CONFIRMED через `mcp__claude-in-chrome__*`). Никаких fire-and-forget claims.
- **NFR-Anti-2** Competitor analysis ≥3 sources цитируются per feature claim, [VERIFIED]/[UNVERIFIED]/[ASSUMED] markers обязательны.
- **NFR-Anti-3** Pagination strategy выбран через benchmark (не догма) — measurable comparison задокументирован в DESIGN.md.
- **NFR-Anti-4** Все integration tests реальные (`subprocess.Popen` запускает server, `urllib.request` через HTTP) — не unit тесты с mocked HTTP.
