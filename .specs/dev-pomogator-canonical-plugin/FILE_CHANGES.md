# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

Hook-service scope: `tools/hook-service/` owns the shared authenticated loopback transport, allowlisted `CLAUDE_ENV_FILE` projection, authentication header, byte-CAS state/settings persistence, and recovery [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service). `tests/hook-service.test.mjs`, `tests/features/core024.feature`, and the installed-cache deps-absent WSL soak harness provide contract, recovery, and endurance evidence without changing task truth [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service), [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open).

| File | Change | Requirement |
|---|---|---|
| `tools/_shared/hook-dispatch.sh` | Add shared POSIX shell pre-Node dispatch for canonical plugin and dogfood hooks: reject host BDD before Node, select POSIX `node` versus Windows `node.exe`, and delegate the guarded target. | [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open) |
| `tools/pomogator-doctor/scripts/doctor-hook.ts` and launcher state helper | Key doctor state by Claude Code session and project CWD; treat unavailable, failed, and malformed results as fail-open diagnostics. | [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open) |
| `.claude-plugin/hooks.json`, `.claude/settings.json` | Route plugin-installed and repository dogfood hooks through the shared dispatch layer without changing target hook semantics. | [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open) |
| `tests/features/dev-pomogator-canonical-plugin.feature`, `tests/step_definitions/feature_dev_pomogator_canonical_plugin.ts` | Implement `PLUGINDEPS001_03` against the real launcher for POSIX pre-Node rejection, executable choice, `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PROJECT_DIR` CWD isolation, and doctor fail-open behavior. | [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-14) |


