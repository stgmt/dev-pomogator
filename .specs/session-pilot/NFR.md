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
- **NFR-Sec-2** UUID validated через regex `^[0-9a-f-]{36}$` перед использованием в `claude --resume <uuid>` argv. Argv-based passing предотвращает shell-injection across all platforms: `subprocess.Popen([wt, "-d", cwd, "--", "pwsh", "-NoExit", "-Command", f"claude --resume {uuid}"])` на Windows и `subprocess.Popen([gnome_term, "--working-directory=" + cwd, "--", "bash", "-c", f"claude --resume {uuid}; exec bash"])` на Linux парсят uuid как отдельный argv element после whitelist validation. macOS osascript path использует `-e` arg list, не string-interpolation в AppleScript body.
- **NFR-Sec-3** Default bind `127.0.0.1`. Network access (через `0.0.0.0`) — opt-in только если пользователь явно установил env var `SP_DASHBOARD_BIND=0.0.0.0` (renamed from v0.3 `WT_DASHBOARD_BIND` — `WT` prefix was Windows-Terminal-specific; new name `SP_` (session-pilot) is platform-neutral).
- **NFR-Sec-4** Никаких arbitrary-shell-execution endpoints. POST /api/launch строит argv programmatically (platform-dispatched chain: wt/pwsh on Windows, terminal-emulator argv on Linux, osascript arg list on macOS, setsid argv in headless), не передаёт user input в shell-interpolated context. POST /api/open-vscode только `code <whitelisted-path>` (cross-platform `code` binary on PATH).
- **NFR-Sec-5** `$SP_TERMINAL_CMD` template (опционально, all platforms) парсится с `{cwd}` и `{cmd}` placeholders, остальные подстановки запрещены — защита от template injection. Template обязан декомпозироваться в argv через `shlex.split` (POSIX) / `subprocess.list2cmdline` (Windows) — никогда не вызывается через `shell=True`.

## Reliability

- **NFR-Rel-1** Server PID lock prevents double-spawn — installer scripts (`start-server.ps1` / `start-server.sh`) idempotent через platform-specific state dir + liveness check:
  - Windows: `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id $pid -ErrorAction SilentlyContinue` alive check.
  - Linux/macOS: `${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot/server.pid` (XDG Base Directory spec) + `kill -0 $pid 2>/dev/null` alive check.
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

- **NFR-Compat-1** Cross-platform native (v0.4 de-pivot from v0.3 Windows-only). Supported targets:
  - **Windows**: Win 10 (1809+) / Win 11. PowerShell ≥5.1 (preinstalled) or pwsh 7.x.
  - **Linux**: any glibc-based distro (Ubuntu 22.04+, Fedora 38+, Arch). X11, Wayland, **AND headless** (CI/SSH/tmux-only sessions без GUI). bash ≥4.x.
  - **macOS**: 12 (Monterey)+. zsh (default) or bash. AppleScript for Terminal/iTerm2 dispatch.
  - Python ≥3.10 везде (preinstalled on macOS/Linux, manual install via Store/installer on Windows).
- **NFR-Compat-2** Terminal spawn — platform-dispatched native chain (no Zellij, no tmux requirement, no WSL):
  - **Windows**: `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "claude ..."` (Windows Terminal preferred) → `wt.exe ... -- powershell.exe` (PS 5.1 fallback) → `cmd.exe /c start "" pwsh.exe ...` (no-WT fallback).
  - **Linux GUI**: probe in order `$TERMINAL` env var → `gnome-terminal --working-directory=<cwd> -- bash -c "claude ...; exec bash"` → `konsole --workdir <cwd> -e bash -c ...` → `alacritty --working-directory <cwd> -e bash -c ...` → `kitty --directory <cwd> bash -c ...` → `wezterm start --cwd <cwd> -- bash -c ...` → `xfce4-terminal --working-directory=<cwd> -e "bash -c ..."` → `tilix -w <cwd> -e "bash -c ..."` → `terminator --working-directory=<cwd> -e "bash -c ..."` → `xterm -e "cd <cwd> && claude; bash"`.
  - **Linux headless** (`$DISPLAY` AND `$WAYLAND_DISPLAY` both empty, OR no GUI terminal found): `setsid nohup bash -c "cd <cwd> && claude" </dev/null >/dev/null 2>&1 &` — fully detached background process; PID captured via `$!`. Returns `{ok: true, method: "headless-setsid", pid: int}`.
  - **macOS**: `osascript -e 'tell app "Terminal" to do script "cd <cwd> && claude ..."'` (Terminal.app) → `osascript -e 'tell app "iTerm2" to ...'` (iTerm2 detect).
  - **All platforms**: `$SP_TERMINAL_CMD` env var template override (placeholders `{cwd}` and `{cmd}`). Same semantics regardless of OS, e.g. `SP_TERMINAL_CMD="alacritty --working-directory {cwd} -e bash -c '{cmd}'"`.
- **NFR-Compat-3** Browsers: Chrome/Edge ≥120, Firefox ≥115 (для native `<dialog>` support). Safari ≥15.4 supported on macOS (native `<dialog>` shipped in 15.4, 2022-03-14).
- **NFR-Compat-4** Vendored libs: Tabulator 6.x (MIT, ~150KB), marked.js 12.x (MIT, ~30KB).
- **NFR-Compat-5** Python stdlib only — нет внешних pip dependencies. OS detection via `sys.platform` (`win32` / `linux` / `darwin`); terminal probe via `shutil.which()`. Subprocess spawn cross-platform via `subprocess.Popen` with platform-conditional argv build.
- **NFR-Compat-6** WSL — supported as Linux target (it IS Linux from Python's PoV). When session-pilot runs inside WSL, terminal chain probes Linux terminals; `claude` invocation works against POSIX paths (`/mnt/d/...` or `~/foo`). Mixing WSL and Windows-native invocations of the same project (via /mnt/d) is supported because path encoder generates BOTH POSIX (`-mnt-d-repos-foo`) and Windows (`D--repos-foo`) variants when path is recognized as a /mnt/<drive>/ mount.

## Anti-Halyava (без халявы)

- **NFR-Anti-1** Каждый skill scenario MUST end with verification step (poll Windows `Get-Process claude` + screenshot CONFIRMED через `mcp__claude-in-chrome__*`). Никаких fire-and-forget claims.
- **NFR-Anti-2** Competitor analysis ≥3 sources цитируются per feature claim, [VERIFIED]/[UNVERIFIED]/[ASSUMED] markers обязательны.
- **NFR-Anti-3** Pagination strategy выбран через benchmark (не догма) — measurable comparison задокументирован в DESIGN.md.
- **NFR-Anti-4** Все integration tests реальные (`subprocess.Popen` запускает server, `urllib.request` через HTTP) — не unit тесты с mocked HTTP.
