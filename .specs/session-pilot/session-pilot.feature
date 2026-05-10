Feature: SP001_session_pilot_dashboard
  Multi-repo worktree dashboard with Claude session indicators, one-click claude --resume launch into Zellij Web Client

  Background:
    Given session-pilot server is running on port 8083
    And Zellij Web Client is running on port 8082
    And there are git worktrees configured under D:/repos/

  # @feature1
  Scenario: SP002_fast_index_response
    Given dashboard server has warm /api/index cache
    When user requests "GET /api/index"
    Then response status SHALL be 200
    And response time SHALL be less than 150ms
    And response body SHALL contain array of worktree rows with claude_max_mtime field

  # @feature2
  Scenario: SP003_claude_endpoint_returns_top5
    Given a worktree at /mnt/d/repos/foo has 8 JSONL files in ~/.claude/projects
    When user requests "GET /api/claude?path=/mnt/d/repos/foo"
    Then response SHALL contain claude_sessions array with 5 most-recently modified entries
    And each entry SHALL include uuid, last_message, last_message_role, last_message_ts, msg_count

  # @feature3
  Scenario: SP004_etag_304_path
    Given /api/claude returned ETag W/"1778361564" for path X
    When user requests "GET /api/claude?path=X" with header "If-None-Match: W/\"1778361564\""
    Then response status SHALL be 304
    And response body SHALL be empty
    And response time SHALL be less than 5ms

  # @feature4
  Scenario: SP005_action_button_resume_existing_session
    Given Zellij session "foo__main" exists
    And UUID "abc-def-1234-5678" is the last session for /mnt/d/repos/foo
    When user POSTs to "/api/launch" with body {worktree_path: "/mnt/d/repos/foo", session_name: "foo__main", mode: "resume", uuid: "abc-def-1234-5678"}
    Then backend SHALL execute "zellij --session foo__main action focus-pane-id terminal_1 && action write-chars 'claude --resume abc-def-1234-5678\n'"
    And response SHALL be {ok: true, method: "write-chars", url: "http://localhost:8082/?session=foo__main"}

  # @feature4
  Scenario: SP006_action_button_resume_new_session
    Given Zellij session "bar__feat_x" does NOT exist
    When user POSTs to "/api/launch" with mode "resume" for that session
    Then backend SHALL render KDL layout to "/tmp/sp-<rand>.kdl"
    And SHALL execute "setsid zellij --session bar__feat_x --layout /tmp/sp-<rand>.kdl"
    And SHALL schedule unlink of temp file after 60 seconds

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

  # @feature13
  Scenario: SP012_session_start_hook_idempotent
    Given dashboard server is already running with PID 18879
    When SessionStart hook fires (Claude Code session starts)
    Then start-server.sh SHALL read /tmp/worktree-dashboard.pid
    And SHALL kill -0 18879 (alive)
    And SHALL exit 0 without spawning duplicate process

  # @feature14
  Scenario: SP013_swr_cache_skips_fetch_for_unchanged_rows
    Given localStorage has 45 cached rows from previous load
    And server's claude_max_mtime is unchanged for 38 paths
    When user reloads dashboard
    Then 38 rows SHALL render instantly from localStorage without /api/claude fetch
    And only 7 stale rows SHALL trigger /api/claude fetch with If-None-Match header

  # @feature15
  Scenario: SP014_cross_os_access_from_windows
    Given dashboard binds to 0.0.0.0:8083 in WSL
    And "netsh portproxy add v4tov4 listenport=8083 connectaddress=<WSL_IP>" is configured
    When user opens "http://localhost:8083" from Windows browser
    Then response SHALL be identical to "http://127.0.0.1:8083" from inside WSL

  # @feature17
  Scenario: SP015_path_encoding_covers_both_os_variants
    Given worktree path is "/mnt/d/repos/lm-saas"
    When encode_path_for_claude is called
    Then return value SHALL include "-mnt-d-repos-lm-saas"
    And SHALL include "D--repos-lm-saas"
    Because Claude Code on Windows writes JSONLs to D--repos-* when cwd is /mnt/d

  # @feature19
  Scenario: SP016_diagnostic_cli_lm_saas
    Given lm-saas worktree has youngest JSONL 26 seconds old
    When user runs "python3 server.py --diagnose-livecycle /mnt/d/repos/lm-saas"
    Then output SHALL list all encoding variants generated for the path
    And SHALL list all base dirs scanned
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
    Given worktree at /mnt/d/repos/foo exists
    When client POSTs /api/open-vscode {path: "/mnt/d/repos/foo"}
    Then server SHALL spawn "code /mnt/d/repos/foo" detached
    And SHALL return {ok: true, method: "spawn"}

  # @feature6
  Scenario: SP019_git_status_endpoint_returns_dirty_ahead_behind
    Given worktree at /mnt/d/repos/foo has 1 added file, 4 modified files, 1 untracked, 0 ahead, 0 behind
    And the worktree path is in the dashboard whitelist
    When client requests GET /api/git-status?path=/mnt/d/repos/foo
    Then response SHALL contain {added: 1, modified: 4, deleted: 0, untracked: 1, ahead: 0, behind: 0}
    And SHALL return HTTP 200

  # @feature5
  Scenario: SP018_get_message_endpoint_returns_msg_with_neighbors
    Given session has 10 messages indexed at /api/message?path=...&session=X&index=5
    And the worktree path is in the dashboard whitelist
    When client requests GET /api/message?path=/mnt/d/repos/foo&session=X&index=5&context=2
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
