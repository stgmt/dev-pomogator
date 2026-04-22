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

---

# Post-Launch Hardening (2026-04-20) — Edge Cases from Real-World Usage

> Добавлено после incident-отчёта по `D:\repos\webapp\`: 22 broken хука на Stop/SessionStart/PreToolUse/UserPromptSubmit/PostToolUse, доктор выдал false-positive critical на C6 (неправильный JSON-path) и промолчал про project-local wipe (C5 смотрит в HOME). См. `RESEARCH.md` секцию `## Post-Launch Edge Cases Found (2026-04-20)` с file:line пруфами из живого запуска.

## FR-26: Hook Command Integrity check @feature12

Doctor SHALL парсить `projectRoot/.claude/settings.local.json → hooks` во всех 3 форматах (string, object, array per `.claude/rules/gotchas/installer-hook-formats.md`), извлекать relative paths на `.dev-pomogator/tools/**/*.{ts,sh,mjs,cjs,js}` из каждого `command`-поля и проверять существование каждого файла через `fs.existsSync(path.join(projectRoot, extractedPath))`. WHEN файл отсутствует THEN Doctor SHALL пометить check как `severity=critical`, `reinstallable=yes`, сгруппировать missing по event name, и включить в hint точный список отсутствующих путей (до 5 + "…N more"). Parser edge case: `bash .dev-pomogator/tools/X.sh` (shell hook без tsx-runner) — отдельный regex для shell path extraction.

Meta: `reinstallable: yes`.

