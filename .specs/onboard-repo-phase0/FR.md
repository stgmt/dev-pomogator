# Functional Requirements (FR)

## FR-1: Auto-trigger Phase 0 при первом /create-spec в репо @feature1

Система ДОЛЖНА автоматически инициировать Phase 0 Repo Onboarding при вызове `/create-spec`, если `.specs/.onboarding.json` отсутствует в target репо. Phase 0 становится обязательным префиксом существующих Phase 1-3 workflow. После завершения Phase 0 workflow продолжается Phase 1 Discovery.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) · **Use Case:** [UC-1](USE_CASES.md#uc-1-первый-create-spec-в-новом-репо--auto-trigger-phase-0-feature1)

## FR-2: Typed artifact .specs/.onboarding.json (AI-first schema) @feature2 @feature10

Система ДОЛЖНА создавать `.specs/.onboarding.json` со строгой JSON Schema v1.0 содержащей **17 блоков** (project, tech_context, commands, system_patterns, repo_map, rules_index, skills_registry, hooks_registry, mcp_servers, boundaries, gotchas, env_requirements, verification, code_style, workflow, imports, ignore, glossary, active_context, progress). Schema валидируется `npx ajv-cli` при записи. Файл — source of truth для дальнейшего рендеринга prose + hook.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) · **Use Case:** [UC-1](USE_CASES.md#uc-1-первый-create-spec-в-новом-репо--auto-trigger-phase-0-feature1), [UC-2](USE_CASES.md#uc-2-последующий-create-spec-с-валидным-cache-feature4)

## FR-3: PreToolUse hook compiled из commands блока @feature3

Система ДОЛЖНА компилировать PreToolUse hook в `.claude/settings.local.json` из поля `onboarding.commands.<name>.raw_pattern_to_block`. Для каждой команды с `forbidden_if_skill_present == true` генерируется entry `{matcher: "Bash", regex: "<pattern>", decision: "deny", reason: "<skill-name> skill wraps this; use /<skill>"}`. Hook блокирует raw-команды (например `npm test`, `pytest`) механически — декларативного prose в правиле недостаточно.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) · **Use Case:** [UC-9](USE_CASES.md#uc-9-рендеринг-в-dual-artifact-после-text-gate-feature15)

## FR-4: Git-SHA cache invalidation @feature4

Система ДОЛЖНА инвалидировать onboarding cache по **git SHA сравнению**. При `/create-spec`:
- Если `onboarding.last_indexed_sha == git rev-parse HEAD` — Phase 0 пропускается (3-строчное summary из cache).
- Если drift ≥ 5 коммитов — prompt пользователю (Refresh / Continue with cache).
- Если drift < 5 коммитов — silent reuse, warning в `progress.json.warnings`.

Manual override: `/create-spec <slug> --refresh-onboarding` форсирует полный re-run независимо от cache.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) · **Use Case:** [UC-2](USE_CASES.md#uc-2-последующий-create-spec-с-валидным-cache-feature4), [UC-3](USE_CASES.md#uc-3-git-sha-изменился--prompt-refresh-feature4), [UC-4](USE_CASES.md#uc-4-manual-refresh-через---refresh-onboarding-feature4)

## FR-5: Baseline test run через /run-tests @feature5

Phase 0 ДОЛЖНО запускать baseline прогон тестов через существующий skill `/run-tests` (НЕ spawn raw `pytest`/`npm test` — это нарушение правила `centralized-test-runner`). Результат: `onboarding.baseline_tests = {framework, command, passed, failed, skipped, duration_s, failed_test_ids[]}`. Если test framework не детектится в Phase 0 Step 2 — Step 4 skip-ится, записывается `{framework: null, reason: "no test framework detected"}`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) · **Use Case:** [UC-7](USE_CASES.md#uc-7-repo-без-тестов-feature5), [UC-13](USE_CASES.md#uc-13-partial-onboarding-skip-baseline-tests-feature5)

## FR-6: Text gate перед Phase 1 Discovery @feature6

Phase 0 ДОЛЖНО завершаться text gate — AI agent пишет в чат 1-абзац резюме архитектуры репо (4-6 предложений живым языком без технического жаргона) + задаёт вопрос "Правильно я понял?". Developer обязан ответить "да/верно" ИЛИ правку. Только после утвердительного ответа — `spec-status.ts -ConfirmStop Onboarding`. Без явного подтверждения Phase 1 Discovery заблокирован.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) · **Use Case:** [UC-8](USE_CASES.md#uc-8-text-gate-не-пройден--итеративное-уточнение-feature6)

## FR-7: Parallel Explore subagents для recon @feature7

Phase 0 Step 2 (manifest + tests + entry points scan) ДОЛЖНО выполняться через **3 параллельных Claude Code Explore subagents** в одном tool call. Каждый subagent — изолированный контекст, не засоряет main-контекст агента. Subagent A: manifests + env + CI. Subagent B: test frameworks + existing AI configs (CLAUDE.md, .cursor/rules/, AGENTS.md). Subagent C: entry points + architecture hints. Merge strategy: приоритеты A > B > C при конфликтах per-field (см. RESEARCH.md EC-6).

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) · **Use Case:** [UC-11](USE_CASES.md#uc-11-scratch-file-при-крупном-repo-feature14)

## FR-8: Archetype triage (2-min) перед deep scan @feature8

Phase 0 Step 1 ДОЛЖНО выполнять archetype triage **ДО** parallel recon. Классифицирует репо в один из **8 архетипов**: `python-api`, `nodejs-backend`, `nodejs-frontend`, `fullstack-monorepo`, `dotnet-service`, `cli-tool`, `library`, `infra`, `ml-research`. Решение основано ТОЛЬКО на root + top-level файлах (не бизнес-логике). Выход: `{archetype, confidence: "high"|"medium"|"low", evidence: "<manifest+path hints>"}`. Archetype определяет routing последующих шагов (какие секции в report, какие вопросы в subagents).

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) · **Use Case:** [UC-12](USE_CASES.md#uc-12-archetype-routing--frontend-spa-feature8)

## FR-9: Prose artifact .specs/.onboarding.md (6-секционный отчёт) @feature9

Система ДОЛЖНА генерировать `.specs/.onboarding.md` из `.onboarding.json` по **фиксированному 6-секционному шаблону** (порт из rpa-init/SKILL.md:30-52 дословно):

1. **Project snapshot** (purpose + main packages, 1 абзац)
2. **Dev environment** (package managers, runtime versions, env vars)
3. **How to run tests** (команды дословно + framework)
4. **Behavior from tests** (scenarios covered + gaps)
5. **Risks and notes** (flaky tests, secrets, external services)
6. **Suggested next steps** (1-3 actionable hints)

Файл для людей — team lead / new developer читает для быстрого context onboarding.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) · **Use Case:** Поддерживает US-11 (new team member)

