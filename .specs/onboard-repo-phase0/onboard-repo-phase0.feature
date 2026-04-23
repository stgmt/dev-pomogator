Feature: ONBOARD001_Phase0_Repo_Onboarding

  Background:
    Given dev-pomogator is installed
    And onboard-repo extension is enabled
    And specs-workflow extension is enabled
    And the target repo is a clean copy of a fake-repo fixture
    And managed-registry snapshot is captured

  # @feature1
  Scenario: ONBOARD002_First_create_spec_auto_triggers_phase0
    Given the target repo does not contain `.specs/.onboarding.json`
    And fake-python-api fixture is seeded in tmpdir
    When I run `/create-spec notification-throttle` in the target repo
    Then Phase 0 starts automatically before Phase 1 Discovery
    And `.specs/.onboarding.json` is created
    And `.specs/.onboarding.md` is created
    And `.claude/rules/onboarding-context.md` is created with managed marker
    And `.claude/settings.local.json` contains an onboarding PreToolUse hook block
    And state machine transitions to `Discovery` after `-ConfirmStop Onboarding`

  # @feature4
  Scenario: ONBOARD003_Cache_hit_skips_phase0
    Given `.specs/.onboarding.json` exists with `last_indexed_sha` matching git HEAD
    When I run `/create-spec another-feature` in the target repo
    Then Phase 0 is skipped
    And a 3-line cache hit summary is shown mentioning archetype and baseline test count
    And the command proceeds directly to Phase 1 Discovery within 3 seconds

  # @feature4
  Scenario: ONBOARD004_SHA_drift_prompts_refresh
    Given `.specs/.onboarding.json` exists with stale `last_indexed_sha`
    And the git log shows at least 5 commits since `last_indexed_sha`
    When I run `/create-spec next-feature` in the target repo
    Then a prompt appears asking "Refresh or continue with cache?"
    And the prompt mentions the drift count in commits

  # @feature4
  Scenario: ONBOARD005_Manual_refresh_flag_forces_rerun
    Given `.specs/.onboarding.json` exists and is valid
    When I run `/create-spec feature-x --refresh-onboarding` in the target repo
    Then Phase 0 re-runs regardless of cache state
    And the previous `.specs/.onboarding.json` is archived in `.specs/.onboarding-history/`
    And the archive directory uses ISO-8601 timestamp format
    And `.specs/.onboarding-history/` retains at most 5 snapshots

  # @feature13
  Scenario: ONBOARD006_Missing_dev_pomogator_errors_early
    Given the target repo does not have `.dev-pomogator/` directory
    When I run `/create-spec anything` in the target repo
    Then Phase 0 does not start
    And an actionable error message is shown pointing to `npx github:stgmt/dev-pomogator --claude`

  # @feature5
  Scenario: ONBOARD007_Baseline_tests_invoke_run_tests_skill
    Given fake-python-api fixture has pytest installed
    And run-tests-skill-mock returns `{"passed": 145, "failed": 2, "duration_s": 47}`
    When Phase 0 Step 4 executes
    Then `/run-tests` skill is invoked (not raw `pytest` command)
    And `.onboarding.json.baseline_tests.passed == 145`
    And `.onboarding.json.baseline_tests.failed == 2`
    And `.onboarding.json.baseline_tests.via_skill == "run-tests"`

  # @feature5
  Scenario: ONBOARD008_No_test_framework_skips_baseline
    Given fake-no-tests fixture is seeded
    And Step 2 recon does not detect any test framework
    When Phase 0 Step 4 executes
    Then Step 4 is skipped
    And `.onboarding.json.baseline_tests` equals `{"framework": null, "reason": "no test framework detected"}`
    And `.onboarding.json.risks` contains a note about missing tests baseline

  # @feature5
  Scenario: ONBOARD009_Skip_baseline_flag_records_user_choice
    Given fake-python-api fixture is seeded
    When I run `/create-spec f --onboard --skip-baseline-tests`
    Then Phase 0 Step 4 is skipped
    And `.onboarding.json.baseline_tests.skipped_by_user == true`

  # @feature6
  Scenario: ONBOARD010_Text_gate_accepts_confirmation
    Given Phase 0 Steps 1-5 completed successfully
    When the agent emits a 1-paragraph architecture summary in chat
    And I respond with "да, верно"
    Then `spec-status.ts -ConfirmStop Onboarding` is invoked
    And Phase 0 completes

  # @feature6
  Scenario: ONBOARD011_Text_gate_iterates_on_correction
    Given Phase 0 Steps 1-5 completed successfully
    And the agent emits summary "this is a Python CLI tool"
    When I respond with "not quite — it's a web backend"
    Then the agent updates the summary to mention "web backend"
    And the agent asks "Правильно я понял суть?" again
    And the iteration counter increments to 2

  # @feature6
  Scenario: ONBOARD012_Text_gate_aborts_after_3_iterations
    Given Phase 0 Steps 1-5 completed successfully
    And the agent attempted 3 summary iterations with no user confirmation
    When the third iteration receives another correction
    Then Phase 0 aborts with hint "Gate not confirmed after 3 iterations"
    And partial artifacts are not finalized
    And the user can retry with `--refresh-onboarding`

  # @feature7
  Scenario: ONBOARD013_Parallel_subagents_launch_in_one_tool_call
    Given fake-python-api fixture is seeded
    And mock-subagent fixture returns outputs for manifest, tests, entry-points
    When Phase 0 Step 2 starts
    Then exactly 3 Claude Code Explore subagents launch concurrently in one tool-use message
    And all 3 outputs merge via priority rule A > B > C per-field
    And merged result is stored in phase0State

  # @feature7
  Scenario: ONBOARD014_Partial_subagent_failure_continues_with_warnings
    Given mock-subagent fixture configured so Subagent B crashes
    When Phase 0 Step 2 runs
    Then Phase 0 continues with outputs from Subagent A and Subagent C only
    And `.onboarding.json.warnings[]` contains entry with `step: "recon"` and `subagent: "B"`
    And the text gate summary acknowledges partial data

  # @feature8
  Scenario: ONBOARD015_Archetype_triage_classifies_python_api
    Given fake-python-api fixture contains `pyproject.toml` with FastAPI and uvicorn
    When Phase 0 Step 1 runs
    Then Phase 0 completes within 2 minutes
    And `.onboarding.json.archetype == "python-api"`
    And `.onboarding.json.archetype_confidence == "high"`
    And `.onboarding.json.archetype_evidence` mentions `pyproject.toml` and `FastAPI`

  # @feature8
  Scenario: ONBOARD016_Archetype_triage_classifies_nextjs_frontend
    Given fake-nextjs-frontend fixture contains `next.config.ts` and `src/app/page.tsx`
    When Phase 0 Step 1 runs
    Then `.onboarding.json.archetype == "nodejs-frontend"`
    And archetype-specific section contains `routes` array

  # @feature8
  Scenario: ONBOARD017_Monorepo_archetype_with_sub_archetypes
    Given fake-fullstack-monorepo fixture has `turbo.json` and workspaces
    When Phase 0 Step 1 runs
    Then `.onboarding.json.archetype == "fullstack-monorepo"`
    And `archetype_specific.sub_archetypes[]` contains entries for `packages/api/` (python-api) and `packages/web/` (nodejs-frontend)

  # @feature8
  Scenario: ONBOARD018_Minimal_repo_gets_short_report
    Given fake-empty fixture contains only README.md
    When Phase 0 completes
    Then `.onboarding.json.archetype == "unknown"` or `"library"`
    And the text gate summary mentions minimal content
    And Suggested next steps section has at most 1 item

  # @feature2 @feature10
  Scenario: ONBOARD019_Onboarding_json_conforms_to_schema_v1
    Given fake-python-api fixture is seeded
    And mock-subagent outputs match python-api
    When Phase 0 finalizes
    Then `.specs/.onboarding.json` validates against `onboarding.schema.json`
    And the JSON contains all 17 top-level blocks
    And `schema_version == "1.0"`
    And `last_indexed_sha` matches git HEAD

  # @feature10
  Scenario: ONBOARD020_AI_specific_sections_are_mandatory
    Given fake-python-api fixture is seeded
    When Phase 0 finalizes
    Then `.onboarding.json.rules_index` key exists as array (may be empty)
    And `.onboarding.json.skills_registry` key exists as array
    And `.onboarding.json.hooks_registry` key exists as array
    And `.onboarding.json.mcp_servers` key exists as array
    And `.onboarding.json.boundaries.always` is a non-empty array
    And `.onboarding.json.boundaries.never` is a non-empty array
    And `.onboarding.json.gotchas` key exists as array
    And `.onboarding.json.glossary` key exists as array

  # @feature2 @feature10
  Scenario: ONBOARD021_Schema_violation_aborts_finalize
    Given invalid-schema-onboarding fixture is used to simulate malformed JSON
    When Phase 0 Step 7 attempts schema validation
    Then Phase 0 aborts with structured error message "Schema validation failed: <path>: <rule>"
    And `.specs/.onboarding.json` is NOT written to disk

  # @feature3 @feature15
  Scenario: ONBOARD022_Commands_via_skill_reference_when_skill_exists
    Given target repo has `/run-tests` skill installed
    When Phase 0 populates `commands.test` block
    Then `commands.test.via_skill == "run-tests"`
    And `commands.test.preferred_invocation` starts with "/"
    And `commands.test.fallback_cmd` contains a raw command string
    And `commands.test.forbidden_if_skill_present == true`
    And `commands.test.raw_pattern_to_block` is a non-empty regex

  # @feature3
  Scenario: ONBOARD023_PreToolUse_hook_blocks_raw_npm_test
    Given Phase 0 finalized and hook compiled into `.claude/settings.local.json`
    When Claude agent attempts to run raw `npm test` via Bash tool
    Then the PreToolUse hook returns `permissionDecision: "deny"`
    And `permissionDecisionReason` mentions "/run-tests"
    And the Bash tool invocation does not execute

  # @feature15
  Scenario: ONBOARD024_Dual_render_produces_both_artifacts
    Given Phase 0 Step 7 starts from a valid `.onboarding.json`
    When `render-rule.ts` and `compile-hook.ts` execute
    Then `.claude/rules/onboarding-context.md` contains managed marker "<!-- managed by dev-pomogator onboarding v1, do not edit -->"
    And `.claude/rules/onboarding-context.md` has 17 sections matching JSON blocks
    And `.claude/settings.local.json` contains hook entries derived from commands.*.raw_pattern_to_block
    And existing user hooks in settings.local.json are preserved (smart merge)

  # @feature14
  Scenario: ONBOARD025_Scratch_file_activates_for_large_repo
    Given fake-large-repo factory generates 600 files
    When Phase 0 Step 2 starts
    Then subagents append findings to `.specs/.onboarding-scratch.md` every 2-3 files read
    And after Phase 0 Step 7 the scratch file is archived to `.specs/.onboarding-history/scratch-<ISO>.md`
    And the live `.specs/.onboarding-scratch.md` is removed from working directory

  # @feature14
  Scenario: ONBOARD026_Small_repo_does_not_create_scratch_file
    Given fake-python-api fixture has less than 500 files
    When Phase 0 runs
    Then `.specs/.onboarding-scratch.md` is never created
    And no scratch archive entry is added to `.onboarding-history/`

  # @feature12
  Scenario: ONBOARD027_Coexistence_with_init_does_not_modify_claude_md
    Given fake-python-api fixture is seeded
    And a pre-existing `CLAUDE.md` file is present in tmpdir with custom content
    When Phase 0 completes successfully
    Then `CLAUDE.md` content is unchanged (byte-identical to before)
    And `CLAUDE.md` mtime is unchanged
    And `.onboarding.json.existing_ai_configs[]` contains "CLAUDE.md"

  # @feature2
  Scenario: ONBOARD028_Cursorignore_respected_by_phase0
    Given fake-with-cursorignore fixture contains `.cursorignore` with pattern `secrets/**`
    And the tmpdir contains a real file `secrets/key.json`
    When Phase 0 runs
    Then subagents do not read `secrets/key.json`
    And `.onboarding.json.ignore.external_configs_found[]` contains ".cursorignore"
    And `.onboarding.json.ignore.ai_excluded_paths[]` contains "secrets/**"

  # @feature9
  Scenario: ONBOARD029_Onboarding_md_has_six_mandatory_sections
    Given fake-python-api fixture is seeded
    When Phase 0 finalizes
    Then `.specs/.onboarding.md` contains section "Project snapshot"
    And contains section "Dev environment"
    And contains section "How to run tests"
    And contains section "Behavior from tests"
    And contains section "Risks and notes"
    And contains section "Suggested next steps"

  # @feature11
  Scenario: ONBOARD030_Suggested_next_steps_includes_env_requirements
    Given fake-python-api fixture has `.env.example` with `AUTO_COMMIT_API_KEY`
    When Phase 0 finalizes
    Then `.onboarding.md` Section 6 "Suggested next steps" includes an item mentioning `AUTO_COMMIT_API_KEY`

  # @feature13
  Scenario: ONBOARD031_Extension_installable_via_npx
    Given a clean project without dev-pomogator
    When I run `npx github:stgmt/dev-pomogator --claude --plugins=onboard-repo`
    Then extension files exist under `.dev-pomogator/tools/onboard-repo/`
    And rules exist under `.claude/rules/onboard-repo/`
    And `dev-pomogator --status` output lists `onboard-repo` as installed

  # @feature4
  Scenario: ONBOARD032_Non_git_repo_falls_back_to_mtime_cache
    Given fake-no-git fixture has no `.git/` directory
    When Phase 0 finalizes
    Then `.onboarding.json.last_indexed_sha` equals empty string ""
    And `.onboarding.json.warnings[]` contains entry mentioning "not a git repo, mtime-based invalidation"

  # EC-5 @feature7
  Scenario: ONBOARD033_Large_repo_uses_repomix_when_available
    Given fake-large-repo factory generates 1000 files
    And `repomix` CLI is available in PATH
    When Phase 0 Step 3 runs
    Then `repomix --compress` is invoked
    And `.onboarding.json.ingestion.method == "repomix"`
    And `.onboarding.json.ingestion.compression_ratio` is between 0.2 and 0.4

  Scenario: ONBOARD034_Fallback_ingestion_when_repomix_missing
    Given `repomix` CLI is NOT available in PATH
    When Phase 0 Step 3 runs
    Then shell-based top-N fallback is used
    And `.onboarding.json.ingestion.method == "fallback"`