**Связанные AC:** [AC-26](ACCEPTANCE_CRITERIA.md#ac-26-fr-26)
**Use Case:** [UC-13](USE_CASES.md#uc-13-hook-storm-on-broken-project-feature12)

## FR-27: Managed Files Hash Integrity check @feature12

Doctor SHALL итерировать `config.installedExtensions[*].managed[projectRoot].tools[]` для current projectRoot. Для каждого entry: (1) `fs.existsSync(path.join(projectRoot, entry.path))` — missing → severity=critical `reinstallable=yes`; (2) пересчитать `crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')`, сравнить с `entry.hash` — mismatch → severity=warning `reinstallable=no` с hint "file modified since install (user edit or version drift); compare with `extensions/{ext}/tools/` source". Performance guard: hash check skip если file size > 1MB (NFR-P-1 protection).

Meta: missing → `reinstallable: yes`; hash-mismatch → `reinstallable: no`.

**Связанные AC:** [AC-27](ACCEPTANCE_CRITERIA.md#ac-27-fr-27)
**Use Case:** [UC-14](USE_CASES.md#uc-14-partial-wipe-managed-files-feature12), [UC-15](USE_CASES.md#uc-15-content-hash-drift-feature12)

## FR-28: Plugin manifest presence for installed projects @feature10

**FIX to FR-13.** IF current `projectRoot` ∈ `installedExtensions[*].projectPaths` AND `.dev-pomogator/.claude-plugin/plugin.json` does not exist THEN Doctor SHALL mark C15 as `severity=critical`, `reinstallable=yes`, hint=`"plugin manifest missing — Claude Code cannot load commands/skills from this project; run reinstall"`. Previous behavior (missing manifest → silent ok) является **blind spot** — manifest tracked в `managed.tools[]` и без него `/pomogator-doctor` сам не зарегистрирован в Claude Code.

Meta: `reinstallable: yes`.

**Связанные AC:** [AC-28](ACCEPTANCE_CRITERIA.md#ac-28-fr-28)

## FR-29: pomogator-doctor self-install in all projectPaths @feature12

Installer SHALL при любой успешной установке в project записать extension `pomogator-doctor` в `config.installedExtensions` с `projectPaths` включающим target, и его SessionStart hook в target `.claude/settings.local.json → hooks.SessionStart` — **автоматически без opt-in**. Doctor SHALL проверить: (a) `pomogator-doctor` ∈ `installedExtensions[*].name`, (b) current projectRoot ∈ `pomogator-doctor.projectPaths`, (c) settings.local.json hooks.SessionStart содержит команду, ссылающуюся на `.dev-pomogator/tools/pomogator-doctor/doctor-hook.ts`. Missing любого условия → severity=warning, reinstallable=yes, hint=`"proactive broken-install detection disabled — reinstall to enable SessionStart doctor banner"`.

Meta: `reinstallable: yes`.

**Связанные AC:** [AC-29](ACCEPTANCE_CRITERIA.md#ac-29-fr-29)
**Use Case:** [UC-17](USE_CASES.md#uc-17-self-install-detection-feature12)

## FR-30: --all-projects flag @feature8

Doctor SHALL поддерживать CLI flag `--all-projects` который:
1. Читает `config.installedExtensions[*].projectPaths` → deduplicated set (случай когда один projectPath появляется в multiple extensions).
2. Для каждого projectPath запускает full doctor run (включая FR-26/FR-27/FR-28 которые зависят от projectRoot) с изолированным CheckContext.
3. Аггрегирует результаты в single report: per-project section `=== {projectPath} ===` + traffic-light group + summary.
4. Top-level summary: `"Scanned N projects: M fully healthy, K with issues"`.
5. Exit code = worst severity across all projects (2 if any critical, 1 if any warning, 0 else).
6. Ограничение concurrency: max 4 project runs параллельно (NFR-P-3 с `p-limit(4)`).
7. При `--json` output — top-level object `{projects: {<path>: CheckResult[]}}`.
8. При отсутствии projectPaths в config → exit 0 + stderr "no installed projects recorded".

**Связанные AC:** [AC-30](ACCEPTANCE_CRITERIA.md#ac-30-fr-30)
**Use Case:** [UC-16](USE_CASES.md#uc-16-cross-project-scan-feature8)

## FR-31: Hooks registry path correction @feature2

**FIX to FR-4.** Doctor SHALL читать expected hooks по правильному JSON-пути: `config.installedExtensions[*].managed[projectRoot].hooks` (aggregated union across all extensions для current projectRoot), НЕ `config.managed[projectRoot].hooks` (top-level field отсутствует в реальной schema). Aggregation algorithm: для каждого installedExtensions[i], если `managed[projectRoot]?.hooks` существует — union per event; если same command string появляется ≥2 раз в union → severity=warning "duplicate hook registration across extensions: {cmd}". Missing expected event или команд → critical; stale keys (в settings.local.json, не в union) → warning с suggestion "reinstall or manually prune".

Meta: `reinstallable: yes`.

**Связанные AC:** [AC-31](ACCEPTANCE_CRITERIA.md#ac-31-fr-31)

## FR-32: config.json top-level version field @feature2

Installer SHALL writing top-level `version` field в `~/.dev-pomogator/config.json` equal to current `package.json.version` при каждом install/update. Doctor FR-11 (version match) SHALL читать из этого field; missing field → severity=warning, reinstallable=yes, hint=`"config.json lacks top-level version (pre-1.x installer); run reinstall to backfill"`. Migration path: первый install после upgrade автоматически добавляет field (writer-only, no doctor action required).

**Связанные AC:** [AC-32](ACCEPTANCE_CRITERIA.md#ac-32-fr-32)

## FR-33: MCP probe timeout + error categorization @feature4

**ADJUSTMENT to FR-10:**
- Probe timeout SHALL increase from 3s to **10s** per server (`DOCTOR_TIMEOUTS.PROBE_MS = 10_000`) — Windows cold spawn + Python/Node MCP initialize+tools/list handshake typically takes 4–8s.
- `timeout` outcome → severity=**warning** (не critical) — server likely slow but functional; hint=`"probe did not complete in 10s — server may be slow; retry manually or check server logs"`.
- `spawn ENOENT` → severity=critical, reinstallable=no, hint=`"command not found in PATH when doctor spawned child — check .mcp.json uses absolute paths or ensure npx/python3 is on PATH at Claude Code launch"`.
- `spawn EACCES` → severity=critical, hint=`"execute permission denied for MCP binary"`.
- Exit-before-handshake (server started but closed stdin/stdout) → severity=critical с exit code в hint.
- Evidence: real-world `spawn npx ENOENT` случается когда doctor наследует Git Bash / MSYS PATH без npm bin paths — categorized с PATH-specific hint.

**Связанные AC:** [AC-33](ACCEPTANCE_CRITERIA.md#ac-33-fr-33)

## FR-34: Stale managed entries detection @feature12

Doctor SHALL cross-reference `config.installedExtensions[*].name` с distinct tool-directory именами извлечёнными из `installedExtensions[*].managed[projectRoot].tools[].path` (первый сегмент после `.dev-pomogator/tools/`). Валидный набор = union of (a) installed extension names, (b) sub-tool directories declared в `extensions/{ext}/extension.json → tools` (например `specs-workflow.tools.specs-validator`). IF tool-directory name в managed paths но не ∈ валидного набора (extension переименован/удалён но managed records остались) THEN Doctor SHALL пометить как severity=warning, reinstallable=yes, hint=`"managed entries orphaned from removed/renamed extension: {names}; reinstall will prune stale references"`. Known non-orphan case: `specs-validator` — это sub-tool-directory inside `specs-workflow` extension manifest; cross-reference MUST учитывать sub-tools.

Meta: `reinstallable: yes`.

**Связанные AC:** [AC-34](ACCEPTANCE_CRITERIA.md#ac-34-fr-34)
**Use Case:** [UC-18](USE_CASES.md#uc-18-stale-managed-entries-feature12)
