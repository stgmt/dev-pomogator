Feature: CORE024 Worktree Setup Skill

  Background:
    Given dev-pomogator is installed
    And a fresh main worktree fixture is available at <tmp-main>
    And HOME env var is isolated to <tmp-home>

  # @feature1 — FR-1: atomic worktree+branch creation
  Scenario: CORE024_01 atomic worktree+branch creation from main
    Given branch "feat/new-feature" does not exist
    When skill is invoked with slug "new-feature"
    Then "git worktree add -b feat/new-feature <tmp-main-parent>/<tmp-main-basename>-new-feature" is executed exactly once
    And the new worktree path exists
    And the worktree's HEAD points to branch "feat/new-feature"
    And the branch was created off the main worktree's HEAD

  # @feature1 — FR-1: slug regex validation
  Scenario: CORE024_02 slug regex validation rejects invalid input
    When skill is invoked with slug "Invalid_Slug"
    Then skill exits with code 2
    And stdout contains "Invalid slug: must match ^[a-z][a-z0-9-]*[a-z0-9]$"
    And no git worktree was created

  # @feature1 — FR-1 + UC-4: idempotency on existing branch
  Scenario: CORE024_03 pre-flight detects existing branch and routes to idempotency flow
    Given branch "feat/existing" already exists
    When skill is invoked with slug "existing"
    Then "git show-ref --verify --quiet refs/heads/feat/existing" exits with code 0
    And skill prompts via AskUserQuestion with options "Reuse existing branch" or "Abort"
    And no "git worktree add -b" command is executed

  # @feature2 — FR-2: installer bootstrap with projectPath registration
  Scenario: CORE024_04 installer registers new worktree projectPath in global config
    Given worktree was created successfully
    When skill runs "node <main>/bin/cli.js --claude --all" with cwd set to the new worktree
    And installer exits with code 0
    Then "<tmp-home>/.dev-pomogator/config.json" contains the absolute path of the new worktree under installedExtensions[].projectPaths[]

  # @feature2 — FR-2: registration failure surfaces retry hint
  Scenario: CORE024_05 missing projectPath registration surfaces retry hint
    Given installer exited with code 0 but did not update config.json
    When skill checks "<tmp-home>/.dev-pomogator/config.json"
    Then stdout contains "Bootstrap incomplete — installer did not register projectPath"
    And stdout contains "Retry: cd <new-worktree> && node <main>/bin/cli.js --claude --all"

  # @feature3 — FR-3: self-heal emits JSONL line on missing target
  Scenario: CORE024_06 tsx-runner appends JSONL line when target script is missing
    Given orphan worktree without "<orphan>/.dev-pomogator/tools/"
    And no prior entry for this worktree in "<tmp-home>/.dev-pomogator/orphan-worktrees.jsonl"
    When any hook fires invoking tsx-runner-bootstrap.cjs with target ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts"
    Then exactly one new line is appended to orphan-worktrees.jsonl
    And the line contains valid JSON with fields ts, worktree_path, missing_script, hook_event, session_id

  # @feature3 — FR-3: stderr hint deduplication
  Scenario: CORE024_07 stderr hint emitted once per (worktree, session) tuple
    Given orphan worktree where the hint already appeared in current session
    When another hook fires with a missing target
    Then no additional stderr hint line is emitted
    And a new JSONL line is still appended

  # @feature3 — FR-3 + NFR-S5: no hardcoded npx URL in fallback
  Scenario: CORE024_08 no-living-main fallback omits hardcoded package identifier
    Given "<tmp-home>/.dev-pomogator/config.json" projectPaths list is empty
    And no path in config has a living bin/cli.js
    When tsx-runner-bootstrap.cjs emits its fallback hint
    Then stderr does not contain "stgmt/dev-pomogator" or "github:stgmt"
    And stderr contains "No living dev-pomogator main install found"

  # @feature4 — FR-4: Layer 0 creates env stub when absent
  Scenario: CORE024_09 env file created with stub template when absent
    Given "<tmp-home>/.dev-pomogator/worktree-setup.env" does not exist
    When skill is invoked with "--pr=draft"
    Then "<tmp-home>/.dev-pomogator/worktree-setup.env" exists
    And the file contains commented headers and empty "GH_OWNER=", "GH_REPO=", "GH_PROTOCOL=", "GH_HOST=" lines
    And each key has an inline comment naming its source command

  # @feature4 — FR-4: Layer 1 hit skips investigation
  Scenario: CORE024_10 valid env values skip investigation entirely
    Given "<tmp-home>/.dev-pomogator/worktree-setup.env" contains GH_OWNER and GH_REPO with valid values
    And "gh repo view <GH_OWNER>/<GH_REPO>" returns exit code 0
    When skill is invoked with "--pr=draft"
    Then no "gh repo view --json url,owner,name" investigation call is made
    And no AskUserQuestion prompt is shown

  # @feature4 — FR-4: Layer 2 investigation persists to env
  Scenario: CORE024_11 successful Layer 2 resolution persists values to env file
    Given env file is missing or empty
    And "git remote get-url origin" returns a valid GitHub URL
    And "gh repo view" validation of the parsed owner/repo returns 200
    When skill resolves via Layer 2
    Then "<tmp-home>/.dev-pomogator/worktree-setup.env" GH_OWNER and GH_REPO are populated with the resolved values
    And the env file's comment headers are preserved unchanged

  # @feature4 — FR-4: no --pr flag → zero side effects
  Scenario: CORE024_12 invocation without --pr flag touches no env, no remote, no gh
    When skill is invoked without "--pr=draft"
    Then "<tmp-home>/.dev-pomogator/worktree-setup.env" remains unchanged
    And no "git push", "gh", or "git remote add" command is executed

  # @feature5 — FR-5: gh auth pre-flight refusal
  Scenario: CORE024_13 gh auth failure refuses before git worktree add
    Given "gh auth status" exits with non-zero code
    When skill is invoked with "--pr=draft"
    Then skill exits with code 3
    And stdout contains "Run `gh auth login` first"
    And no "git worktree add" command is executed
    And no installer is invoked

  # @feature6 — FR-6: doctor exit-code mapping in full mode
  Scenario: CORE024_14 doctor exit codes map to status strings deterministically
    Given a fully-healthy worktree (tools present, registered, no missing hook scripts)
    When "worktree-doctor.cjs" is run
    Then exit code is 0
    And stdout last line is "status=OK"

  # @feature6 — FR-6: doctor quick mode meets performance budget
  Scenario: CORE024_15 doctor --quick completes within 50ms
    Given a fully-healthy worktree
    When "worktree-doctor.cjs --quick" is run with timing measurement
    Then exit code is 0
    And measured duration is less than 50 milliseconds
    And stdout last line is "status=OK"

  # @feature7 — FR-7: session-pilot integration contract (cross-worktree, deferred verify)
  Scenario: CORE024_16 worktree-doctor exposes contract for session-pilot indexer
    Given session-pilot indexer is invoked against the worktree
    When indexer calls "worktree-doctor.cjs --quick" for the worktree path
    Then doctor exits 0 or 1 with stdout containing "tools_present=true" or "tools_present=false"
    And the indexer can derive a "tools_present" boolean from the exit code

  # @feature8 — FR-8: warn flow when invoked from sibling
  Scenario: CORE024_17 invocation from sibling worktree triggers warn flow
    Given CWD is a sibling worktree (not main)
    When skill is invoked with slug "another-feature"
    Then skill prints a warning identifying current vs main paths
    And AskUserQuestion is invoked with options "Continue from main" and "Abort"

  # @feature8 — FR-8: continue-from-main reroots operations to main
  Scenario: CORE024_18 continue-from-main reroots subsequent git/installer ops
    Given the warn flow from CORE024_17 is active
    When user selects "Continue from main"
    Then all subsequent "git worktree add" calls use main worktree path (not current sibling) as the git root
    And new sibling worktree path is "<main-parent>/<main-basename>-another-feature" (sibling of main, not chained off current sibling)

  # @feature9 — FR-10: copy gitignored root env file into worktree
  Scenario: CORE024_19 root .env.test is copied into the fresh worktree
    Given main worktree contains a gitignored root file ".env.test"
    And bootstrap (FR-2) has completed for the new worktree
    When env-sync runs
    Then "<new-worktree>/.env.test" exists
    And its content is byte-identical to main's ".env.test"

  # @feature9 — FR-10: .devcontainer/.env regenerated, not copied
  Scenario: CORE024_20 .devcontainer/.env is regenerated with unique ports
    Given main worktree contains ".devcontainer/.env" with HOST_NOVNC_PORT=6080
    When env-sync runs for the new worktree
    Then "<new-worktree>/.devcontainer/.env" exists
    And its HOST_NOVNC_PORT differs from main's 6080
    And ".devcontainer/.env" was not byte-copied from main

  # @feature9 — FR-10 + NFR-S6: secret-bearing file triggers stderr warning
  Scenario: CORE024_21 copying a secret-bearing env file emits one stderr warning
    Given main worktree contains a gitignored env file whose contents match a secret pattern
    When env-sync copies it into the new worktree
    Then stderr contains exactly one warning line naming that file
    And stderr does not contain the secret value itself

  # @feature9 — FR-10 + NFR-R6: idempotent skip when target already exists
  Scenario: CORE024_22 existing target env file is skipped without overwrite
    Given "<new-worktree>/.env.test" already exists with hand-edited content
    When env-sync runs again
    Then the existing "<new-worktree>/.env.test" is left unchanged
    And the env-sync audit log records action "skipped" for that file

  # @feature9 — FR-10 + NFR-S5: candidate selection is dynamic, not hardcoded
  Scenario: CORE024_23 env-sync discovers candidates dynamically by glob + check-ignore
    Given main worktree contains a gitignored env file named ".env.local" (not ".env.test")
    When env-sync runs for the new worktree
    Then "<new-worktree>/.env.local" exists with content copied from main
    And no hardcoded ".env.test" literal governs the selection

  # @feature10 — FR-11: npm install when node_modules absent
  Scenario: CORE024_24 npm install runs when worktree node_modules is absent
    Given a new worktree with root "package.json" and no "node_modules/"
    And env-sync (FR-10) has completed
    When build/deps-sync runs without "--skip-build"
    Then "npm install" is executed with cwd set to the new worktree
    And it runs before doctor verification

  # @feature10 — FR-11: npm run build when dist absent or stale
  Scenario: CORE024_25 npm run build runs when dist is absent or stale
    Given the worktree has "node_modules/" present
    And "dist/" is absent or a "src/" file is newer than the newest "dist/" file
    When build/deps-sync runs
    Then "npm run build" is executed in the worktree

  # @feature10 — FR-11: --skip-build opt-out
  Scenario: CORE024_26 --skip-build skips install and build and prints manual commands
    Given a new worktree without "node_modules/" or "dist/"
    When skill is invoked with "--skip-build"
    Then no "npm install" or "npm run build" command is executed
    And stdout contains "cd <worktree> && npm install && npm run build"

  # @feature10 — FR-11 + NFR-R3: build failure is best-effort
  Scenario: CORE024_27 build failure prints retry hint and preserves the worktree
    Given "npm run build" will exit with a non-zero code
    When build/deps-sync runs
    Then stdout contains the failure and a retry command
    And the new worktree is not deleted
    And the skill continues to the next step

  # @feature1 — FR-1: target directory collision (not a worktree)
  Scenario: CORE024_28 existing target directory that is not a worktree is refused
    Given the target path "<main-parent>/<main-basename>-taken" already exists on disk
    And that path is not listed in "git worktree list --porcelain"
    When skill is invoked with slug "taken"
    Then skill exits with code 2
    And stdout contains "already exists and is not a worktree"
    And no "git worktree add" command is executed

  # @feature2 — FR-2: installer resolved to ancestor repo
  Scenario: CORE024_29 installer resolving to an ancestor repo is detected and refused
    Given the new worktree is nested under another git repository
    And the installer's findRepoRoot resolves to that ancestor, not the worktree
    When skill verifies the registered projectPath
    Then stdout contains "not the worktree"
    And skill does not accept the wrong-root bootstrap

  # @feature11 — FR-12: --devcontainer brings the container up
  Scenario: CORE024_30 --devcontainer builds and starts the worktree container with unique ports
    Given a new worktree containing ".devcontainer/docker-compose.yml"
    And ".devcontainer/.env" has worktree-unique HOST_NOVNC_PORT
    When skill is invoked with "--devcontainer"
    Then "docker compose build" then "docker compose up -d" are executed with cwd "<worktree>/.devcontainer"
    And the compose project name is derived from the worktree directory

  # @feature11 — FR-12 + NFR-R3: docker failure is best-effort
  Scenario: CORE024_31 docker failure prints manual command and continues
    Given "docker compose" will exit with a non-zero code
    When skill is invoked with "--devcontainer"
    Then stdout contains the failure and the manual command "docker compose up -d --build"
    And worktree creation is not aborted

  # @feature11 — FR-12: no flag means no docker
  Scenario: CORE024_32 invocation without --devcontainer invokes no docker command
    When skill is invoked without "--devcontainer"
    Then no "docker" command is executed

  # @feature11 — FR-12: container builds the project on create
  Scenario: CORE024_33 post-create.sh installs deps and builds when package.json exists
    Given the worktree devcontainer is created via "Reopen in Container"
    And the worktree root contains "package.json"
    When "post-create.sh" runs
    Then "npm install" then "npm run build" are executed
    And re-running post-create skips install when node_modules is present and lockfile unchanged
