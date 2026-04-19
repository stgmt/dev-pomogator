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
