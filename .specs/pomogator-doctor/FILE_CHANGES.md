# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи pomogator-doctor.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

## Shared core (src/doctor/) — NEW

| Path | Action | Reason |
|------|--------|--------|
| `src/doctor/index.ts` | create | [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8): public API `runDoctor(options)` |
| `src/doctor/runner.ts` | create | [FR-21](FR.md#fr-21-perextension-driving-feature11): orchestrator + per-extension gating + concurrent pool |
| `src/doctor/reporter.ts` | create | [FR-20](FR.md#fr-20-trafficlight-grouped-output-feature9), [FR-24](FR.md#fr-24-json-output-mode-feature8), [FR-25](FR.md#fr-25-env-values-redaction-in-json-feature8): chalk/JSON/hook formatters |
| `src/doctor/reinstall.ts` | create | [FR-18](FR.md#fr-18-reinstall-integration-feature2): AskUserQuestion + spawn npx dev-pomogator |
| `src/doctor/types.ts` | create | [FR-19](FR.md#fr-19-reinstallable-classification-meta-feature2): CheckResult/DoctorOptions/DoctorReport interfaces (см. [SCHEMA](pomogator-doctor_SCHEMA.md)) |
| `src/doctor/lock.ts` | create | [NFR-R-4](NFR.md#reliability): file lock против 2 concurrent runs |

## Check implementations (src/doctor/checks/) — NEW

| Path | Action | Reason |
|------|--------|--------|
| `src/doctor/checks/node-version.ts` | create | [FR-1](FR.md#fr-1-node-version-check-feature1) |
| `src/doctor/checks/git.ts` | create | [FR-2](FR.md#fr-2-git-presence-check-feature1) |
| `src/doctor/checks/pomogator-home.ts` | create | [FR-3](FR.md#fr-3-devpomogator-structure-check-feature2) |
| `src/doctor/checks/hooks-registry.ts` | create | [FR-4](FR.md#fr-4-hooks-registry-sync-check-feature2) |
| `src/doctor/checks/env-vars.ts` | create | [FR-5](FR.md#fr-5-env-requirements-check-dual-location-feature3): dual location |
| `src/doctor/checks/env-example.ts` | create | [FR-6](FR.md#fr-6-envexample-presence-check-feature2) |
| `src/doctor/checks/bun.ts` | create | [FR-7](FR.md#fr-7-bun-binary-check-extension-gated-feature11): extension-gated |
| `src/doctor/checks/python.ts` | create | [FR-8](FR.md#fr-8-python--perextension-packages-check-extension-gated-feature11): per-ext packages |
| `src/doctor/checks/mcp-parse.ts` | create | [FR-9](FR.md#fr-9-mcp-servers-parse-check-feature4) |
| `src/doctor/checks/mcp-probe.ts` | create | [FR-10](FR.md#fr-10-mcp-full-probe-check-feature4): stdio/http JSON-RPC с SIGKILL |
| `src/doctor/checks/version-match.ts` | create | [FR-11](FR.md#fr-11-version-match-check-feature2) |
| `src/doctor/checks/gitignore-block.ts` | create | [FR-12](FR.md#fr-12-managed-gitignore-block-check-feature2) |
| `src/doctor/checks/plugin-loader.ts` | create | [FR-13](FR.md#fr-13-commandsskills-pluginloader-check-feature10): 4-state detection |
| `src/doctor/checks/docker.ts` | create | [FR-14](FR.md#fr-14-docker--devcontainer-cli-check-extension-gated-feature11): extension-gated |

## Core CLI wiring — EDIT existing

| Path | Action | Reason |
|------|--------|--------|
| `src/index.ts` | edit | [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8): parse --doctor/--json/--quiet/--extension flags, call runDoctor |

## Extension pomogator-doctor — NEW

| Path | Action | Reason |
|------|--------|--------|
| `extensions/pomogator-doctor/extension.json` | create | Manifest: SessionStart hook registration + category metadata. Включает новое `dependencies` поле (empty — self-sufficient) per [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11) |
| `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` | create | [FR-17](FR.md#fr-17-sessionstart-hook-feature4): thin wrapper вызывающий runDoctor({quiet:true}) |
| `extensions/pomogator-doctor/claude/commands/pomogator-doctor.md` | create | [FR-15](FR.md#fr-15-slash-command-pomogatordoctor-feature1): slash-command markdown с allowed-tools |

## Extension.json schema propagation — EDIT existing extensions (FR-22)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/claude-mem-health/extension.json` | edit | Add `dependencies: {binaries: ['chroma','python3'], pythonPackages: ['chromadb']}` |
| `extensions/bun-oom-guard/extension.json` | edit | Add `dependencies: {binaries: ['bun']}` |
| `extensions/devcontainer/extension.json` | edit | Add `dependencies: {docker: true}` |
| `extensions/forbid-root-artifacts/extension.json` | edit | Add `dependencies: {binaries: ['python3'], pythonPackages: ['pyyaml','simple-term-menu']}` |
| `extensions/tui-test-runner/extension.json` | edit | Add `dependencies: {binaries: ['python3'], pythonPackages: ['textual']}` |

> Note: `mcp-setup` не является extension в текущем коде — это standalone setup script. Doctor FR-9/FR-10 проверяют MCP серверы через `.mcp.json` / `~/.claude/mcp.json` parsing, не через extension manifest.

> Примечание: 🟢 self-sufficient extensions (auto-simplify, bg-task-guard, plan-pomogator, specs-workflow, test-quality, suggest-rules, learnings-capture) не требуют dependencies поля — treated default как self-sufficient per [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11).

## BDD step definitions + hooks — NEW

| Path | Action | Reason |
|------|--------|--------|
| `tests/features/plugins/pomogator-doctor/doctor-core.test.ts` | create | Tests для FR-1..FR-14 (14 checks), маппинг 1:1 scenarios 01, 06, 13 |
| `tests/features/plugins/pomogator-doctor/doctor-entry.test.ts` | create | Tests для FR-15/FR-16/FR-17 (3 entry points), scenarios 04, 05, 15 |
| `tests/features/plugins/pomogator-doctor/doctor-reinstall.test.ts` | create | Tests для FR-18/FR-19, scenarios 02, 07, 09 |
| `tests/features/plugins/pomogator-doctor/doctor-output.test.ts` | create | Tests для FR-20/FR-23/FR-24/FR-25, scenarios 08, 10 |
| `tests/features/plugins/pomogator-doctor/doctor-gating.test.ts` | create | Tests для FR-21/FR-22, scenarios 03, 11, 12 |
| `tests/features/plugins/pomogator-doctor/doctor-reliability.test.ts` | create | Tests для NFR Reliability, scenarios 13, 14 |
| `tests/e2e/pomogator-doctor.test.ts` | create | Full E2E: install → doctor → verify output (integration через runInstaller helper) |

## BDD fixtures and hooks — NEW

| Path | Action | Reason |
|------|--------|--------|
| `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | create | F-1..F-5, F-12..F-13 factory. [FIXTURES](FIXTURES.md#f-1-temp-home-valid) |
| `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` | create | F-6..F-8 stdio JSON-RPC servers для FR-10 probe tests |
| `tests/fixtures/pomogator-doctor/env-snapshot.ts` | create | env-snapshot beforeEach/afterEach hook |
| `tests/fixtures/pomogator-doctor/child-registry.ts` | create | Global SIGKILL safety net (NFR-R-5) |
| `tests/fixtures/pomogator-doctor/dotenv-fixtures/valid.env` | create | F-9 — valid env with fake API key |
| `tests/fixtures/pomogator-doctor/dotenv-fixtures/missing-key.env` | create | F-10 — missing AUTO_COMMIT_API_KEY |
| `tests/fixtures/pomogator-doctor/dotenv-fixtures/malformed.env` | create | F-11 — malformed lines |

## package.json — EDIT existing

| Path | Action | Reason |
|------|--------|--------|
| `package.json` | edit | Add optional runtime deps: `p-limit` (bounded concurrency pool for NFR-P-3). Add dev-dep `@types/semver` if not present. |

## Documentation — EDIT existing

| Path | Action | Reason |
|------|--------|--------|
| `README.md` | edit | Добавить раздел "Doctor Command" с примерами `/pomogator-doctor`, `dev-pomogator --doctor --json`, onboarding для новых юзеров |
| `CLAUDE.md` | edit | Добавить `/pomogator-doctor` в таблицу Commands |

## Spec files — EDIT (this spec)

| Path | Action | Reason |
|------|--------|--------|
| `.specs/pomogator-doctor/*.md` | edit (this phase) | Already заполнены в Phase 1..2 |
| `.specs/pomogator-doctor/AUDIT_REPORT.md` | create (Phase 3+) | Post-audit summary (see TASKS Phase 3+) |

## Updater integration — EDIT existing

| Path | Action | Reason |
|------|--------|--------|
| `src/updater/index.ts` | edit (optional) | Updater может опционально вызывать `runDoctor({quiet:true})` после успешного update чтобы предупредить если что-то сломалось post-update. Nice-to-have, не блокирующее. |

## Post-Launch Hardening — NEW (2026-04-20)

> Добавляются при реализации FR-26..FR-34. Ссылка: TASKS.md Phase 8.

| Path | Action | Reason |
|------|--------|--------|
| `src/doctor/checks/hook-command-integrity.ts` | create | [FR-26](FR.md#fr-26-hook-command-integrity-check-feature12): парсер settings.local.json hooks + fs.existsSync per extracted script path |
| `src/doctor/checks/managed-files-integrity.ts` | create | [FR-27](FR.md#fr-27-managed-files-hash-integrity-check-feature12): итерация managed.tools[] + sha256 compare + 1MB size guard |
| `src/doctor/checks/stale-managed.ts` | create | [FR-34](FR.md#fr-34-stale-managed-entries-detection-feature12): cross-ref installed names ↔ managed.tools first-segment |

## Post-Launch Hardening — EDIT existing (2026-04-20)

| Path | Action | Reason |
|------|--------|--------|
| `src/doctor/checks/hooks-registry.ts` | edit | [FR-31](FR.md#fr-31-hooks-registry-path-correction-feature2): fix JSON path → `installedExtensions[*].managed[projectRoot].hooks` aggregation + duplicate detection |
| `src/doctor/checks/plugin-loader.ts` | edit | [FR-28](FR.md#fr-28-plugin-manifest-presence-for-installed-projects-feature10): missing plugin.json для installed project → critical (было silent ok) |
| `src/doctor/checks/version-match.ts` | edit | [FR-32](FR.md#fr-32-configjson-toplevel-version-field-feature2): updated hint when top-level version field missing |
| `src/doctor/checks/mcp-probe.ts` | edit | [FR-33](FR.md#fr-33-mcp-probe-timeout--error-categorization-feature4): 10s timeout, warning vs critical categorization, ENOENT/EACCES/exit-code hints |
| `src/doctor/checks/index.ts` | edit | Append C20 (hook-command-integrity), C21 (managed-files-integrity), C22 (stale-managed) to phase2Checks array |
| `src/doctor/runner.ts` | edit | [FR-30](FR.md#fr-30-allprojects-flag-feature8): export `executeChecksAllProjects` с `p-limit(4)` |
| `src/doctor/reporter.ts` | edit | [FR-30](FR.md#fr-30-allprojects-flag-feature8): new mode "all-projects" + JSON nested projects object |
| `src/doctor/constants.ts` | edit | [FR-33](FR.md#fr-33-mcp-probe-timeout--error-categorization-feature4): PROBE_MS = 10_000 (was 3_000) |
| `src/doctor/index.ts` | edit | [FR-30](FR.md#fr-30-allprojects-flag-feature8): `runDoctor({allProjects:true, ...})` overload |
| `src/index.ts` | edit | [FR-30](FR.md#fr-30-allprojects-flag-feature8): CLI parse `--all-projects` flag |
| `src/config/index.ts` | edit | [FR-32](FR.md#fr-32-configjson-toplevel-version-field-feature2): writer injects top-level `version: pkg.version` on save + backfill |
| `src/installer/index.ts` | edit | [FR-32](FR.md#fr-32-configjson-toplevel-version-field-feature2): pass version to config writer; [FR-29](FR.md#fr-29-pomogator-doctor-self-install-in-all-projectpaths-feature12): ensure pomogator-doctor installed by default |
| `src/installer/extensions.ts` | edit | [FR-29](FR.md#fr-29-pomogator-doctor-self-install-in-all-projectpaths-feature12): add `pomogator-doctor` to default-install list with `alwaysInstall: true` semantic |
| `extensions/pomogator-doctor/extension.json` | edit | [FR-29](FR.md#fr-29-pomogator-doctor-self-install-in-all-projectpaths-feature12): add `category: "infrastructure"` + `alwaysInstall: true` field |
| `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` | edit | Enhanced banner — если ≥3 C20/C21 critical, message специфичен к "hook/tool files missing" |
| `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | edit | Add preset `"webapp-like"` (F-14) + options `missingPluginManifest`, `configWithoutVersion`, `staleManagedEntries`, `hashMismatch`, `fileOver1MB` |
| `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` | edit | Add preset `"nonexistent-command"` to test spawn ENOENT path |
| `tests/features/plugins/pomogator-doctor/doctor-integrity.test.ts` | create | New test file for scenarios 16..21, 30, 31 (C20/C21/C22 integrity checks) |
| `tests/features/plugins/pomogator-doctor/doctor-selfinstall.test.ts` | create | New test file for scenarios 22, 23 (plugin manifest + self-install) |
| `tests/features/plugins/pomogator-doctor/doctor-allprojects.test.ts` | create | New test file for scenario 24 (--all-projects flag) |
| `tests/features/plugins/pomogator-doctor/doctor-regression.test.ts` | create | New test file for scenarios 25, 26, 27, 28, 29 (fixed existing checks) |

## Summary (updated)

- **Create (initial + post-launch)**: 33 + 4 = 37 files
- **Edit (initial + post-launch)**: 10 + 16 = 26 files
- **Total**: 63 file operations

Полный mapping FR → implementation file см. в TASKS.md (Phase 1-7 initial + Phase 8 post-launch).
