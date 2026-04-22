# Acceptance Criteria (EARS)

## AC-1 (FR-1): Auto-trigger Phase 0 @feature1

**Требование:** [FR-1](FR.md#fr-1-auto-trigger-phase-0-при-первом-create-spec-в-репо-feature1)

- **WHEN** developer вызывает `/create-spec <slug>` **AND** `.specs/.onboarding.json` отсутствует **THEN** система SHALL автоматически инициировать Phase 0 Repo Onboarding ДО Phase 1 Discovery.
- **WHEN** Phase 0 успешно завершён **THEN** система SHALL продолжить Phase 1 Discovery с pre-populated context из `.onboarding.json`.
- **IF** `.specs/.onboarding.json` уже существует **AND** валиден по schema **AND** SHA matches git HEAD **THEN** система SHALL пропустить Phase 0 (cache hit).

## AC-2 (FR-2): .onboarding.json schema @feature2 @feature10

**Требование:** [FR-2](FR.md#fr-2-typed-artifact-specsonboardingjson-ai-first-schema-feature2-feature10)

- **WHEN** Phase 0 Step 7 завершается **THEN** система SHALL создать `.specs/.onboarding.json` валидный по JSON Schema v1.0 (см. `onboard-repo-phase0_SCHEMA.md`).
- **IF** generated JSON не проходит schema validation **THEN** система SHALL abort Phase 0 с error message `"Schema violation: <field> <rule>"` **AND** НЕ SHALL записать corrupted JSON на диск.
- **WHEN** `.onboarding.json` записан **THEN** файл SHALL содержать minimum 17 блоков (project, tech_context, commands, system_patterns, repo_map, rules_index, skills_registry, hooks_registry, mcp_servers, boundaries, gotchas, env_requirements, verification, code_style, workflow, imports, ignore, glossary, active_context, progress).

## AC-3 (FR-3): PreToolUse hook compile @feature3

**Требование:** [FR-3](FR.md#fr-3-pretooluse-hook-compiled-из-commands-блока-feature3)

- **WHEN** `.onboarding.json` финализирован **THEN** система SHALL скомпилировать PreToolUse hook-block из полей `commands.<name>.raw_pattern_to_block` где `forbidden_if_skill_present == true`.
- **WHEN** hook скомпилирован **THEN** система SHALL smart-merge block в `.claude/settings.local.json`, preserving user-defined hooks.
- **WHEN** developer после Phase 0 пытается выполнить raw команду matching `raw_pattern_to_block` (например `npm test`) **THEN** hook SHALL return `permissionDecision: "deny"` с `permissionDecisionReason: "Use /<skill> skill; raw <cmd> bypasses <reason>"`.

## AC-4 (FR-4): Git-SHA cache invalidation @feature4

**Требование:** [FR-4](FR.md#fr-4-git-sha-cache-invalidation-feature4)

- **IF** `onboarding.last_indexed_sha == git rev-parse HEAD` **THEN** система SHALL пропустить Phase 0 и SHALL показать 3-line cache hit summary.
- **WHEN** `last_indexed_sha` drift ≥ 5 commits от HEAD **THEN** система SHALL prompt user: `"Онбординг устарел на N коммитов. Refresh или продолжить?"` **AND** SHALL дождаться explicit choice.
- **IF** user отвечает `"Refresh"` **THEN** система SHALL запустить full Phase 0 re-run.
- **IF** user отвечает `"Continue with cache"` **THEN** система SHALL пропустить Phase 0 и SHALL записать warning в `progress.json.warnings[]`.

## AC-5 (FR-5): Baseline test run @feature5

**Требование:** [FR-5](FR.md#fr-5-baseline-test-run-через-run-tests-feature5)

- **WHEN** Phase 0 Step 2 детектит test framework **THEN** Step 4 SHALL запустить `/run-tests` (НЕ raw `pytest`/`npm test`).
- **WHEN** baseline tests завершились **THEN** результат SHALL быть записан в `onboarding.baseline_tests = {framework, command, passed, failed, skipped, duration_s, failed_test_ids[]}`.
- **IF** test framework НЕ обнаружен в Step 2 **THEN** Step 4 SHALL быть пропущен **AND** `onboarding.baseline_tests SHALL быть `{framework: null, reason: "no test framework detected"}`.
- **IF** test command завершился с exit 127 (command not found) **THEN** система SHALL abort Phase 0 с hint `"Install dependencies: <install_cmd>"`.

## AC-6 (FR-6): Text gate @feature6

**Требование:** [FR-6](FR.md#fr-6-text-gate-перед-phase-1-discovery-feature6)

- **WHEN** Phase 0 Steps 1-5 завершены **THEN** AI agent SHALL написать в чат 1-абзац резюме архитектуры (4-6 предложений, non-technical language) **AND** SHALL задать вопрос `"Правильно я понял суть?"`.
- **WHEN** developer отвечает утвердительно (синонимы: "да", "верно", "правильно", "yes", "correct") **THEN** система SHALL вызвать `spec-status.ts -ConfirmStop Onboarding`.
- **WHEN** developer отвечает corrections **THEN** AI SHALL обновить резюме и SHALL повторить вопрос (до 3 итераций).
- **IF** 3 итераций пройдено без confirmation **THEN** система SHALL abort Phase 0 с hint `"Gate not confirmed after 3 iterations. Run --refresh-onboarding когда готов продолжить."`.
- **IF** developer явно говорит `"abort"` / `"cancel"` / `"прервать"` **THEN** система SHALL вызвать `spec-status.ts -Abort` **AND** partial artifacts SHALL быть удалены.

## AC-7 (FR-7): Parallel subagents @feature7

**Требование:** [FR-7](FR.md#fr-7-parallel-explore-subagents-для-recon-feature7)

- **WHEN** Phase 0 Step 2 стартует **THEN** система SHALL launch ровно 3 Claude Code Explore subagents в **одном tool call** (параллельно).
- **WHEN** все 3 subagents вернулись **THEN** система SHALL merge результаты по priority rule (A > B > C per-field) **AND** SHALL записать merged output в temporary JSON.
- **IF** один из 3 subagents failed (crash / timeout) **THEN** система SHALL продолжить с оставшимися 2 **AND** SHALL записать `warnings[].subagent = "<letter>"` в onboarding.json.
- **IF** все 3 subagents failed **THEN** система SHALL abort Phase 0 с hint `"Recon failed. Verify Claude Code subagent availability."`.

## AC-8 (FR-8): Archetype triage @feature8

**Требование:** [FR-8](FR.md#fr-8-archetype-triage-2-min-перед-deep-scan-feature8)

- **WHEN** Phase 0 Step 1 стартует **THEN** система SHALL читать ТОЛЬКО root + top-level directories (non-recursive beyond depth 2) **AND** SHALL complete в ≤ 120 seconds.
- **WHEN** Step 1 завершается **THEN** archetype SHALL быть одним из: `python-api`, `nodejs-backend`, `nodejs-frontend`, `fullstack-monorepo`, `dotnet-service`, `cli-tool`, `library`, `infra`, `ml-research`, или `unknown`.
- **WHEN** archetype определён **THEN** `onboarding.archetype = <value>` AND `onboarding.archetype_confidence = "high"|"medium"|"low"` AND `onboarding.archetype_evidence = "<manifest+paths>"`.
- **IF** archetype == `"unknown"` **THEN** система SHALL продолжить с generic routing **AND** text gate (Step 6) SHALL explicitly ask user to confirm проект нестандартный.

## AC-9 (FR-9): .onboarding.md prose report @feature9

**Требование:** [FR-9](FR.md#fr-9-prose-artifact-specsonboardingmd-6-секционный-отчёт-feature9)

- **WHEN** `.onboarding.json` финализирован **THEN** система SHALL сгенерировать `.specs/.onboarding.md` по 6-секционному шаблону:
  1. Project snapshot
  2. Dev environment
  3. How to run tests
  4. Behavior from tests
  5. Risks and notes
  6. Suggested next steps
- **WHEN** `.onboarding.md` написан **THEN** каждая из 6 секций SHALL быть present (возможно с `_N/A_` содержимым если данных нет).
- **IF** archetype-specific поля доступны (например `routes` для nodejs-frontend) **THEN** Section 4 SHALL включить archetype-specific subsection.

## AC-10 (FR-10): AI-specific sections mandatory @feature10

**Требование:** [FR-10](FR.md#fr-10-ai-specific-секции-обязательны-не-только-generic-metadata-feature10)

- **WHEN** Phase 0 рендерит `.onboarding.json` **THEN** JSON SHALL содержать non-empty `rules_index[]`, `skills_registry[]`, `hooks_registry[]`, `mcp_servers[]`, `boundaries.{always, ask_first, never}[]`, `glossary[]`.
- **IF** target репо не имеет `.claude/rules/` **THEN** `rules_index` SHALL быть `[]` (empty array, не omitted) **AND** `warnings[]` SHALL содержать `"No .claude/rules/ detected — rules_index empty"`.
- **WHEN** schema validation выполняется **THEN** missing AI-specific сections (rules_index/skills_registry/hooks_registry/mcp_servers/boundaries/glossary как keys) SHALL считаться schema violation и abort-ить Phase 0.

## AC-11 (FR-11): Developer onboarding checklist @feature11

**Требование:** [FR-11](FR.md#fr-11-developer-onboarding-checklist-из-onboardingmd-feature11)

- **WHEN** `.onboarding.md` Section 6 "Suggested next steps" генерируется **THEN** SHALL содержать 1-3 bullet items.
- **WHEN** в `onboarding.env_requirements.required[]` есть items **THEN** Section 6 SHALL включить item `"Install env vars: <list>"`.
- **WHEN** `onboarding.gotchas[]` содержит items с severity == "high" **THEN** первые 2 SHALL быть включены в Section 6.

## AC-12 (FR-12): Coexistence с /init @feature12

**Требование:** [FR-12](FR.md#fr-12-coexistence-с-anthropic-init-без-конфликта-feature12)

- **IF** `CLAUDE.md` существует в target репо **THEN** Phase 0 SHALL записать `"CLAUDE.md"` в `onboarding.existing_ai_configs[]` **AND** НЕ SHALL читать его содержимое для parsing данных.
- **WHEN** Phase 0 завершается **THEN** `CLAUDE.md` SHALL остаться unmodified (mtime, content, permissions).
- **WHEN** `/init` Anthropic вызывается после Phase 0 **THEN** `.onboarding.json` SHALL остаться unmodified (no cross-interference).

## AC-13 (FR-13): Delivered as extension @feature13

**Требование:** [FR-13](FR.md#fr-13-delivered-as-dev-pomogator-extension-feature13)

- **WHEN** фича merged в main **THEN** `extensions/onboard-repo/` SHALL существовать с `extension.json` containing полный manifest (files, tools, toolFiles, rules, skillFiles, hooks, crossExtensionModifies).
- **WHEN** `npx github:stgmt/dev-pomogator --claude` выполняется в чистом проекте **THEN** extension `onboard-repo` SHALL быть установлен (проверка: файлы в `.dev-pomogator/tools/onboard-repo/` + `.claude/rules/onboard-repo/`).
- **WHEN** `dev-pomogator --status` запущен **THEN** вывод SHALL включать `onboard-repo` в installed extensions список.
- **WHEN** `dev-pomogator uninstall --project --plugins=onboard-repo` **THEN** все managed файлы SHALL быть удалены **AND** user-modifications SHALL быть backed up в `.dev-pomogator/.user-overrides/`.

## AC-14 (FR-14): Scratch file @feature14

**Требование:** [FR-14](FR.md#fr-14-scratch-file-для-крупных-репо-feature14)

- **WHEN** Phase 0 Step 2 стартует на репо с >500 файлов **THEN** subagents SHALL append findings в `.specs/.onboarding-scratch.md` каждые 2-3 прочитанных файла.
- **WHEN** Phase 0 Step 7 завершается **THEN** `.onboarding-scratch.md` SHALL быть moved в `.specs/.onboarding-history/scratch-{ISO-timestamp}.md`.
- **IF** `.specs/.onboarding-history/` содержит более 5 scratch files **THEN** oldest SHALL быть удалены (retention policy).
- **IF** репо < 500 файлов **THEN** scratch file SHALL НЕ создаваться (overhead avoided).

## AC-15 (FR-15): Dual-render @feature15

**Требование:** [FR-15](FR.md#fr-15-dual-render-из-single-source-of-truth-feature15)

- **WHEN** `.onboarding.json` finalized **THEN** система SHALL invoke `render-rule.ts` **AND** `compile-hook.ts` последовательно.
- **WHEN** `render-rule.ts` completes **THEN** `.claude/rules/onboarding-context.md` SHALL contain managed marker `<!-- managed by dev-pomogator onboarding v1, do not edit -->` + 17 sections derived из JSON.
- **WHEN** `compile-hook.ts` completes **THEN** `.claude/settings.local.json` SHALL contain PreToolUse hook entries **AND** any pre-existing user hooks SHALL быть preserved.
- **IF** `.onboarding.json` modified manually (not via Phase 0) **AND** renderers не re-run **THEN** next `/create-spec` SHALL detect SHA-256 drift between artifacts **AND** prompt `"Artifacts out of sync, re-render?"`.

## AC-16 (FR-16): Manual refresh @feature4

**Требование:** [FR-16](FR.md#fr-16-manual-refresh-через---refresh-onboarding-feature4)

- **WHEN** developer запускает `/create-spec <slug> --refresh-onboarding` **THEN** Phase 0 SHALL force re-run независимо от cache state.
- **WHEN** refresh начинается **THEN** pre-existing artifacts SHALL быть moved в `.specs/.onboarding-history/{ISO-timestamp}/` **BEFORE** новых writes.
- **WHEN** `.onboarding-history/` содержит > 5 timestamped dirs **THEN** oldest SHALL быть deleted.

## AC-17 (FR-17): Ignore files respect @feature2

**Требование:** [FR-17](FR.md#fr-17-respect-cursorignore--aiderignore--gitignore-feature2)

- **WHEN** Phase 0 subagents сканируют файлы **THEN** paths matching `.gitignore` patterns SHALL быть excluded.
- **IF** `.cursorignore` существует **THEN** paths matching SHALL быть также excluded **AND** `onboarding.ignore.external_configs_found[]` SHALL включать `".cursorignore"`.
- **IF** `.aiderignore` существует **THEN** paths matching SHALL быть также excluded **AND** `onboarding.ignore.external_configs_found[]` SHALL включать `".aiderignore"`.
- **WHEN** ignore patterns объединены **THEN** sensitive paths (patterns matching `.env*`, `*.secret`, `credentials*`) SHALL быть always excluded независимо от ignore files.

## AC-18 (FR-18): Commands via skill reference @feature3 @feature15

**Требование:** [FR-18](FR.md#fr-18-commands-via-skill-reference-не-hardcode-feature3-feature15)

- **WHEN** Phase 0 Step 2 детектит test framework (например vitest) **AND** target репо содержит `/run-tests` skill **THEN** `onboarding.commands.test.via_skill` SHALL == `"run-tests"` (не null).
- **IF** `commands.test.via_skill` == `"run-tests"` **THEN** `commands.test.preferred_invocation` SHALL начинаться с `"/"` (slash-command) **AND** `commands.test.fallback_cmd` SHALL быть raw command (для degraded mode only).
- **WHEN** schema validation **THEN** `commands.<any>.via_skill != null && forbidden_if_skill_present == true` **AND** `raw_pattern_to_block` empty SHALL быть schema violation.

## AC-19 (FR-19): SHA-256 managed tracking

**Требование:** [FR-19](FR.md#fr-19-managed-files-tracking-через-sha-256)

- **WHEN** Phase 0 создаёт artifact (onboarding.json, onboarding.md, onboarding-context.md, hook block) **THEN** SHA-256 хеш файла SHALL быть записан в `~/.dev-pomogator/config.json → managedFiles[]` с полями `{path, hash, source_extension: "onboard-repo"}`.
- **WHEN** `dev-pomogator --update` запускается **AND** хеш файла на диске != stored hash **THEN** file SHALL быть copied в `.dev-pomogator/.user-overrides/<path>` перед overwrite.

## AC-20 (FR-20): JSON Schema validation

**Требование:** [FR-20](FR.md#fr-20-json-schema-validation-onboardingjson)

- **WHEN** extension installs **THEN** `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json` SHALL быть present как Draft 2020-12 JSON Schema.
- **WHEN** `.onboarding.json` validated **THEN** система SHALL использовать `ajv` (уже в dependencies или installed) **AND** return structured errors если violations найдены.
- **IF** schema violation detected **THEN** Phase 0 SHALL abort с output `"Schema validation failed: <path>: <error>\nSee <schema-url>"`.
