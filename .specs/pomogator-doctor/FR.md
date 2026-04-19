# Functional Requirements (FR)

> Каждый FR содержит meta-поле `reinstallable: yes|no` определяющее может ли `npx dev-pomogator` починить проблему, обнаруженную этим check.

## FR-1: Node version check @feature1

Doctor SHALL проверить что `node --version` возвращает версию ≥ 22.6 (для native strip-types, требуется dev-pomogator hooks через tsx-runner). WHEN версия < 22.6 THEN Doctor SHALL пометить check как `severity=critical`, `reinstallable=no`, hint=`"Upgrade Node to ≥22.6 (see package.json engines)"`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--всё-окружение-в-порядке-feature1)

## FR-2: Git presence check @feature1

Doctor SHALL проверить что `git --version` executable. Если нет — critical hint `"Install Git and ensure it's in PATH"`. Meta: `reinstallable: no`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## FR-3: ~/.dev-pomogator/ structure check @feature2

Doctor SHALL проверить существование `~/.dev-pomogator/config.json`, `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs`, `~/.dev-pomogator/tools/{ext}/` для каждого extension из `config.installedExtensions`. Missing file → critical. Meta: `reinstallable: yes` — installer восстанавливает.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-missing-tools--предложение-переустановки-feature2)

## FR-4: Hooks registry sync check @feature2

Doctor SHALL сравнить `.claude/settings.local.json → hooks` с `~/.dev-pomogator/config.json → managed[projectPath].hooks`. Если диvergence (missing hook, stale command path) → critical. Meta: `reinstallable: yes`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## FR-5: Env requirements check (dual location) @feature3

Doctor SHALL проверить что каждый `envRequirement` из `config.installedExtensions[*].envRequirements` с `required=true` имеет значение в **одном из двух мест**: (1) `process.env[name]` (через dotenv из `.env`), (2) `.claude/settings.local.json → env[name]`. Missing → critical. Meta: `reinstallable: no` (API keys — secret, manual setup).

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-missing-api-key--переустановка-не-поможет-feature3), [UC-12](USE_CASES.md#uc-12-api-key-в-settingslocaljson-env-fallback-feature3)

## FR-6: .env.example presence check @feature2

Doctor SHALL проверить что `.env.example` существует в корне проекта с шаблоном для всех required envRequirements. Missing → warning. Meta: `reinstallable: yes` (installer генерит).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

## FR-7: Bun binary check (extension-gated) @feature11

Doctor SHALL проверить `bun --version` **только если** хотя бы один installed extension декларирует `dependencies.binaries` содержащий `"bun"` (например `claude-mem-health`, `bun-oom-guard`). Missing → critical с hint установки (PowerShell `irm bun.sh/install.ps1 | iex` / curl `bun.sh/install`). Meta: `reinstallable: no`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## FR-8: Python + per-extension packages check (extension-gated) @feature11

Doctor SHALL проверить `python3 --version` + для каждого installed extension из `dependencies.pythonPackages` выполнить `python3 -c 'import <pkg>'`. Extension → package mapping: claude-mem-health → chromadb, forbid-root-artifacts → pyyaml + simple-term-menu, tui-test-runner → textual. Missing → critical с hint `pip install --user <pkg>`. Meta: `reinstallable: no`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

## FR-9: MCP servers parse check @feature4

Doctor SHALL grep `.claude/rules/*.md` и `.claude/skills/**/*.md` по паттерну `mcp__(\w+)__` → список referenced MCP server names. Для каждого проверить существование в `.mcp.json` ИЛИ `~/.claude/mcp.json`. Referenced но не configured → warning. Meta: `reinstallable: no` (manual configure).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)

## FR-10: MCP Full probe check @feature4

Doctor SHALL для каждого configured MCP server (из FR-9): spawn stdio процесс ИЛИ fetch http endpoint, отправить JSON-RPC `initialize` + `tools/list`, ожидать ответ с hard timeout 3s. Timeout → `child.kill('SIGKILL')` + critical `"probe failed: timeout 3s"`. Meta: `reinstallable: no`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-6](USE_CASES.md#uc-6-mcp-probe-timeout-feature4)

## FR-11: Version match check @feature2

Doctor SHALL сравнить `package.json.version` (dev-pomogator npm package в `node_modules/` или `npm ls`) с `~/.dev-pomogator/config.json.version`. WHEN major version delta THEN Doctor SHALL пометить check как `severity=critical`. WHEN minor delta THEN severity=warning. WHEN patch delta THEN severity=info. Meta: `reinstallable: yes`.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-7](USE_CASES.md#uc-7-version-mismatch--переустановка-feature2)

## FR-12: Managed gitignore block check @feature2

Doctor SHALL искать `MARKER_BEGIN ... MARKER_END` block в `.gitignore` target проекта (формат `src/installer/gitignore.ts`). Missing → warning. Meta: `reinstallable: yes`.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)

## FR-13: Commands/Skills plugin-loader check @feature10

Doctor SHALL сравнить declared commands/skills из `.dev-pomogator/.claude-plugin/plugin.json` с physically present в `.claude/commands/` + `.claude/skills/` ПЛЮС registered dynamically в `~/.claude/plugins/`. Classification states: OK-physical / OK-dynamic / BROKEN-missing (declared + не существует нигде) / STALE-orphan (physical без declaration). BROKEN-missing → critical. Meta: `reinstallable: yes`.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-9](USE_CASES.md#uc-9-commandsskills-не-зарегистрированы-в-plugin-loader-feature10)

## FR-14: Docker + devcontainer CLI check (extension-gated) @feature11

Doctor SHALL проверить `docker --version` + `devcontainer --version` **только если** `devcontainer` extension установлен (из `config.installedExtensions`). Missing → critical с hint (Docker Desktop + `npm install -g @devcontainers/cli`). Meta: `reinstallable: no`.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)