## FR-10: AI-specific секции обязательны (не только generic metadata) @feature10

Schema `.onboarding.json` ОБЯЗАНА содержать AI-specific секции поверх generic project metadata. Минимальные обязательные AI-секции:
- `rules_index[]` — `{name, trigger, enforces, path}` для каждого `.claude/rules/*.md` в target репо
- `skills_registry[]` — `{name, trigger, description}` для каждого installed skill
- `hooks_registry[]` — `{event, matcher, action, path}` для каждого installed hook
- `mcp_servers[]` — `{name, capabilities, auth_required}` для каждого MCP
- `boundaries` — 3-tier `{always[], ask_first[], never[]}` (AGENTS.md паттерн)
- `gotchas[]` — `{symptom, cause, fix}` для repo-specific issues
- `glossary[]` — `{term, definition, example}` для domain терминов

**Без этих секций JSON schema не валиден.** AI engineer feedback: *"generic project metadata — это для CI-system, не для AI file"*.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) · **Memory trigger:** [Onboarding artifact AI-centric](../../../memory/feedback_onboarding-artifact-must-be-ai-centric.md)

## FR-11: Developer onboarding checklist из .onboarding.md @feature11

`.specs/.onboarding.md` ДОЛЖЕН включать Section 6 "Suggested next steps" с 1-3 actionable hint'ами (например: "Prerequisites: установи AUTO_COMMIT_API_KEY из 1Password", "First task: запусти /pomogator-doctor чтобы проверить окружение"). Эти hint-ы — produced из `gotchas[]` + `env_requirements.required[]` данных. New team member читает `.onboarding.md` → следует hints → продуктивен за 30 минут вместо 2 дней.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) · **Use Case:** Поддерживает US-11

