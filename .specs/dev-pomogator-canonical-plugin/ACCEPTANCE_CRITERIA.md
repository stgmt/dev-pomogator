# Acceptance Criteria (EARS)

## AC-1 (FR-1, FR-9)

**Требование:** [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest)

WHEN drift test (`tests/e2e/canonical-plugin.test.ts`) выполняется на dev-pomogator repo
THEN repo SHALL содержать hand-maintained `.claude-plugin/plugin.json` со всеми обязательными полями (name=dev-pomogator, version=2.x, description, author), schema-valid per Anthropic spec
AND repo SHALL содержать canonical sub-directories: `skills/<name>/SKILL.md`, `commands/*.md`, `.mcp.json`, плюс hooks config `.claude-plugin/hooks.json`
AND каждая hook-команда в `.claude-plugin/hooks.json` SHALL резолвиться в существующий on-disk скрипт под `tools/` (и каждый зарегистрированный hook-скрипт под `tools/` SHALL присутствовать в `hooks.json`)
AND `.claude-plugin/` директория SHALL содержать ТОЛЬКО `plugin.json`, `marketplace.json` И `hooks.json` (no other files per Anthropic spec).

## AC-2 (FR-2, FR-3)

**Требование:** [FR-2](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson), [FR-3](FR.md#fr-3-distribution-через-plugin-marketplace-add)

WHEN пользователь запускает `/plugin marketplace add stgmt/dev-pomogator` (CLI или Desktop UI)
THEN Claude Code SHALL clone dev-pomogator repo в marketplace cache
AND SHALL parse `.claude-plugin/marketplace.json` (validate per Anthropic schema)
AND SHALL register marketplace name "stgmt" в settings.json (source: `enabledMarketplaces` field или эквивалент)
AND SHALL make plugin "dev-pomogator" available для subsequent `/plugin install`.

## AC-3 (FR-4, FR-5, FR-6)

**Требование:** [FR-4](FR.md#fr-4-install-через-plugin-install-dev-pomogatorstgmt), [FR-5](FR.md#fr-5-scope-aware-install-userprojectlocal), [FR-6](FR.md#fr-6-activation-через-reload-plugins)

WHEN пользователь запускает `/plugin install dev-pomogator@stgmt` без явного `--scope`
THEN Claude Code SHALL install в default user-scope
AND SHALL copy plugin tree в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`
AND SHALL добавить `"dev-pomogator@stgmt": true` в `~/.claude/settings.json` `enabledPlugins`
AND после `/reload-plugins` (CLI) или restart Desktop — skills из плагина SHALL быть доступны в Skill picker.

IF пользователь запускает `/plugin install dev-pomogator@stgmt --scope project`
THEN entry SHALL быть записана в `<cwd>/.claude/settings.json` `enabledPlugins` (committed file, shared с командой)
AND `<cwd>/.claude/settings.local.json` SHALL остаться не модифицированным.

IF пользователь запускает `/plugin install dev-pomogator@stgmt --scope local`
THEN entry SHALL быть записана в `<cwd>/.claude/settings.local.json` `enabledPlugins` (auto-gitignored)
AND `<cwd>/.claude/settings.json` SHALL остаться не модифицированным.

## AC-4 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script)

WHEN пользователь с v1 install в проекте запускает optional cleanup script `npx tsx <repo>/tools/migrate-v1-to-v2.ts`
THEN script SHALL детектить v1 install через `<cwd>/.dev-pomogator/.claude-plugin/plugin.json` version<2.0.0
AND SHALL backup user-modified files (content hash mismatch) в `<cwd>/.dev-pomogator/.user-overrides/<rel-path>`
AND SHALL remove project-scope managed files (`.claude/skills/`, `.claude/rules/`, `.dev-pomogator/`)
AND SHALL remove dev-pomogator managed marker block из `<cwd>/.gitignore`
AND SHALL print next steps: «Run `/plugin marketplace add stgmt/dev-pomogator` then `/plugin install dev-pomogator@stgmt`».

## AC-5 (FR-7)

**CANON001_101 — Global-only isolation:** When `tools/migrate-v1-to-v2.ts --global-only` executes against project sentinels in `<cwd>/.claude/**`, `<cwd>/.dev-pomogator/**`, `<cwd>/.dev-pomogator-v1-overrides/**`, `<cwd>/.gitignore`, and project settings, success, `--dry-run`, already-migrated, and induced-failure outcomes SHALL preserve every sentinel byte-for-byte. The evidence SHALL record the resolved `origin/main` commit and SHALL NOT use `HEAD`, a worktree, cache, or user-global state as its comparison baseline.


**Требование:** [FR-7](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script)

WHEN cleanup script выполняется на проекте без v1 install (`<cwd>/.dev-pomogator/` отсутствует или version >= 2.0.0)
THEN script SHALL exit с code 0
AND SHALL print informational message «No v1 install detected; nothing to migrate»
AND SHALL NOT modify any project files.

## AC-6 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-uninstall-via-plugin-uninstall)

WHEN пользователь запускает `/plugin uninstall dev-pomogator@stgmt [--scope user|project|local]`
THEN Claude Code SHALL удалить `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/` целиком
AND SHALL remove `"dev-pomogator@stgmt"` entry из `enabledPlugins` соответствующего scope settings.json
AND SHALL preserve остальные `enabledPlugins` entries (smart merge, не truncate целиком).

## AC-7 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-desktop-compatibility-via-canonical-ui)

WHEN пользователь открывает Claude Desktop application
AND кликает «**+**» button → «**Plugins**» menu item
THEN Desktop UI SHALL отображать plugin browser
AND после `/plugin marketplace add` (через CLI session или внутренний Desktop UI flow) dev-pomogator SHALL появиться в available plugins list
AND после install через UI plugin SHALL быть активен в Desktop session.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-cursor-support-removal)

WHEN кто-либо запускает legacy CLI entry point (если остался для migration utility) с флагом `--cursor`
THEN CLI SHALL exit с non-zero exit code (≥1)
AND stderr SHALL содержать message "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator."
AND no install actions SHALL быть выполнены.

## AC-9 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open)

WHEN a canonical-plugin or repository-dogfood hook is invoked from a POSIX environment or a foreign project CWD
THEN its shell pre-dispatch SHALL block a prohibited host BDD command before Node runs
AND on POSIX SHALL invoke `node`, not `node.exe`
AND its doctor decision SHALL be isolated to the active session and project CWD
AND a missing, failed, or malformed doctor result SHALL preserve the original hook action rather than block it.
AND plugin-installed dispatch SHALL resolve its launcher from `CLAUDE_PLUGIN_ROOT` and repository-dogfood dispatch from `CLAUDE_PROJECT_DIR`, never from process CWD.

## AC-10 (FR-15–FR-24)

**Requirement:** [FR-15](FR.md#fr-15-managed-hot-path-hooks-are-http-registrations)–[FR-24](FR.md#fr-24-http-hook-policy-has-executable-bdd-coverage)

WHEN review receives managed shell, inline Node, registry-drift, and unapproved HTTP registrations
THEN it SHALL return one actionable finding for each prohibited registration without network I/O
AND SHALL distinguish shell/inline Node, unapproved authenticated transport, and registry drift.

WHEN review receives an approved registry-backed HTTP hook and the documented plugin-root `SessionStart` bootstrap
THEN it SHALL return no findings
AND the registry SHALL declare bearer-environment authentication without containing a bearer token value.

WHEN the hook service restarts after the parent Claude Code process has loaded the provisioned credential
THEN the credential bytes SHALL remain unchanged
AND authenticated native Stop dispatch SHALL NOT return HTTP 401.

WHEN the persisted credential differs from the parent-process credential
THEN bootstrap and doctor SHALL report one restart-required fingerprint mismatch without printing the token
AND SHALL remain fail-open.

WHEN a managed non-SessionStart hook runs after its owned hook-service daemon has died or become stale during the same Claude Code session
THEN the builtins-only client SHALL coalesce startup through `ensureUp`, start or recycle only the verified-owned daemon, and dispatch the original request successfully without user action
AND a connection-class first failure SHALL retry the exact request at most once after recovery
AND a live 401, 403, 404, or 503 response SHALL be returned without restart or retry
AND a foreign process or listener SHALL never be terminated or treated as owned
AND a second transport failure SHALL fail open and persist a sanitized client diagnostic without the credential.

**BDD:** `CORE024_01`, `CORE024_02`, `CORE024_06`, `CORE024_07`, `CORE024_12` in `tests/features/core/CORE024_hook-review.feature`; `tests/step_definitions/feature24_hook_review.ts`.
