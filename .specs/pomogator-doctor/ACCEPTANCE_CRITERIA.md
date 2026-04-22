# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-node-version-check-feature1)

WHEN Doctor запускается AND `node --version` возвращает версию < 22.6 THEN Doctor SHALL пометить check C1 как `severity=critical`, `reinstallable=no`, hint=`"Upgrade Node to ≥22.6 (see package.json engines)"`.

## AC-2 (FR-2) @feature1

**Требование:** [FR-2](FR.md#fr-2-git-presence-check-feature1)

WHEN Doctor запускается AND `git --version` возвращает non-zero exit code THEN Doctor SHALL пометить check C2 как critical с hint `"Install Git and ensure it's in PATH"`.

## AC-3 (FR-3) @feature2

**Требование:** [FR-3](FR.md#fr-3-devpomogator-structure-check-feature2)

IF `~/.dev-pomogator/config.json` OR `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` OR `~/.dev-pomogator/tools/<ext>/` для любого installed extension отсутствует THEN Doctor SHALL пометить соответствующий check как critical, `reinstallable=yes`.

## AC-4 (FR-4) @feature2

**Требование:** [FR-4](FR.md#fr-4-hooks-registry-sync-check-feature2)

WHEN Doctor сравнивает `.claude/settings.local.json → hooks` с `config.managed[projectPath].hooks` AND обнаружен hook в config но не в settings.local.json (или наоборот для orphan) THEN Doctor SHALL пометить C6 как critical `reinstallable=yes`.

## AC-5 (FR-5) @feature3

**Требование:** [FR-5](FR.md#fr-5-env-requirements-check-dual-location-feature3)

IF envRequirement `name` с `required=true` отсутствует И в `process.env` И в `.claude/settings.local.json → env` THEN Doctor SHALL пометить check как critical `reinstallable=no`, hint=`"Set <name> in .env OR .claude/settings.local.json env block, see .env.example"`.

## AC-6 (FR-6) @feature2

**Требование:** [FR-6](FR.md#fr-6-envexample-presence-check-feature2)

WHEN Doctor проверяет корень проекта AND `.env.example` не существует AND ≥1 installed extension имеет required envRequirements THEN Doctor SHALL пометить C8 как warning `reinstallable=yes`.

## AC-7 (FR-7) @feature11

**Требование:** [FR-7](FR.md#fr-7-bun-binary-check-extension-gated-feature11)

WHEN Doctor собрал список binaries из installed extensions AND "bun" ∈ binaries AND `bun --version` failed THEN Doctor SHALL пометить C9 как critical с platform-specific hint (PowerShell / curl install command). IF "bun" ∉ binaries THEN Doctor SHALL skip C9.

## AC-8 (FR-8) @feature11

**Требование:** [FR-8](FR.md#fr-8-python--perextension-packages-check-extension-gated-feature11)

WHEN Doctor собрал `pythonPackages[]` из installed extensions AND `python3 -c 'import <pkg>'` non-zero для любого pkg THEN Doctor SHALL пометить каждый missing package отдельным critical с hint `"pip install --user <pkg>"`.

## AC-9 (FR-9) @feature4

**Требование:** [FR-9](FR.md#fr-9-mcp-servers-parse-check-feature4)

WHEN Doctor грепает `.claude/rules/**/*.md` и `.claude/skills/**/*.md` по `mcp__(\w+)__` AND server name NOT found в `.mcp.json` NOR в `~/.claude/mcp.json` THEN Doctor SHALL пометить C11 как warning `reinstallable=no`.

## AC-10 (FR-10) @feature4

**Требование:** [FR-10](FR.md#fr-10-mcp-full-probe-check-feature4)

WHEN Doctor spawn-ит MCP server + sends JSON-RPC initialize+tools/list AND no response within 3 seconds THEN Doctor SHALL kill child с SIGKILL AND пометить C12 как critical `"probe failed: timeout 3s"`.

WHEN MCP server responds с valid `tools/list` array THEN Doctor SHALL пометить C12 как ok.

## AC-11 (FR-11) @feature2

**Требование:** [FR-11](FR.md#fr-11-version-match-check-feature2)

WHEN `package.json.version` major > `config.json.version` major THEN Doctor SHALL пометить C13 как critical `reinstallable=yes`.
WHEN minor delta THEN warning. WHEN patch delta THEN info.

## AC-12 (FR-12) @feature2

**Требование:** [FR-12](FR.md#fr-12-managed-gitignore-block-check-feature2)

IF target `.gitignore` не содержит `MARKER_BEGIN ... MARKER_END` block AND installed extensions managed files present THEN Doctor SHALL пометить C14 как warning `reinstallable=yes`.

## AC-13 (FR-13) @feature10

**Требование:** [FR-13](FR.md#fr-13-commandsskills-pluginloader-check-feature10)

WHEN Doctor читает `plugin.json → commands[]` / `skills[]` AND declared command NOT в `.claude/commands/*.md` AND NOT в `~/.claude/plugins/.../commands/*.md` THEN Doctor SHALL пометить C15 как critical `reinstallable=yes`, state=`BROKEN-missing`.

WHEN declared command exists ONLY в `~/.claude/plugins/.../commands/*.md` (dynamic registry) THEN Doctor SHALL пометить ok state=`OK-dynamic`.

## AC-14 (FR-14) @feature11

**Требование:** [FR-14](FR.md#fr-14-docker--devcontainer-cli-check-extension-gated-feature11)

IF `devcontainer` extension ∈ `config.installedExtensions` AND `docker --version` OR `devcontainer --version` failed THEN Doctor SHALL пометить C16 как critical `reinstallable=no` с platform hint.

IF `devcontainer` extension NOT ∈ installed THEN Doctor SHALL skip C16.

## AC-15 (FR-15) @feature1

**Требование:** [FR-15](FR.md#fr-15-slash-command-pomogatordoctor-feature1)

WHEN пользователь вводит `/pomogator-doctor` в Claude Code THEN Claude SHALL вызвать `.claude/commands/pomogator-doctor.md` instructions → spawn `dev-pomogator --doctor` (interactive mode).

## AC-16 (FR-16) @feature8

**Требование:** [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8)

WHEN пользователь запускает `dev-pomogator --doctor` в terminal THEN `src/index.ts` SHALL распарсить flag AND вызвать `runDoctor({interactive: true})`.
WHEN `--json` flag present THEN `{interactive: false, json: true}`.
WHEN `--quiet` flag present THEN `{quiet: true}`.

## AC-17 (FR-17) @feature4

**Требование:** [FR-17](FR.md#fr-17-sessionstart-hook-feature4)

WHEN Claude Code триггерит SessionStart event THEN extension `pomogator-doctor` hook SHALL вызвать `doctor-hook.ts --quiet` через tsx-runner-bootstrap AND write к stdout одну строку JSON `{"continue": true, "suppressOutput"?: true, "additionalContext"?: string}`.

WHEN все checks ok THEN output `{"continue":true,"suppressOutput":true}`.
WHEN ≥1 warning/critical THEN output includes `additionalContext` с brief summary.

## AC-18 (FR-18) @feature2

**Требование:** [FR-18](FR.md#fr-18-reinstall-integration-feature2)

IF mode=interactive AND count(checks WHERE severity != ok AND reinstallable=yes) ≥ 1 THEN Doctor SHALL вызвать AskUserQuestion с опциями `["Reinstall now", "Show details only"]`.

IF user answer == "Reinstall now" THEN Doctor SHALL `spawn('npx', ['dev-pomogator'], { stdio: 'inherit', shell: false })` AND ждать exit.

## AC-19 (FR-19) @feature2

**Требование:** [FR-19](FR.md#fr-19-reinstallable-classification-meta-feature2)

Each CheckResult SHALL содержать boolean field `reinstallable`. Classification per FR:
- reinstallable=yes: FR-3, FR-4, FR-6, FR-11, FR-12, FR-13
- reinstallable=no: FR-1, FR-2, FR-5, FR-7, FR-8, FR-9, FR-10, FR-14

## AC-20 (FR-20) @feature9

**Требование:** [FR-20](FR.md#fr-20-trafficlight-grouped-output-feature9)

WHEN mode=interactive AND `--json` absent THEN reporter SHALL вывести output в 3 группах:
- 🟢 Self-sufficient (checks без external deps)
- 🟡 Needs env vars (checks с type=env-requirement)
- 🔴 Needs external deps (checks с binary/package dependencies)

Summary line внизу: `"N ok, M warnings, K critical (of Total relevant checks)"`.

## AC-21 (FR-21) @feature11

**Требование:** [FR-21](FR.md#fr-21-perextension-driving-feature11)

WHEN Doctor reads `config.installedExtensions` AND extension NOT installed THEN Doctor SHALL skip все extension-gated checks для этого extension. Report SHALL прицифре относительных relevant checks: `"N of 17 checks relevant for your K installed extensions"`.

## AC-22 (FR-22) @feature11

**Требование:** [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11)

Spec SHALL add `dependencies` optional field к `extension.json` schema с sub-fields: `node?: string`, `binaries?: string[]`, `pythonPackages?: string[]`, `docker?: boolean`. Doctor SHALL parse field; missing field → extension treated как 🟢 self-sufficient.

## AC-23 (FR-23) @feature8

**Требование:** [FR-23](FR.md#fr-23-exit-codes-feature8)

WHEN Doctor завершает run THEN process SHALL exit с:
- code 0 if all relevant checks ok
- code 1 if ≥1 warning AND 0 critical
- code 2 if ≥1 critical

## AC-24 (FR-24) @feature8

**Требование:** [FR-24](FR.md#fr-24-json-output-mode-feature8)

WHEN `--json` flag THEN Doctor stdout SHALL be valid JSON array `CheckResult[]` (per `pomogator-doctor_SCHEMA.md`). No ANSI escape codes, no chalk.

## AC-25 (FR-25) @feature8

**Требование:** [FR-25](FR.md#fr-25-env-values-redaction-in-json-feature8)

IF `--json` flag AND check.type == `env-requirement` THEN JSON CheckResult SHALL NOT include `value` field. Only `name: string, status: "set" | "unset"`.

---

# Post-Launch Hardening Acceptance Criteria (2026-04-20)

## AC-26 (FR-26) @feature12

**Требование:** [FR-26](FR.md#fr-26-hook-command-integrity-check-feature12)

WHEN Doctor parses `projectRoot/.claude/settings.local.json → hooks` AND обнаруживает hook entry с `command` ссылающимся на `.dev-pomogator/tools/{ext}/{script}.{ts,sh,mjs,cjs,js}` AND файл не существует на диске THEN Doctor SHALL emit check с `id=C20:{event}:{script}`, severity=critical, reinstallable=yes, message начинается с `{event}:` и перечисляет missing скрипты (до 5) + "…N more" если count > 5.

## AC-27 (FR-27) @feature12

**Требование:** [FR-27](FR.md#fr-27-managed-files-hash-integrity-check-feature12)

WHEN Doctor iterates `installedExtensions[*].managed[projectRoot].tools[]` для current projectRoot AND entry.path file существует AND `sha256(fs.readFileSync(entry.path))` ≠ `entry.hash` AND file size ≤ 1MB THEN Doctor SHALL emit check с severity=warning, reinstallable=no, hint включающим relative path и слова "user edit or version drift". IF file отсутствует THEN severity=critical, reinstallable=yes. IF file size > 1MB — hash check skipped, emit ok с note `"skipped hash (file > 1MB)"`.

## AC-28 (FR-28) @feature10

**Требование:** [FR-28](FR.md#fr-28-plugin-manifest-presence-for-installed-projects-feature10)

IF `projectRoot` ∈ `installedExtensions[*].projectPaths` (хотя бы одна extension декларирует этот projectRoot) AND `path.join(projectRoot, '.dev-pomogator', '.claude-plugin', 'plugin.json')` does not exist THEN Doctor SHALL override previous behavior (silent ok) and emit C15 с severity=critical, reinstallable=yes, hint содержащим "plugin manifest missing" AND "Claude Code cannot load commands/skills".

## AC-29 (FR-29) @feature12

**Требование:** [FR-29](FR.md#fr-29-pomogator-doctor-self-install-in-all-projectpaths-feature12)

WHEN Doctor проверяет current projectRoot AND (a) `pomogator-doctor` ∉ `installedExtensions[*].name` OR (b) projectRoot ∉ `(installedExtensions[ext=pomogator-doctor]).projectPaths` OR (c) `.claude/settings.local.json → hooks.SessionStart` не содержит команды с substring `"pomogator-doctor/doctor-hook"` THEN Doctor SHALL emit severity=warning, reinstallable=yes, hint starts with "proactive broken-install detection disabled".

## AC-30 (FR-30) @feature8

**Требование:** [FR-30](FR.md#fr-30-allprojects-flag-feature8)

WHEN CLI invoked с `--all-projects` THEN Doctor SHALL iterate deduplicated union of `installedExtensions[*].projectPaths` AND для каждого projectPath выполнить isolated doctor run с concurrency ≤ 4. Output structure:
- Interactive mode: per-project section `=== {projectPath} ===` + traffic-light + per-project summary; top-level aggregate summary "Scanned N projects: M healthy, K with issues".
- `--json` mode: `{"projects": {"<path>": CheckResult[], ...}, "aggregate": {"ok": ..., "warnings": ..., "critical": ...}}`.
- Exit code = `max(per-project exit codes)` ∈ {0, 1, 2}.
- IF `installedExtensions[*].projectPaths` union empty THEN stderr `"no installed projects recorded"`, exit 0.

## AC-31 (FR-31) @feature2

**Требование:** [FR-31](FR.md#fr-31-hooks-registry-path-correction-feature2)

WHEN Doctor computes expected hooks THEN Doctor SHALL aggregate `installedExtensions[*].managed[projectRoot]?.hooks` (union of per-extension hook records для current projectRoot). IF same command string appears ≥2 times в aggregated union THEN Doctor SHALL emit warning "duplicate hook registration across extensions: {cmd}". Missing expected event/commands compared к settings.local.json → critical; stale keys in settings.local.json не в union → warning с reinstall hint. On healthy installation where union matches settings.local.json exactly — check is `ok`. (Previous behavior: always critical due to wrong path — regression fixed.)

## AC-32 (FR-32) @feature2

**Требование:** [FR-32](FR.md#fr-32-configjson-toplevel-version-field-feature2)

WHEN Installer writes `~/.dev-pomogator/config.json` THEN JSON object SHALL include top-level `"version": "<package.json.version>"` key. Doctor FR-11 reads from `ctx.config.version` (top-level). IF `ctx.config.version` is null/undefined/empty string THEN emit severity=warning, reinstallable=yes, hint contains "lacks top-level version". IF field present AND valid semver AND matches `packageVersion` — severity=ok.

## AC-33 (FR-33) @feature4

**Требование:** [FR-33](FR.md#fr-33-mcp-probe-timeout--error-categorization-feature4)

WHEN MCP probe executes THEN timeout SHALL be 10_000 ms (not 3_000). Severity mapping:
- outcome `timeout` → severity=warning (not critical), hint starts with "probe did not complete in 10s".
- outcome `spawn ENOENT` → severity=critical, hint mentions "PATH".
- outcome `spawn EACCES` → severity=critical, hint mentions "permission denied".
- outcome `server exited` (non-zero before handshake) → severity=critical, hint includes exit code numeric value.
- successful handshake → severity=ok.

## AC-34 (FR-34) @feature12

**Требование:** [FR-34](FR.md#fr-34-stale-managed-entries-detection-feature12)

WHEN Doctor extracts distinct tool-directory names (first path segment after `.dev-pomogator/tools/`) from `installedExtensions[*].managed[projectRoot].tools[].path` AND name ∉ (installedExtensions names ∪ declared sub-tool names из `extensions/{ext}/extension.json → tools`) THEN Doctor SHALL emit severity=warning, reinstallable=yes, message lists orphaned names, hint starts with "managed entries orphaned from removed/renamed extension". Known validated case: `specs-validator` is declared as sub-tool of `specs-workflow` extension → NOT orphan.
