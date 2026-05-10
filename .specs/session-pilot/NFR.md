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
- **NFR-Sec-2** UUID validated через regex `^[0-9a-f-]{36}$` перед инжекцией в Zellij
- **NFR-Sec-3** Default bind `127.0.0.1`. Network access (через `0.0.0.0` или netsh portproxy) — opt-in только для localhost-equivalent (WSL→Windows host bridge)
- **NFR-Sec-4** Никаких arbitrary-shell-execution endpoints. POST /api/launch ограничен предопределённым decision tree (write-chars OR layout spawn). POST /api/open-vscode только `code <path>`.
- **NFR-Sec-5** KDL temp файлы (для new-session layouts) создаются с `mkstemp` + chmod 600, unlinked через 60s

## Reliability

- **NFR-Rel-1** Server PID lock prevents double-spawn — start-server.sh idempotent
- **NFR-Rel-2** SessionStart hook fail-open: ошибка autostart не должна блокировать Claude Code session start
- **NFR-Rel-3** Cleanup tmp KDL files через `threading.Timer(60, unlink)` — нет накопления tmp файлов
- **NFR-Rel-4** ETag/304 caching не должен возвращать stale data — server cache TTL 8s для /api/claude, 5s для /api/index, 2s для max_mtime
- **NFR-Rel-5** Frontend SWR cache invalidates на mtime change — `localStorage["session_pilot_v1_<id>"].mtime` !== server's `claude_max_mtime` triggers fresh fetch

## Usability

- **NFR-Use-1** Keyboard accessible: Tab navigation, Enter/Space activates buttons, Esc closes modal (browser default for `<dialog>`)
- **NFR-Use-2** High-contrast mode via `@media (prefers-contrast: more)` — overrides muted greys with brighter shades for accessibility
- **NFR-Use-3** No external CDN dependencies — Tabulator + marked.js vendored locally в `ui/vendor/` для offline + privacy
- **NFR-Use-4** Tooltips on action buttons (hover) — explains каждую кнопку (Resume / Fresh / VSCode / Zellij)
- **NFR-Use-5** Sort indicators visible (▲/▼ arrows on column headers) — Tabulator default

## Compatibility

- **NFR-Compat-1** Windows 11 + WSL2 Ubuntu (primary target)
- **NFR-Compat-2** Linux native (Ubuntu/Fedora/Arch) — Python 3.10+ + Zellij ≥0.44.2
- **NFR-Compat-3** Browsers: Chrome/Edge ≥120, Firefox ≥115, Safari ≥17 (для native `<dialog>` support)
- **NFR-Compat-4** Vendored libs: Tabulator 6.x (MIT, ~150KB), marked.js 12.x (MIT, ~30KB)
- **NFR-Compat-5** Python stdlib only — нет внешних pip dependencies (для лёгкого install)
- **NFR-Compat-6** Playwright frontend e2e (`test_frontend_e2e.py`) is best-effort on WSL2 due to documented browser-teardown vs `setsid` race in the HTTP handler thread — see RESEARCH.md Risk table for revisit triggers (Popen `start_new_session=True`, off-thread spawn worker, WSL2-primary CI shift). Test validates the JS→fetch→backend chain (POST 200 / `ok: true` / valid `method`) as the actual contract; trailing spawn verification gracefully degrades to `SKIP-spawn-verify` with diagnostic dump. Backend correctness is independently asserted by `test_e2e.py` via curl (deterministic, no browser).

## Anti-Halyava (без халявы)

- **NFR-Anti-1** Каждый skill scenario MUST end with verification step (poll `zellij list-sessions` + screenshot CONFIRMED через `mcp__claude-in-chrome__*`). Никаких fire-and-forget claims.
- **NFR-Anti-2** Competitor analysis ≥3 sources цитируются per feature claim, [VERIFIED]/[UNVERIFIED]/[ASSUMED] markers обязательны
- **NFR-Anti-3** Pagination strategy выбран через benchmark (не догма) — measurable comparison задокументирован в DESIGN.md
- **NFR-Anti-4** Все integration tests реальные (`spawnSync` запускает server, `curl` через subprocess) — не unit тесты с mocked HTTP