См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude-plugin/plugin.json` | edit | [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest) — canonical plugin manifest, hand-authored (maintained вручную, не generated); shipped v2.0, ongoing maintenance |
| `.claude-plugin/marketplace.json` | edit | [FR-2](FR.md#fr-2-marketplace-catalog-claude-pluginmarketplacejson) — marketplace catalog, hand-authored, объявляющий dev-pomogator plugin available для install; shipped v2.0, ongoing maintenance |
| `.claude-plugin/hooks.json` | edit | [FR-1](FR.md#fr-1-canonical-plugin-layout), [FR-9](FR.md#fr-9-single-canonical-plugin-manifest) — hooks config, hand-authored; команды ссылаются на on-disk скрипты под `tools/`; shipped v2.0, ongoing maintenance |
| `skills/<name>/SKILL.md` (mass) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — canonical skills tree в repo root для plugin distribution |
| `commands/*.md` (mass) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — canonical commands |
| `.mcp.json` (repo root) | create | [FR-1](FR.md#fr-1-canonical-plugin-layout) — MCP servers config (если applicable) |
| `tools/<tool>/...` (mass) | move | [FR-1](FR.md#fr-1-canonical-plugin-layout) — все tool/hook скрипты перенесены top-level в `tools/` (после удаления `src/` и `extensions/`) |
| `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` | edit | [FR-7](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script) — make `--global-only` strictly global and preserve project sentinels byte-for-byte across success, dry-run, already-migrated, and failure outcomes; shipped v2.0, ongoing maintenance |
| `tests/features/dev-pomogator-canonical-plugin.feature`, `tests/step_definitions/feature_dev_pomogator_canonical_plugin.ts` | edit | [FR-7](FR.md#fr-7-migration-v1-v2-documentation-optional-cleanup-script), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7) — add collision-free `CANON001_101` covering `.dev-pomogator` and `.dev-pomogator-v1-overrides` sentinel preservation and resolved `origin/main` evidence |
| `package.json` | edit | [FR-3](FR.md#fr-3-distribution-через-plugin-marketplace-add), [FR-8](FR.md#fr-8-cursor-support-removal) — remove npm-based install path; remove "Cursor" из description+keywords |
| `tests/step_definitions/feature_dev_pomogator_canonical_plugin.ts` | edit | BDD step definitions для AC-1, FR-9: сценарий CANON001_90 выполняет тот же drift-check in-process — каждая hooks.json команда резолвится в on-disk скрипт под `tools/` (и vice-versa) + manifest schema validity; shipped 2026-05-27, ongoing maintenance |
| `tests/e2e/marketplace-json.test.ts` | create | Integration tests для AC-2: marketplace.json schema validation per Anthropic spec |
| `tests/e2e/migration-v1-to-v2.test.ts` | create | Integration tests для AC-4, AC-5: cleanup script behavior с fixture v1 install |
| `tests/e2e/cursor-removal.test.ts` | create | Regression tests для AC-8: cursor mentions absent, --cursor exits non-zero |
| `tests/fixtures/v1-install/.dev-pomogator/.claude-plugin/plugin.json` | create | Fixture v1 plugin manifest (version 1.5.0) для migration script tests |
| `tests/fixtures/v1-install/.claude/skills/sample-skill/SKILL.md` | create | Fixture skill в project scope для cleanup test |
| `tests/fixtures/v1-install/.gitignore` | create | Fixture .gitignore с managed marker block для cleanup assertion |
| `tests/features/dev-pomogator-canonical-plugin.feature` | create | BDD scenarios под canonical marketplace architecture (CANON001_10..120 для AC-1..AC-8). Note: spec-internal copy в `.specs/dev-pomogator-canonical-plugin/dev-pomogator-canonical-plugin.feature` уже существует; this entry — для копии в `tests/features/` для test runner integration |
| `CLAUDE.md` | edit | Update Architecture section: canonical marketplace plugin distribution, hand-maintained manifests + drift test, deprecated npm install path |
| `README.md` | edit | NEW install commands: `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`; remove npm install instructions; v1→v2 migration guide |
| `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` | edit | Update v2.0 BREAKING changes для canonical marketplace approach (removes npm postinstall + .gitignore writes; adds marketplace.json) |

| `tools/hook-review/check.ts` | Review declarative registrations against the approved local HTTP registry; reject shell/inline Node hot paths, unapproved transport, and registry drift while permitting the documented SessionStart bootstrap. | [FR-15](FR.md#fr-15-managed-hot-path-hooks-are-http-registrations)–[FR-23](FR.md#fr-23-hook-registry-is-the-transport-source-of-truth) |
| `tools/hook-service/`, `tools/hook-service/client.mjs`, `tools/hook-service/registry.mjs`, `tools/hook-service/generate-manifest.mjs` | Provide the local authenticated hook-service plus a builtins-only supervised client that calls `ensureUp`, retries one connection-class failure, preserves live HTTP responses, and persists redacted client diagnostics after bounded failure. | [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service), [FR-16](FR.md#fr-16-http-hook-routes-are-registry-approved), [FR-17](FR.md#fr-17-http-hook-transport-declares-bearer-environment-authentication), [FR-20](FR.md#fr-20-http-hook-commands-remain-shell-free-on-windows) |
| `.claude-plugin/hooks.json`, `.claude/settings.json` | Switch every non-SessionStart managed route from a bare HTTP registration to the supervised command client without changing route order, timeout, matcher, request, or response semantics. | [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service), AC-10 |
| `tests/features/core/CORE024_hook-review.feature`, `tests/step_definitions/feature24_hook_review.ts`, `tests/hook-service.test.mjs` | Execute hook-review and `CORE024_12` recovery BDD against the real client lifecycle: owned-daemon death, single-flight restart, exact one retry, live-error no-retry, foreign-listener safety, and repeated-failure fail-open. | [FR-13](FR.md#fr-13-plugin-hooks-use-one-authenticated-loopback-service), [FR-24](FR.md#fr-24-http-hook-policy-has-executable-bdd-coverage), [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-15-fr-24) |
| `.specs/dev-pomogator-canonical-plugin/*` | Specify the HTTP policy, evidence boundary, contract, verification, and ownership for issue #123. | [FR-15](FR.md#fr-15-managed-hot-path-hooks-are-http-registrations)–[FR-24](FR.md#fr-24-http-hook-policy-has-executable-bdd-coverage) |


| tools/hook-service/server.mjs | edit | Bounded stdout/stderr capture, route-local failure isolation, and session-keyed Stop event coordination for the 2026-07-23 OOM incident. | FR-13 |
| tests/hook-service.test.mjs | edit | Focused regression coverage for Stop route identity and bounded legacy execution. | FR-24 |
| tools/hook-service/ensure-up.mjs | edit | Readiness-before-lock check for concurrent startup waiters. | FR-13 |
| tools/hook-service/registry.mjs | edit | Preserve one-to-one generated Stop route entries; coordination remains service-local. | FR-15, FR-23 |

| tools/hook-service/worker-host.mjs | create | Load one explicit reusable adapter once and serve bounded versioned request/response frames. | FR-13, FR-14 |
| tools/hook-service/worker-manager.mjs | create | Lazy route-local worker lifecycle, FIFO serialization, idle eviction, recycle and no-retry boundary. | FR-13, FR-14 |
| tools/hook-service/worker-adapters/subagent-watchdog.mjs | create | Explicit persistent adapter for the audited re-entrant watchdog API; legacy CLI remains unchanged. | FR-13 |
| tools/hook-service/registry.mjs | edit | Emit persistent execution metadata only from the explicit audited capability map; default all other routes to child. | FR-13, FR-15 |

## PR #227 incident-hardening planned files

| Path | Action | Reason |
|---|---|---|
| `.claude-plugin/hooks.json`, `.claude/settings.json` | edit/generated | Replace 13 DevPomogator Stop registrations with one self-healing Stop dispatcher; preserve unrelated plugin ownership. |
| `tools/hook-service/generate-manifest.mjs`, `tools/hook-service/registry.mjs` | edit | Define one logical Stop group while retaining canonical internal route order and identities. |
| `tools/hook-service/client.mjs`, `server.mjs`, `event-coalescer.mjs` | edit | Carry request project identity and key flights by session + project + event. |
| `tools/hook-service/worker-manager.mjs`, worker adapters | edit | Pass explicit project context, isolate reuse, serialize bounded legacy fallback, preserve recycle/no-retry. |
| `tools/spec-conformance-push/spec-conformance-push.ts`, `tools/spec-conformance-guard/spec-conformance-guard.ts`, `tools/spec-check-log/writer.ts` | edit | Implement the cross-spec FR-83 project-root and retention contract. |
| `tests/features/core/CORE024_hook-review.feature` | edit | Executable mirror for CORE024_20–CORE024_22 after spec approval. |
| `tests/step_definitions/core024_hook_review.ts`, `tests/hook-service.test.mjs` | edit | Differential legacy oracle, one-command manifest, multi-project isolation, failure and resource-bound assertions. |
| installed-cache dependency-absent soak fixture | edit/create | Prove distinct plugin/project roots, no cache-local state, self-heal, and bounded Stop lifecycle on the exact built artifact. |
| `.specs/dev-pomogator-canonical-plugin/FR.md` | edit | Extend FR-13 with dispatcher and request identity. |
| `.specs/dev-pomogator-canonical-plugin/ACCEPTANCE_CRITERIA.md` | edit | Add AC-12 and AC-13. |
| `.specs/dev-pomogator-canonical-plugin/NFR.md` | edit | Add NFR-P5, NFR-R10, and NFR-R11. |
| `.specs/dev-pomogator-canonical-plugin/REQUIREMENTS.md` | edit | Add PR #227 incident traceability. |
| `.specs/dev-pomogator-canonical-plugin/USER_STORIES.md` | edit | Add User Stories 11 and 12. |
| `.specs/dev-pomogator-canonical-plugin/USE_CASES.md` | edit | Add UC-8. |
| `.specs/dev-pomogator-canonical-plugin/RESEARCH.md` | edit | Record incident and PR gap analysis. |
| `.specs/dev-pomogator-canonical-plugin/DESIGN.md` | edit | Record the one-dispatcher decision. |
| `.specs/dev-pomogator-canonical-plugin/TASKS.md` | edit | Add Phase 10 tasks. |
| `.specs/dev-pomogator-canonical-plugin/FILE_CHANGES.md` | edit | Declare explicit implementation and spec paths. |
| `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md` | edit | Record the spec-only PR addendum. |
| `.specs/dev-pomogator-canonical-plugin/dev-pomogator-canonical-plugin.feature` | edit | Add CORE024_20–CORE024_22. |