## FR-12: Coexistence с Anthropic /init без конфликта @feature12

Phase 0 Onboarding НЕ ДОЛЖЕН читать или писать `CLAUDE.md`. Если `CLAUDE.md` существует в target репо — он записывается в `onboarding.existing_ai_configs[]` как факт существования, но **не парсится и не модифицируется**. Два AI context источника (CLAUDE.md от /init + .onboarding.json от Phase 0) живут параллельно. Null-pointer protection: `CLAUDE.md` отсутствует — Phase 0 работает нормально, `existing_ai_configs` пустой.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) · **Use Case:** [UC-10](USE_CASES.md#uc-10-coexistence-с-anthropic-init-feature12)

## FR-13: Delivered as dev-pomogator extension @feature13

Фича ДОЛЖНА быть реализована как **новый extension** `extensions/onboard-repo/` с полным manifest (`extension.json`) содержащим `files`, `tools`, `toolFiles`, `rules`, `skillFiles`, `hooks` — по правилу `extension-manifest-integrity`. Extension устанавливается через стандартный installer dev-pomogator, трекается в `~/.dev-pomogator/config.json` как installed. При uninstall — managed файлы удаляются через standard cleanup.

Интеграция с `specs-workflow`: модификация `.claude/rules/specs-workflow/specs-management.md` (добавление Phase 0 перед Phase 1) — это cross-extension coordination, описано в `extension.json` → `crossExtensionModifies`.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13) · **Use Case:** [UC-5](USE_CASES.md#uc-5-target-repo-не-имеет-установленного-dev-pomogator-feature13)

## FR-14: Scratch file для крупных репо @feature14

Для репо с >500 файлов Phase 0 ДОЛЖНО использовать `.specs/.onboarding-scratch.md` как external memory. Каждые 2-3 прочитанных файла Subagent appends короткую note с timestamp + source + findings. После Step 7 (финальные artifacts) scratch archive-ится в `.specs/.onboarding-history/scratch-{timestamp}.md` и удаляется из рабочей директории. Retention: 5 последних scratch-файлов.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14) · **Use Case:** [UC-11](USE_CASES.md#uc-11-scratch-file-при-крупном-repo-feature14)

## FR-15: Dual-render из single source of truth @feature15

Система ДОЛЖНА рендерить артефакты в **2 направления из одного `.onboarding.json`**:

- **Декларативное (слой 1):** prose в `.claude/rules/onboarding-context.md` с managed marker `<!-- managed by dev-pomogator onboarding v1, do not edit -->`. Формат — markdown, разделы соответствуют блокам JSON schema. Агент читает при каждой сессии (no `paths:` frontmatter = always-loaded).

- **Механическое (слой 2):** PreToolUse hook в `.claude/settings.local.json` через smart-merge (preserve user hooks). Hook блокирует raw команды regex'ами из `commands.*.raw_pattern_to_block`.

Источник — один JSON. Два renderer скрипта: `render-rule.ts` + `compile-hook.ts`. При каждом `onboarding.json` update — оба скрипта запускаются. Consistency guaranteed SHA-256 хеш валидацией artifacts.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15) · **Use Case:** [UC-9](USE_CASES.md#uc-9-рендеринг-в-dual-artifact-после-text-gate-feature15)

## FR-16: Manual refresh через `--refresh-onboarding` @feature4

Команда `/create-spec <slug> --refresh-onboarding` ДОЛЖНА принудительно re-run Phase 0 независимо от cache-state. Pre-existing artifacts (`.onboarding.json`, `.onboarding.md`, `.onboarding-scratch.md`, `.claude/rules/onboarding-context.md` managed block) archive-ятся в `.specs/.onboarding-history/{ISO-timestamp}/`. Retention: 5 последних snapshots (старые удаляются). После refresh — все rendered artifacts пересобраны с нуля, hook recompiled.

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16) · **Use Case:** [UC-4](USE_CASES.md#uc-4-manual-refresh-через---refresh-onboarding-feature4)

## FR-17: Respect `.cursorignore` / `.aiderignore` / `.gitignore` @feature2

Phase 0 scan ДОЛЖЕН respect-ить следующие ignore файлы (в порядке приоритета):
1. `.gitignore` (всегда skip)
2. `.cursorignore` (если есть — skip как AI-excluded)
3. `.aiderignore` (если есть — skip как AI-excluded)

Факт наличия этих файлов записывается в `onboarding.ignore.external_configs_found[]`. Пользовательские пути из `.cursorignore` переносятся в `onboarding.ignore.ai_excluded_paths[]` с source: ".cursorignore".

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17) · **Use Case:** [EC-3](USE_CASES.md#ec-3-cursorignore--aiderignore-в-репо)

## FR-18: Commands via skill-reference, не hardcode @feature3 @feature15

Для каждой команды в `onboarding.commands` где в target репо существует skill-обёртка (детект: `.claude/skills/<name>/SKILL.md` существует + skill описывает wrapping конкретной команды в metadata) — `via_skill` ОБЯЗАТЕЛЬНО ссылается на skill name, `preferred_invocation` показывает skill-based invocation, `fallback_cmd` содержит raw команду для degraded mode. Hardcoded raw command без skill-reference (когда skill существует) — FR violation, блокируется валидатором схемы.

Пример для dev-pomogator:
```jsonc
"test": {
  "via_skill": "run-tests",                    // REQUIRED (skill exists)
  "preferred_invocation": "/run-tests",
  "fallback_cmd": "npm test",                  // degraded mode only
  "raw_pattern_to_block": "^(npm|npx)\\s+(run\\s+)?test|^pytest",
  "forbidden_if_skill_present": true,
  "reason": "/run-tests wraps test runners с TUI + YAML status. Bypass ломает statusline."
}
```

**Связанные AC:** [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18) · **Memory trigger:** [Onboarding artifact AI-centric](../../../memory/feedback_onboarding-artifact-must-be-ai-centric.md)

## FR-19: Managed files tracking через SHA-256

Все Phase 0 artifacts (.specs/.onboarding.json, .specs/.onboarding.md, .specs/.onboarding-history/**, .claude/rules/onboarding-context.md, hook-block в .claude/settings.local.json) ДОЛЖНЫ регистрироваться в `~/.dev-pomogator/config.json → managedFiles[]` с SHA-256 хешами для auto-update сохранения user-overrides. При `dev-pomogator --update` — user-modifications этих файлов backup-ятся в `.dev-pomogator/.user-overrides/` перед перезаписью (по существующему паттерну).

**Связанные AC:** [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19)

## FR-20: JSON Schema validation .onboarding.json

Extension ДОЛЖЕН поставлять `onboarding.schema.json` (Draft 2020-12 JSON Schema) в `extensions/onboard-repo/tools/onboard-repo/schemas/`. При каждом write `.onboarding.json` — validation через `ajv` (или эквивалент). Schema violations — fatal error, Phase 0 abort-ится с actionable hint. Schema включает: `required` поля, `type` constraints, `enum` для archetype, regex patterns для semver/SHA, nested schemas для registries.

**Связанные AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20)

## FR-N: Full tree-sitter PageRank repomap (Aider-style) — OUT OF SCOPE

> OUT OF SCOPE — Aider-style deterministic repomap с tree-sitter для 47 языков требует bundling tree-sitter WASM binaries + implementing PageRank graph algorithm. Это полноценный отдельный tool уровня Aider. В первой версии Phase 0 мы используем:
> - `repomix --compress` если CLI доступен (external dependency)
> - Shell-based fallback: top-N файлов по (size + git recency + grep-based import count)
>
> Tree-sitter PageRank — кандидат на отдельную спеку в будущем.
>
> Связанные UC, AC и User Stories соответственно помечены.
