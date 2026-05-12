Feature: SP001_session_pilot_dashboard
  Cross-platform multi-repo worktree dashboard with Claude session indicators, one-click `claude --resume` launch into a new native terminal (or background-detached process on headless Linux). v0.4 — no Zellij, no tmux dependency, no WSL bridge; each OS uses its native terminal stack (Windows Terminal / gnome-terminal etc. / Terminal.app+iTerm2).

  Background:
    Given session-pilot server is running on port 8083 (Python stdlib, host OS Windows OR Linux OR macOS)
    And there are git worktrees configured under <repo-root> (e.g. D:\repos\ on Windows, ~/repos/ on Linux/macOS)

  # @feature1
  Scenario: SP002_fast_index_response
    Given dashboard server has warm /api/index cache
    When user requests "GET /api/index"
    Then response status SHALL be 200
    And response time SHALL be less than 150ms
    And response body SHALL contain array of worktree rows with claude_max_mtime field

  # @feature2
  Scenario: SP003_claude_endpoint_returns_top5
    Given a worktree at D:\repos\foo has 8 JSONL files in %USERPROFILE%\.claude\projects\D--repos-foo
    When user requests "GET /api/claude?path=D:\repos\foo"
    Then response SHALL contain claude_sessions array with 5 most-recently modified entries
    And each entry SHALL include uuid, last_message, last_message_role, last_message_ts, msg_count

  # @feature3
  Scenario: SP004_etag_304_path
    Given /api/claude returned ETag W/"1778361564" for path X
    When user requests "GET /api/claude?path=X" with header "If-None-Match: W/\"1778361564\""
    Then response status SHALL be 304
    And response body SHALL be empty
    And response time SHALL be less than 5ms

  # @feature4 @windows
  Scenario: SP005_resume_windows_wt
    Given sys.platform is "win32"
    And `wt.exe` is on PATH
    And UUID "abc-def-1234-5678" is the last session for D:\repos\foo
    When user POSTs to "/api/launch" with body {worktree_path: "D:\\repos\\foo", mode: "resume", uuid: "abc-def-1234-5678"}
    Then backend SHALL spawn detached process: `wt.exe -d D:\repos\foo -- pwsh.exe -NoExit -Command "claude --resume abc-def-1234-5678"`
    And response SHALL be {ok: true, method: "wt-spawn-pwsh", pid: <int>}
    And a new Windows Terminal window SHALL be visible with cwd=D:\repos\foo running claude

  # @feature4 @windows
  Scenario: SP006_resume_windows_cmd_fallback
    Given sys.platform is "win32"
    And `wt.exe` is NOT on PATH (older Windows 10 without Windows Terminal)
    When user POSTs to "/api/launch" with mode "resume" for D:\repos\bar
    Then backend SHALL spawn detached: `cmd.exe /c start "" pwsh.exe -NoExit -Command "claude --resume <uuid>"`
    And response SHALL be {ok: true, method: "cmd-fallback", pid: <int>}

  # @feature4 @feature21 @linux
  Scenario Outline: SP005L_resume_linux_gui_<term>
    Given sys.platform is "linux"
    And $DISPLAY is set to ":0"
    And only the terminal "<term>" is found on PATH (others stubbed missing)
    When user POSTs to "/api/launch" with body {worktree_path: "/home/user/repos/foo", mode: "resume", uuid: "abc-def"}
    Then backend SHALL spawn detached: `<spawn_argv>`
    And response SHALL be {ok: true, method: "linux-<term>", pid: <int>}

    Examples:
      | term            | spawn_argv                                                                                     |
      | gnome-terminal  | gnome-terminal --working-directory=/home/user/repos/foo -- bash -c "claude --resume abc-def; exec bash" |
      | konsole         | konsole --workdir /home/user/repos/foo -e bash -c "claude --resume abc-def; exec bash"          |
      | alacritty       | alacritty --working-directory /home/user/repos/foo -e bash -c "claude --resume abc-def; exec bash" |
      | kitty           | kitty --directory /home/user/repos/foo bash -c "claude --resume abc-def; exec bash"             |
      | wezterm         | wezterm start --cwd /home/user/repos/foo -- bash -c "claude --resume abc-def; exec bash"        |
      | xfce4-terminal  | xfce4-terminal --working-directory=/home/user/repos/foo -e "bash -c 'claude --resume abc-def; exec bash'" |
      | tilix           | tilix -w /home/user/repos/foo -e "bash -c 'claude --resume abc-def; exec bash'"                 |
      | terminator      | terminator --working-directory=/home/user/repos/foo -e "bash -c 'claude --resume abc-def; exec bash'" |
      | xterm           | xterm -e "cd /home/user/repos/foo && claude --resume abc-def; bash"                             |

  # @feature4 @feature21 @linux @headless
  Scenario: SP005LH_resume_linux_headless_setsid
    Given sys.platform is "linux"
    And $DISPLAY is empty
    And $WAYLAND_DISPLAY is empty
    When user POSTs to "/api/launch" with body {worktree_path: "/home/user/repos/bar", mode: "resume", uuid: "xyz-789"}
    Then backend SHALL spawn fully detached via subprocess.Popen with start_new_session=True
    And argv SHALL be ["setsid", "nohup", "bash", "-c", "cd /home/user/repos/bar && claude --resume xyz-789"]
    And stdin/stdout/stderr SHALL be redirected to /dev/null
    And response SHALL be {ok: true, method: "headless-setsid", pid: <int>}
    And spawned process SHALL survive server restart (verified via `kill -0 <pid>` after server stop)

  # @feature4 @feature21 @linux @headless
  Scenario: SP005LH_fallback_when_all_gui_terminals_missing
    Given sys.platform is "linux"
    And $DISPLAY is set to ":0"
    And NO GUI terminal (gnome-terminal/konsole/alacritty/kitty/wezterm/xfce4-terminal/tilix/terminator/xterm) is on PATH
    When user POSTs to "/api/launch" for /home/user/repos/baz
    Then backend SHALL fall back to setsid+nohup detach
    And response SHALL be {ok: true, method: "headless-setsid", pid: <int>}

  # @feature4 @feature21 @darwin
  Scenario: SP005D_resume_macos_terminal_app
    Given sys.platform is "darwin"
    And iTerm2 is NOT a running process (per System Events check)
    When user POSTs to "/api/launch" for /Users/stigm/repos/foo with mode "resume" uuid "abc"
    Then backend SHALL invoke `osascript -e 'tell app "Terminal" to do script "cd /Users/stigm/repos/foo && claude --resume abc"'`
    And response SHALL be {ok: true, method: "darwin-terminal", pid: <int>}
    And a new Terminal.app window SHALL open with cwd set

  # @feature4 @feature21 @darwin
  Scenario: SP005D_resume_macos_iterm2_preferred_when_running
    Given sys.platform is "darwin"
    And iTerm2 IS a running process
    When user POSTs to "/api/launch" for /Users/stigm/repos/bar
    Then backend SHALL invoke `osascript -e 'tell app "iTerm2" to create window with default profile command "claude --resume <uuid>"'`
    And response SHALL be {ok: true, method: "darwin-iterm2", pid: <int>}

  # @feature4 @feature21
  Scenario: SP005E_env_override_takes_precedence_on_any_os
    Given $SP_TERMINAL_CMD is set to "alacritty --working-directory {cwd} -e bash -c '{cmd}'"
    When user POSTs to "/api/launch" for any worktree on any OS
    Then backend SHALL substitute {cwd} and {cmd} placeholders
    And SHALL decompose template via shlex.split (POSIX) or list-form (Windows) — NEVER shell=True
    And response SHALL be {ok: true, method: "env-override", pid: <int>}

  # @feature4 @feature21
  Scenario: SP005F_unsupported_platform_clean_error
    Given sys.platform is "freebsd" (or any other value not in {win32, linux, darwin})
    And $SP_TERMINAL_CMD is not set
    When user POSTs to "/api/launch"
    Then backend SHALL respond with {ok: false, error: "unsupported platform: freebsd"}
    And SHALL NOT raise an exception or crash the server

  # @feature4
  Scenario: SP007_action_button_idempotency_lock
    Given user clicked [▶ Resume] for session X
    When user clicks [▶ Resume] for session X again within 5 seconds
    Then backend SHALL return cached response from previous click
    And SHALL NOT inject duplicate "claude --resume" command

  # @feature9
  Scenario: SP008_pagination_top_20_first
    Given 45 worktrees configured (9 with Claude history)
    When user opens dashboard cold (empty localStorage)
    Then top-20 rows sorted by claude_max_mtime DESC SHALL render within 1 second
    And remaining 25 rows SHALL show "scanning..." placeholder
    And background workers SHALL continue enriching without blocking UI

  # @feature8
  Scenario: SP009_multi_key_sort_repo_then_activity
    Given table shows 45 rows
    When user clicks "Repo" column header
    Then table SHALL sort alphabetically by Repo column
    When user shift-clicks "Last Activity" column header
    Then table SHALL maintain primary sort by Repo
    And SHALL apply secondary sort by Last Activity DESC within each Repo group

  # @feature10
  Scenario: SP010_modal_opens_on_last_message_click
    Given a row has claude_sessions[0] with last_message="some long text..."
    When user clicks the "Last message" cell
    Then native <dialog> SHALL open via dialog.showModal()
    And content SHALL be rendered through marked.js
    And [Prev] and [Next] buttons SHALL be visible
    And ESC key SHALL close the dialog

  # @feature12
  Scenario: SP011_idle_time_human_readable
    Given a row has claude_last_modified 1777 minutes ago
    When dashboard renders the row
    Then "Last activity" cell SHALL display "1d 5h 37m"
    And tooltip SHALL show absolute ISO8601 timestamp
    And SHALL NOT display "1777m"

  # @feature13 @windows
  Scenario: SP012W_autostart_idempotent_windows
    Given sys.platform is "win32"
    And dashboard server is already running with PID 18879
    And $env:LOCALAPPDATA\session-pilot\server.pid contains "18879"
    When SessionStart hook fires (Claude Code session starts)
    Then hook command SHALL be `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1`
    And script SHALL read PID from $env:LOCALAPPDATA\session-pilot\server.pid
    And SHALL run `Get-Process -Id 18879 -ErrorAction SilentlyContinue` (returns alive)
    And SHALL log "already running" AND exit 0 without spawning duplicate

  # @feature13 @linux @darwin
  Scenario: SP012P_autostart_idempotent_posix
    Given sys.platform is "linux" OR "darwin"
    And dashboard server is already running with PID 18879
    And ${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot/server.pid contains "18879"
    When SessionStart hook fires
    Then hook command SHALL be `bash start-server.sh`
    And script SHALL read PID from the state dir file
    And SHALL run `kill -0 18879 2>/dev/null` (returns 0 → alive)
    And SHALL log "already running" AND exit 0 without spawning duplicate

  # @feature13 @windows
  Scenario: SP012W_autostart_spawns_when_stale_windows
    Given sys.platform is "win32"
    And $env:LOCALAPPDATA\session-pilot\server.pid contains stale PID "11111" (dead process)
    When SessionStart hook fires
    Then script SHALL detect `Get-Process -Id 11111` returns $null
    And SHALL spawn `Start-Process -WindowStyle Hidden python.exe -ArgumentList "server.py" -PassThru`
    And SHALL write new PID to server.pid
    And SHALL poll http://127.0.0.1:8083/api/health until 200 (timeout 2s)

  # @feature13 @linux @darwin
  Scenario: SP012P_autostart_spawns_when_stale_posix
    Given sys.platform is "linux" OR "darwin"
    And state dir server.pid contains stale PID "22222"
    When SessionStart hook fires
    Then script SHALL detect `kill -0 22222` returns non-zero
    And SHALL spawn `setsid nohup python3 server.py >/dev/null 2>&1 &`
    And SHALL write new PID
    And SHALL curl /api/health until 200 (timeout 2s)

  # @feature14
  Scenario: SP013_swr_cache_skips_fetch_for_unchanged_rows
    Given localStorage has 45 cached rows from previous load
    And server's claude_max_mtime is unchanged for 38 paths
    When user reloads dashboard
    Then 38 rows SHALL render instantly from localStorage without /api/claude fetch
    And only 7 stale rows SHALL trigger /api/claude fetch with If-None-Match header

  # @feature15 @windows
  Scenario: SP014W_install_idempotent_windows
    Given fresh Windows machine with Python 3.10+ and PowerShell 5.1+
    And session-pilot package downloaded to D:\repos\dev-pomogator
    When user runs `pwsh -File extensions/session-pilot/install.ps1`
    Then script SHALL install Python deps idempotently (stdlib-only → no-op)
    And SHALL register SessionStart hook `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` в %USERPROFILE%\.claude\settings.json
    And `Invoke-WebRequest http://127.0.0.1:8083/api/health` SHALL return 200 within 5s
    And re-running the same script SHALL detect existing install via {hook present AND /api/health 200} AND exit 0 без модификации

  # @feature15 @linux @darwin
  Scenario: SP014P_install_idempotent_posix
    Given fresh Linux OR macOS machine with Python ≥3.10 and bash ≥4
    And session-pilot package downloaded to ~/repos/dev-pomogator
    When user runs `bash extensions/session-pilot/install.sh`
    Then script SHALL install Python deps idempotently (stdlib-only → no-op)
    And SHALL register SessionStart hook `bash start-server.sh` в ~/.claude/settings.json
    And `curl -fsS http://127.0.0.1:8083/api/health` SHALL return 200 within 5s
    And re-running the same script SHALL detect existing install AND exit 0 без модификации

  # @feature17
  Scenario Outline: SP015_path_encoding_cross_platform
    Given worktree path is "<path>"
    And sys.platform is "<sys_platform>"
    When encode_path_for_claude("<path>") is called
    Then result[0] SHALL be "<canonical>"
    And result SHALL contain ALL of "<fallbacks>" (comma-separated, may be empty)

    Examples:
      | path                                          | sys_platform | canonical                                      | fallbacks                |
      | D:\repos\lm-saas                              | win32        | D--repos-lm-saas                               |                          |
      | /home/user/repos/foo                          | linux        | -home-user-repos-foo                           |                          |
      | /Users/stigm/repos/foo                        | darwin       | -Users-stigm-repos-foo                         |                          |
      | /mnt/d/repos/foo                              | linux        | -mnt-d-repos-foo                               | D--repos-foo             |
      | \\wsl.localhost\Ubuntu\home\user\foo          | win32        | --wsl.localhost-Ubuntu-home-user-foo           | -home-user-foo           |
      | C:\Users\stigm\.cursor\worktrees\bar          | win32        | C--Users-stigm--cursor-worktrees-bar           |                          |

  # @feature19
  Scenario: SP016_diagnostic_cli_lm_saas
    Given lm-saas worktree has youngest JSONL 26 seconds old
    When user runs `python server.py --diagnose-livecycle D:\repos\lm-saas`
    Then output SHALL list all encoding variants generated for the path
    And SHALL list all base dirs scanned (%USERPROFILE%\.claude\projects)
    And SHALL list per-JSONL match with full path, mtime, age, size
    And SHALL print verdict "🟢 LIVE — youngest JSONL is 26s old (< 300s threshold)"

  # @feature20
  Scenario: SP017_configurable_live_threshold_300s_default
    Given default LIVE_THRESHOLD_SEC=300
    And lm-saas youngest JSONL is 146 seconds old
    When server checks running_now flag for lm-saas
    Then claude_running_now SHALL be true (146 < 300)
    And dashboard SHALL show LIVE 🟢 indicator

  # ─────────────────────────────────────────────────────────────────────
  # Implemented Phase 3 — backfilled scenarios for previously-untagged
  # features. T06/T07 already DONE; covered by tests/test_e2e.py.
  # ─────────────────────────────────────────────────────────────────────

  # @feature7
  Scenario: SP020_health_endpoint_returns_uptime_and_live_flag
    Given server has been running for 1234 seconds
    And lm-saas youngest JSONL is 86 seconds old
    When client requests GET /api/health
    Then response SHALL contain {ok: true, uptime_sec: 1234, live: true}

  # @feature11
  Scenario: SP021_open_vscode_endpoint_spawns_code_with_path
    Given worktree at D:\repos\foo exists and is whitelisted
    When client POSTs /api/open-vscode {path: "D:\\repos\\foo"}
    Then server SHALL spawn "code.cmd D:\repos\foo" detached
    And SHALL return {ok: true, method: "code.cmd"}

  # @feature6
  Scenario: SP019_git_status_endpoint_returns_dirty_ahead_behind
    Given worktree at D:\repos\foo has 1 added file, 4 modified files, 1 untracked, 0 ahead, 0 behind
    And the worktree path is in the dashboard whitelist
    When client requests GET /api/git-status?path=D:\repos\foo
    Then response SHALL contain {added: 1, modified: 4, deleted: 0, untracked: 1, ahead: 0, behind: 0}
    And SHALL return HTTP 200

  # @feature5
  Scenario: SP018_get_message_endpoint_returns_msg_with_neighbors
    Given session has 10 messages indexed at /api/message?path=...&session=X&index=5
    And the worktree path is in the dashboard whitelist
    When client requests GET /api/message?path=D:\repos\foo&session=X&index=5&context=2
    Then response SHALL contain {messages: [{idx, role, text, ts}], total: 10, target_index: 5}
    And SHALL include 5 entries (target ± 2) with indices 3..7

  # ─────────────────────────────────────────────────────────────────────
  # Documentation-only stubs — no Cucumber/pytest-bdd runner is wired
  # for `.feature` execution in this project; these scenarios encode
  # acceptance criteria in prose form so audit FR_BDD_COVERAGE traces
  # FR ↔ BDD before implementation lands. Implementation lives in
  # TASKS.md tasks T28..T34 (v0.2 backlog). When a runner is wired in
  # T26+, these scenarios will need step-definitions written; until
  # then they are reference text, not executable tests.
  # ─────────────────────────────────────────────────────────────────────

  # @feature23 @windows
  Scenario: SP029_launcher_windows_creates_desktop_lnk
    Given sys.platform is "win32"
    And msedge.exe exists at "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    When user runs "pwsh -File extensions/session-pilot/tools/session-pilot/create-launcher.ps1"
    Then file "$env:USERPROFILE\Desktop\Session Pilot.lnk" SHALL exist
    And the .lnk TargetPath SHALL be the located msedge.exe path
    And the .lnk Arguments SHALL contain "--app=http://127.0.0.1:8083/"
    And the .lnk Arguments SHALL contain "--user-data-dir="
    And Explorer.exe SHALL be opened with the .lnk highlighted

  # @feature23 @linux
  Scenario: SP030_launcher_linux_creates_desktop_entry
    Given sys.platform is "linux"
    And "google-chrome" is on PATH
    When user runs "bash extensions/session-pilot/tools/session-pilot/create-launcher.sh"
    Then file "$HOME/.local/share/applications/session-pilot.desktop" SHALL exist
    And the file SHALL contain "Exec=" with "--app=http://127.0.0.1:8083/"
    And the file SHALL contain "Type=Application"
    And the file SHALL be marked executable (chmod +x)

  # @feature23 @darwin
  Scenario: SP031_launcher_macos_creates_app_bundle
    Given sys.platform is "darwin"
    And "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" exists
    When user runs "bash extensions/session-pilot/tools/session-pilot/create-launcher.sh"
    Then directory "$HOME/Applications/Session Pilot.app/Contents/MacOS" SHALL exist
    And file "$HOME/Applications/Session Pilot.app/Contents/Info.plist" SHALL contain "<key>CFBundleName</key><string>Session Pilot</string>"
    And file "$HOME/Applications/Session Pilot.app/Contents/MacOS/launcher" SHALL be marked executable
    And the launcher SHALL exec the browser with "--app=http://127.0.0.1:8083/"

  # @feature23
  Scenario: SP032_launcher_no_browser_clean_error
    Given no Chromium-family browser (Chrome/Edge/Chromium/Brave) is installed
    When user runs the platform-matching launcher script
    Then script SHALL exit with non-zero status
    And SHALL print message explaining browser not found and suggesting bookmark fallback
    And SHALL NOT create any partial launcher artifact

  # @feature23
  Scenario: SP033_launcher_idempotent_rerun
    Given a previous launcher artifact exists from earlier invocation
    When user re-runs the platform-matching launcher script
    Then script SHALL overwrite the existing artifact with current settings
    And SHALL exit 0
    And the new artifact SHALL reflect current $WT_DASHBOARD_PORT env override if set

  # @feature22
  Scenario: SP024_bootstrap_skill_orphan_worktree
    Given cwd is /home/user/repos/dev-pomogator-feat-x
    And `git worktree list` includes /home/user/repos/dev-pomogator-feat-x as non-primary worktree
    And file ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts" does NOT exist in cwd
    When user invokes skill "session-pilot-bootstrap" (via "/sp-bootstrap" or natural trigger phrase)
    Then skill SHALL present AskUserQuestion with choices {Bootstrap, Skip npm install, Cancel}
    When user selects "Bootstrap"
    Then skill SHALL run "npm install --no-audit --no-fund" if node_modules/ absent
    And SHALL run "npm run build"
    And SHALL run "node bin/cli.js install ."
    And SHALL verify ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts" now exists
    And SHALL respond with "bootstrap complete"

  # @feature22
  Scenario: SP025_bootstrap_skill_skip_when_main_worktree
    Given cwd is /home/user/repos/dev-pomogator (the main worktree per git worktree list first row)
    When user invokes skill "session-pilot-bootstrap"
    Then skill SHALL respond "main worktree already bootstrapped; skip"
    And SHALL NOT run any npm/build/install commands
    And SHALL exit 0

  # @feature22
  Scenario: SP026_bootstrap_skill_idempotent_rerun
    Given cwd is /home/user/repos/dev-pomogator-feat-x
    And file ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts" exists (previously bootstrapped)
    When user invokes skill "session-pilot-bootstrap" (without --force)
    Then skill SHALL respond "already bootstrapped"
    And SHALL NOT re-run installer
    And SHALL exit 0
    When user invokes skill "session-pilot-bootstrap" with --force flag
    Then skill SHALL re-run npm install + build + installer
    And SHALL respond with "bootstrap complete (forced)"

  # @feature22
  Scenario: SP027_bootstrap_skill_fails_outside_git_repo
    Given cwd is /tmp/random-non-git-dir
    And `git rev-parse --show-toplevel` exits with non-zero
    When user invokes skill "session-pilot-bootstrap"
    Then skill SHALL respond {ok: false, error: "not a git repository"}
    And SHALL exit 0 (non-fatal)
    And SHALL NOT attempt installer commands

  # @feature22
  Scenario: SP028_bootstrap_skill_reports_failed_step
    Given cwd is orphan worktree /home/user/repos/dev-pomogator-feat-y
    And `npm run build` will fail (e.g. tsc errors due to broken branch state)
    When user invokes skill "session-pilot-bootstrap" and chooses Bootstrap
    Then skill SHALL run npm install + npm run build (which fails)
    And SHALL respond with {ok: false, failed_step: "npm run build", exit_code: <int>, stderr: <tail>}
    And SHALL NOT attempt `node bin/cli.js install .`
    And SHALL NOT rollback (partial state OK — installer is idempotent)

  @v02
  # @feature16
  Scenario: SP022_skill_chrome_extension_verification
    Given .claude/skills/session-pilot/SKILL.md is installed
    When user invokes Skill("session-pilot") with verify task
    Then skill SHALL use mcp__claude-in-chrome__* (not local Playwright)
    And SHALL screenshot dashboard from real Chrome on Windows host
    And SHALL report row count + LIVE 🟢 indicator presence

  @v02
  # @feature18
  Scenario: SP023_competitive_analysis_artifact_present
    Given .specs/session-pilot/COMPETITIVE_ANALYSIS.md exists
    When auditor reads the file
    Then it SHALL enumerate >=7 alternatives (vibe-kanban, agent-of-empires, ccmanager, kanna, claudito, claude-code-web, claudecodeui)
    And SHALL contain a 30-feature master matrix
    And SHALL contain "Features WE LACK" backlog with P0/P1/P2/P3 priorities
    And SHALL contain "Features WE HAVE that they lack" differentiation list