## FR-15: Slash command /pomogator-doctor @feature1

Doctor SHALL expose slash command `/pomogator-doctor` через `.claude/commands/pomogator-doctor.md` с frontmatter `allowed-tools: [Bash, AskUserQuestion]`. При вызове командой запускает interactive mode Doctor с chalk output.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)

## FR-16: CLI flag dev-pomogator --doctor @feature8

Doctor SHALL быть доступен через `dev-pomogator --doctor` в `src/index.ts` рядом с `--status`/`--update`. Поддерживает дополнительные flags: `--json` (machine-readable), `--quiet` (JSON hook payload only), `--extension <name>` (filter checks для конкретного extension).

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
**Use Case:** [UC-8](USE_CASES.md#uc-8-ci-mode--machine-readable-output-feature8)

## FR-17: SessionStart hook @feature4

Extension `pomogator-doctor` SHALL зарегистрировать SessionStart hook вызывающий `doctor-hook.ts --quiet` через `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs`. Hook SHALL следовать JSON protocol (stdout одна строка `{continue, suppressOutput?, additionalContext?}`).

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
**Use Case:** [UC-4](USE_CASES.md#uc-4-sessionstart-silent-when-ok-feature4), [UC-5](USE_CASES.md#uc-5-sessionstart-banner-on-problem-feature4)

## FR-18: Reinstall integration @feature2

IF Doctor обнаружил ≥1 check с `severity != ok` AND `reinstallable: yes` AND mode=interactive, Doctor SHALL вызвать `AskUserQuestion` с текстом `"Found N problem(s) that can be fixed by reinstall. Run 'npx dev-pomogator' now?"` и опциями `["Reinstall now", "Show details only"]`. If answer == "Reinstall now" → `spawn('npx', ['dev-pomogator'], { stdio: 'inherit' })`.

**Связанные AC:** [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18)
**Use Case:** [UC-2](USE_CASES.md#uc-2-missing-tools--предложение-переустановки-feature2), [UC-7](USE_CASES.md#uc-7-version-mismatch--переустановка-feature2)

## FR-19: Reinstallable classification meta @feature2

Каждый CheckResult SHALL содержать field `reinstallable: boolean`. Checks FR-3, FR-4, FR-6, FR-11, FR-12, FR-13 → `yes`. Checks FR-1, FR-2, FR-5, FR-7, FR-8, FR-9, FR-10, FR-14 → `no`.

**Связанные AC:** [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19)

## FR-20: Traffic-light grouped output @feature9

Reporter SHALL группировать output по 3 категориям с emoji headers: 🟢 **Self-sufficient** (no external deps), 🟡 **Needs env vars** (secrets required), 🔴 **Needs external deps** (binaries/packages). Каждый check mapped к группе по его dependency type. Summary row внизу: `"8 ok, 2 warnings, 1 critical"`.

**Связанные AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20)
**Use Case:** [UC-10](USE_CASES.md#uc-10-traffic-light-отчёт-по-установленным-extensions-feature9)

## FR-21: Per-extension driving @feature11

Doctor SHALL читать `~/.dev-pomogator/config.json → installedExtensions` и запускать **только** relevant checks. Extension-gated checks (FR-7 Bun, FR-8 Python, FR-14 Docker) skip-аются если ни один installed extension их не требует. Report SHALL указать `"N of 17 checks relevant for your K installed extensions"`.

**Связанные AC:** [AC-21](ACCEPTANCE_CRITERIA.md#ac-21-fr-21)
**Use Case:** [UC-11](USE_CASES.md#uc-11-per-extension-gated-checks-feature11)

## FR-22: extension.json dependencies schema @feature11

Spec SHALL ввести новое optional поле `dependencies` в `extension.json` schema с sub-полями: `node: string (semver)`, `binaries: string[]` (например `["bun", "python3", "docker"]`), `pythonPackages: string[]` (например `["chromadb", "pyyaml"]`), `docker: boolean`. Doctor читает это поле для FR-21 gating. Extensions без dependencies считаются 🟢 self-sufficient.

**Связанные AC:** [AC-22](ACCEPTANCE_CRITERIA.md#ac-22-fr-22)

## FR-23: Exit codes @feature8

Doctor process SHALL exit с code 0 (все checks ok), 1 (≥1 warning, 0 critical), 2 (≥1 critical). Exit code учитывает только **relevant** checks (после FR-21 gating).

**Связанные AC:** [AC-23](ACCEPTANCE_CRITERIA.md#ac-23-fr-23)

## FR-24: JSON output mode @feature8

WHEN `--json` flag указан THEN Doctor SHALL output JSON array `CheckResult[]` к stdout вместо chalk table. JSON следует schema в `pomogator-doctor_SCHEMA.md`. No chalk colors, no ANSI codes.

**Связанные AC:** [AC-24](ACCEPTANCE_CRITERIA.md#ac-24-fr-24)

## FR-25: Env values redaction in JSON @feature8

WHEN `--json` flag указан AND check type=env-requirement THEN JSON output SHALL redact env var **values**: показать только `{name: "AUTO_COMMIT_API_KEY", status: "set" | "unset"}` без value. Защита от случайной утечки API keys в CI logs.

**Связанные AC:** [AC-25](ACCEPTANCE_CRITERIA.md#ac-25-fr-25)
