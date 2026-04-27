# Research

## Контекст

Файл `.claude/rules/specs-workflow/specs-management.md` (670 строк / 40.6k chars) загружается как project instruction в КАЖДУЮ Claude Code сессию через механизм auto-loading rules в `.claude/rules/`. Несмотря на то, что в `CLAUDE.md` глоссарии файл помечен как **Triggered**, эта пометка — семантический ярлык, не реальный механизм lazy-load: rule-файлы грузятся всегда, целиком, при инициализации.

Результат: ~10k токенов контекста расходуется в каждой сессии (включая 95% сессий, не связанных со спеками). Claude Code поднимает warning при превышении 40k chars.

Цель рефактора — мигрировать workflow в `create-spec` skill с прогрессивным раскрытием через `references/`, чтобы:
- На startup грузилось только metadata (~250 tokens вместо ~10k)
- При триггере skill — body SKILL.md (~2.5k tokens)
- При работе в конкретной фазе — только её reference (~1.5k tokens)

## Источники

- [Skill authoring best practices — Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — лимит SKILL.md body <500 строк, references one-level deep, description как primary trigger (max 1024 chars)
- [Agent Skills overview — Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — three-level loading: metadata pre-loaded, SKILL.md on trigger, references on read
- [The Complete Guide to Building Skills for Claude — Anthropic Resources (PDF)](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) — pattern "high-level guide with references"
- [Equipping agents for the real world with Agent Skills — Anthropic Engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — "one skill, one job"; mega-skills lose triggering accuracy
- [CLAUDE.md Guide — Braincuber](https://www.braincuber.com/tutorial/writing-best-claude-md-complete-guide) — keep CLAUDE.md <200 lines, push workflows to skills

## Технические находки

### SKILL.md frontmatter constraints

- `name`: max 64 chars, lowercase + hyphens, no reserved words ("anthropic", "claude")
- `description`: max 1024 chars, non-empty, third-person, "pushy" with trigger phrases
- `allowed-tools`: must list ALL tools used in workflow (per `.claude/rules/checklists/skill-allowed-tools-audit.md`)
- Forward-slash paths ONLY (works on Windows + Unix)

### Loading model

1. **Startup**: only `name` + `description` of all skills injected into system prompt (~50-200 tokens per skill)
2. **Trigger match**: SKILL.md body read via filesystem (Read tool)
3. **Reference read**: `references/*.md` read on-demand via filesystem
4. **Scripts**: executed via Bash, no context cost (only stdout consumes tokens)

### Anti-patterns to avoid

- **Nested references** (SKILL.md → ref-A.md → ref-B.md) — Claude does `head -100` previews, misses content. Keep one level deep.
- **Mega-skills** — combining unrelated workflows hurts triggering accuracy. `create-spec` ↔ `research-workflow` should stay separate.
- **Vague description** — "Helps with documents" → poor trigger. Need concrete triggers ("Use when user says 'сделай спеку'").
- **Time-sensitive content** — "as of 2025-08, use v2 API" → goes stale. Use "Current method" / "Old patterns (collapsed)" structure.

### Reference file naming convention (user requirement Q4)

Format: `phaseN[.M]_descriptive-name.md`

Examples:
- `phase1_discovery.md` (not `discovery.md`, not `phase1.md`)
- `phase1.5_project-context.md`
- `phase2_requirements-and-design.md`
- `phase2_bdd-test-infrastructure.md`
- `phase3plus_audit-overview.md`
- `phase3plus_audit-errors.md` (sub-category file at same level)

Non-phase references use kebab-case:
- `feature-creation-rules.md`
- `jira-mode.md`
- `validation-rules.md`

### Migration for shared infrastructure

Per user decision Q2C, ALL `specs-workflow/*.md` rules migrate to `create-spec/references/`:
- `bdd-enforcement.md` → references (no impact, was triggered conceptually)
- `no-mocks-fallbacks.md` → references (no impact)
- `specs-validation.md` → references; **hook reads `.specs/` files directly, not the rule file** (verified via `.claude/rules/specs-workflow/specs-validation.md` lines 49-58 describing hook flow)
- `undefined-behavior-taxonomy.md` (~280 lines) → references; large file with TOC for partial-read safety
- `research-workflow.md` → **EXCEPTION**: stays as separate `research-workflow` skill (own triggers "исследуй/найди/погугли/ресерч" not bound to spec creation)

## Где лежит реализация

- Текущий rule (удаляется): `.claude/rules/specs-workflow/specs-management.md`
- Текущий мини-skill (расширяется): `.claude/skills/create-spec/SKILL.md`
- Новые references: `.claude/skills/create-spec/references/*.md`
- Extension manifest: `extensions/specs-workflow/extension.json` — обновить `ruleFiles.claude` (удалить запись), `skills`/`skillFiles` (расширить)
- Installer: `src/installer/extensions.ts` — `getExtensionRules()` / `getExtensionSkills()` уже резолвят source paths относительно package root (см. `extension-layout.md` rule)
- CLAUDE.md глоссарий: обновить таблицу Rules (удалить specs-management строку), таблицу Triggered

## Выводы

Миграция архитектурно безопасна при соблюдении:
1. **Trigger fidelity** — все trigger phrases из старого "Когда применять" попадают в skill description verbatim
2. **One-level references** — SKILL.md линкует напрямую на `references/*.md`, не глубже
3. **Manifest correctness** — `extension.json` поля `skills` / `skillFiles` / `ruleFiles.claude` обновлены атомарно
4. **CLAUDE.md sync** — таблицы Rules + Triggered обновлены вместе с этой миграцией (требование `claude-md-glossary.md`)
5. **Hook independence** — `specs-validation` hook не зависит от rule-файла (verified)
6. **research-workflow split** — отдельный skill с собственными триггерами

Token impact (estimated):
- Startup без спеки: 10,200 → ~250 tokens (97% reduction)
- Активная Phase 2 работа: 10,200 → ~4,000 tokens (60% reduction)
- Phase 3+ audit: 10,200 → ~5,500 tokens (46% reduction)

## Project Context & Constraints

### Migration scope expansion (Phase 1.5 finding)

Initial Phase 1 assumption was "migrate specs-management.md only". Phase 1.5 scan of `extensions/specs-workflow/extension.json` reveals **broader scope**:

| Rule file | Lines | In manifest? | Migration target |
|-----------|-------|--------------|------------------|
| `specs-management.md` | 669 | ✅ `ruleFiles.claude` | Body → `SKILL.md` (overview) + `references/phaseN_*.md` |
| `no-mocks-fallbacks.md` | 25 | ✅ `ruleFiles.claude` | `references/no-mocks-fallbacks.md` |
| `research-workflow.md` | 157 | ✅ `ruleFiles.claude` | **EXCEPTION** — promote to standalone `research-workflow` skill (own triggers) |
| `specs-validation.md` | 68 | ✅ `ruleFiles.claude` | `references/specs-validation.md` (hook reads `.specs/`, not rule) |
| `bdd-enforcement.md` | 57 | ❌ unmanaged | `references/bdd-enforcement.md` (gain for end users — not currently installed) |
| `undefined-behavior-taxonomy.md` | 170 | ❌ unmanaged | `references/undefined-behavior-taxonomy.md` (gain for end users) |

Total: **6 rule files** (not 1). 4 require hard-cutover via manifest update; 2 are net new for end users.

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = глоссарий; обновлять таблицу при add/remove rules | add/remove rule | FR-CLAUDE-MD-UPDATE |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Manifest = source of truth для updater; перечислять все files/skills/skillFiles | manifest changes | FR-MANIFEST-UPDATE |
| extension-layout | `.claude/rules/extension-layout.md` | Rules в `.claude/rules/EXT/`, skills в `.claude/skills/NAME/` (dev-pomogator root) | skill creation | FR-LAYOUT-COMPLIANCE |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Updater удаляет только managed-файлы; user-моды бэкапятся в `.user-overrides/` | rule removal | FR-USER-MOD-PROTECTION |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Updater синхронизирует ВСЕ artifacts (commands/rules/tools/skills/hooks) | extension update | FR-INSTALLER-CUTOVER |
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | Все tools workflow в frontmatter `allowed-tools` | skill creation | FR-SKILL-FRONTMATTER |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` extension в imports (Node 22.6+ strip-types) | code changes | N/A (no code in this refactor) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| create-spec skill (existing mini) | `.claude/skills/create-spec/SKILL.md` | Scaffold-only skill (66 lines); delegates to specs-management.md | **REFACTOR TARGET** — поглощает workflow целиком |
| discovery-forms skill | `extensions/specs-workflow/.claude/skills/discovery-forms/SKILL.md` | Phase 1 helper; populates v3 USER_STORIES + Risk Assessment | Stays as-is; called from `phase1_discovery.md` reference |
| requirements-chk-matrix skill | `extensions/specs-workflow/.claude/skills/requirements-chk-matrix/SKILL.md` | Phase 2 helper; CHK matrix + Key Decisions | Stays as-is; called from `phase2_requirements-and-design.md` |
| task-board-forms skill | `extensions/specs-workflow/.claude/skills/task-board-forms/SKILL.md` | Phase 3 helper; Done When/Status/Est | Stays as-is; called from `phase3_finalization.md` |
| specs-validator hook | `extensions/specs-workflow/tools/specs-validator/` | UserPromptSubmit hook; validates `.specs/` cross-refs | **Independent of rule file** — reads `.specs/` data directly |
| Anthropic skill-creator skill | `.claude/skills/skill-creator/skill-creator/` | Reference implementation for skill creation | Pattern source for SKILL.md structure |
| 14-skill ecosystem in dev-pomogator | `.claude/skills/*/SKILL.md` (deep-insights, rules-optimizer, debug-screenshot, hyperv-test-runner, run-tests, etc.) | Demonstrates progressive-disclosure pattern already adopted | Architectural validation — not pioneering |
| `tests/e2e/installer-hook-smoke.test.ts` | `tests/e2e/installer-hook-smoke.test.ts` | vitest pattern: `runInstaller()` → dynamic manifest iteration → assert state | Template for hard-cutover integration test (FR-3 verification) |
| Existing `PLUGIN003_specs-workflow.feature` | `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` | Already covers installer scenarios (skill installed, rules installed for Cursor, tools, marketplace) | **EXTEND, do not duplicate** — add hard-cutover scenarios to this file |
| `tests/e2e/helpers.ts` (per `no-test-helper-duplication` rule) | `tests/e2e/helpers.ts` | Shared `runInstaller`, `appPath`, `homePath`, `setupCleanState` helpers | Use for all integration tests; do not redefine locally |

### Architectural Constraints Summary

- **Hard cutover (Q3A):** один релиз — extension.json теряет ruleFiles entry, получает skills entry; installer пересчитывает managed files и удаляет старый rule + добавляет новый skill в одной транзакции через `updater-managed-cleanup` + `updater-sync-tools-hooks` → требует **`extension-manifest-integrity` compliance**
- **One-level references:** SKILL.md линкует только напрямую на `references/*.md`, references не линкуют друг на друга → проверяется в Phase 3+ Audit "Inconsistency" категории
- **Trigger fidelity:** description ОБЯЗАН содержать все ~30 trigger phrases из старого rule "Когда применять" verbatim → 1024 char лимит description достаточен (~150 chars per phrase × 30 = 4500 — НЕ помещается; нужно сжать или сгруппировать категориями)
- **No new tools:** рефактор — чистая миграция документа в skill structure; никакой новой бизнес-логики, скриптов, hooks
- **Hook independence:** specs-validator hook читает `.specs/` файлы (FR.md, AC.md, .feature) — не rule-файл; миграция rule НЕ затрагивает hook поведение
- **Phase 3+ Audit categories разбиваются на per-category files (Q4C):** 6+ файлов в `references/` со всеми категориями (Errors / Logic Gaps / Inconsistency / Rudiments / Fantasies / Undefined Behavior / Jira Drift) → требует overview-файла как entry point
- **Test framework:** vitest + Gherkin `.feature` файлы (BDD-style); `bdd-framework-detector` для dev-pomogator самого определяет TypeScript + custom .feature parsing (не Cucumber.js per se). Integration тесты через `runInstaller()` helper из `tests/e2e/helpers.ts`. `.feature` сценарии живут в `tests/features/{plugin-or-core}/{CODE}_{name}.feature` с naming `PLUGIN003_specs-workflow` или `CORE020_*`
- **Cursor rules note:** `extension.json.ruleFiles.claude` — единственная секция в манифесте; `.cursor/rules/*.mdc` упомянуты в `PLUGIN003_specs-workflow.feature:22-25` но не в манифесте → installer auto-converts `.md` → `.mdc` либо тест stale. Рефактор затрагивает только Claude side; Cursor side либо out-of-scope, либо требует параллельной миграции (см. Open Questions)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Skill description слишком короткое (1024 char limit) — не все trigger phrases помещаются → workflow не активируется на терсный русский запрос | High | High | Group phrases by intent (create / update / view); use canonical English form + "Russian variants: X, Y, Z" suffix; QA test 10 representative prompts in RU+EN |
| Hook `specs-validation` ломается из-за зависимости от rule-файла, не задокументированной | Low | High | Pre-migration code audit of `extensions/specs-workflow/tools/specs-validator/` source; assert no `readFile('.claude/rules/specs-workflow/specs-validation.md')` calls; integration test runs hook on existing spec before/after migration |
| User has user-modified `specs-management.md` (per `updater-managed-cleanup`) — на upgrade content потерян | Medium | Medium | Updater автоматически бэкапит в `.dev-pomogator/.user-overrides/` (existing behavior). Document in CHANGELOG: user mods preserved at expected backup path |
| References получаются 2+ levels deep (Claude делает partial reads, миссит контент) | Low | High | Lint script проверяет что только SKILL.md содержит `references/` links; PR review checklist; spec validation rule update |
| CLAUDE.md глоссарий не обновлён вместе с миграцией → таблица Rules показывает specs-management который больше не существует | High | Medium | Phase 0 task в TASKS.md явно включает CLAUDE.md update; pre-commit hook (existing) валидирует claude-md-glossary compliance |
| `phaseN_descriptive` naming не enforce-ится — будущие contributor-ы добавят файлы с inconsistent names | Medium | Low | Document convention в SKILL.md; lint rule в Phase 3 audit category "Inconsistency" |
| Cursor rules drift — installer auto-converts `.md` → `.mdc` для Cursor, но миграция rule→skill ломает Cursor branch (skills не работают в Cursor) | Medium | Medium | Phase 2 Open Question: либо out-of-scope с явным `[WAIVED: Cursor support]`, либо параллельный fallback — оставить minimal `.cursor/rules/specs-management.mdc` stub с redirect-комментарием |
| Manifest rule-cleanup vs 2 unmanaged files: `bdd-enforcement.md` + `undefined-behavior-taxonomy.md` физически существуют в `.claude/rules/specs-workflow/` но не в манифесте → installer-managed-cleanup их не удалит | Low | Low | Hard-delete этих 2 файлов в коммите рефактора (часть rebase, не installer); скопировать в `references/` до удаления |
| extension.json меняет `ruleFiles.claude` (4 → 1) и `skills.create-spec` (расширяется skillFiles list) одновременно — `extension-json-meta-guard` hook может заблокировать Edit | Medium | Medium | Pre-edit: прочитать `extension-json-meta-guard.ts`, понять формат проверки; possible один атомарный Write вместо нескольких Edit; runtime test что hook PASS-ит после edits |
