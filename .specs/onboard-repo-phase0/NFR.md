# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1: Phase 0 wall-clock budget.** На среднем репо (~1000 файлов, типичный nodejs-backend или python-api) полный Phase 0 (Steps 1-7) ДОЛЖЕН укладываться в **≤ 15 минут wall-clock time**. На крупном репо (5k-10k файлов) — ≤ 25 минут. Метрика пишется в `onboarding.json.phase0_duration_ms` для retrospective.
- **NFR-P2: Archetype triage ≤ 2 минуты.** Step 1 (archetype detection) ДОЛЖЕН завершаться ≤ 120 seconds. Читает только root + top-level директории, НЕ бизнес-логику.
- **NFR-P3: Parallel subagents reduce time by ≥ 50%.** Step 2 через 3 параллельных Explore subagents ДОЛЖЕН завершаться минимум в 2× быстрее эквивалентного sequential scan. Метрика: `step2_parallel_duration_ms` vs expected sequential baseline (3 × avg single-subagent time).
- **NFR-P4: Cache hit ≤ 3 секунды.** При valid cache (UC-2) Phase 0 skip ДОЛЖЕН завершаться ≤ 3 seconds от `/create-spec` start. Включает: read `.onboarding.json`, verify SHA, print summary.
- **NFR-P5: Token budget для ingestion.** Step 3 ДОЛЖЕН использовать `repomix --compress` (~70% token reduction) если CLI доступен. Fallback top-N: limit ≤ 30k tokens output. Total Phase 0 token consumption ≤ 100k tokens (main context).
- **NFR-P6: Hook compile ≤ 500ms.** Step 7 `compile-hook.ts` от чтения `.onboarding.json` до записи `.claude/settings.local.json` ≤ 500 milliseconds.

## Security

- **NFR-S1: Secrets never in artifacts.** `.onboarding.json` и `.onboarding.md` НИКОГДА не содержат env var values — только имена (`AUTO_COMMIT_API_KEY`, а не её значение). Redaction validator в `onboard-repo-core.ts` сканирует generated content на паттерны `sk-*`, `ghp_*`, `xoxb-*`, Base64 blobs > 40 chars перед write.
- **NFR-S2: Path traversal protection.** Все пути из subagent output валидируются через `path.resolve` + `startsWith(projectPath)` по правилу `no-unvalidated-manifest-paths`. Запись вне target repo блокируется.
- **NFR-S3: Respect existing ignore files.** `.gitignore`/`.cursorignore`/`.aiderignore` — HONORED. Файлы из этих списков НЕ читаются Phase 0 subagents (prevents secret leakage через `.env`/`credentials.json`).
- **NFR-S4: Hook injection isolation.** Generated PreToolUse hook пишется только в `.claude/settings.local.json` (personal, gitignored). НЕ трогает `.claude/settings.json` (team-shared). Self-guard: dev-pomogator source repo check — refuses injection в свой собственный settings.local.json (dogfooding prevent).
- **NFR-S5: No arbitrary code execution from onboarding.json.** `.onboarding.json` — data, не code. `render-rule.ts` / `compile-hook.ts` читают JSON через `JSON.parse` + schema validation; не eval-ят ничего. `commands.*.raw_pattern_to_block` treated as regex string, validated as safe regex (no ReDoS patterns).

## Reliability

- **NFR-R1: Atomic writes для всех artifacts.** `.onboarding.json`, `.onboarding.md`, `.claude/settings.local.json` записываются через temp file + `fs.move` (по правилу `atomic-config-save`). Краш агента посреди write не оставляет corrupted state.
- **NFR-R2: Idempotent Phase 0 re-run.** Запуск Phase 0 дважды в одном репо (без `--refresh-onboarding`, valid cache) → no-op (second run — cache hit). Запуск с `--refresh-onboarding` после завершённого Phase 0 → artifact'ы перегенерированы БЕЗ накопления мусора (old artifacts → history archive, не duplicated).
- **NFR-R3: Baseline test failures НЕ abort Phase 0.** Step 4 `/run-tests` failure — записывается в `onboarding.json.baseline_tests.failed_tests[]` + `risks[]`, но Phase 0 **продолжается**. Только "command not found" / "missing deps" (exit 127) → prompt user "fix env first".
- **NFR-R4: Partial subagent failure recovery.** Если один из 3 параллельных subagents (Step 2) упал → Phase 0 продолжается с частичными данными, в `onboarding.json.warnings[]` записывается `{step: "recon", subagent: "B", error: "<msg>"}`. Text gate explicitly упоминает неполноту.
- **NFR-R5: Schema validation gates writes.** `.onboarding.json` проходит JSON Schema validation **до** записи на диск. Schema violation → Phase 0 abort с actionable hint (не записывает corrupted JSON).
- **NFR-R6: Integration tests обязательны.** Все FR покрываются **integration tests** через spawnSync реальных scripts + реальные test fixture repos (fake-python-api, fake-nextjs-frontend, etc.). Unit тесты — допустимый дополнение, НЕ замена (по правилу `integration-tests-first`).
- **NFR-R7: Git SHA cache correctness.** `last_indexed_sha` всегда отражает actual git HEAD at moment of Phase 0 finalization. Race condition: если user делает commit между Step 1 и Step 7 — SHA captured at Step 7 (финальный moment). Commits after Step 7 → legit drift, обнаружится в UC-3.

## Usability

- **NFR-U1: Progress visibility.** Во время Phase 0 агент ДОЛЖЕН показывать progress messages (Step 1/7 started, Step 2/7 subagents launched, etc.) — каждый шаг в ≤ 1 строке. НЕ silent execution.
- **NFR-U2: Text gate как natural conversation.** Step 6 prompt формулируется **живым языком** (не техническим жаргоном). Пользователь отвечает в свободной форме, не через AskUserQuestion structured UI. Итеративный dialog (3-5 обменов max).
- **NFR-U3: Actionable error messages.** Все error paths (UC-5 no dev-pomogator, Step 4 command not found, Step 1 archetype undetermined) ДОЛЖНЫ включать actionable hint (команда для fix, ссылка на docs, explicit next step). НЕ сырые stack traces.
- **NFR-U4: Summary cache hit информативен.** UC-2 (cache hit) 3-строчный summary ДОЛЖЕН включать: (a) дата last onboarding, (b) archetype, (c) baseline test count. Developer видит что контекст актуален без открытия файла.
- **NFR-U5: Executive Summary на Phase 0 STOP.** По правилу `specs-management.md`, Phase 0 завершение — Executive Summary ≤ 5 bullets с ссылками на файлы. Не длинная портянка.

## Maintainability

- **NFR-M1: JSON Schema как contract.** `onboarding.schema.json` — единственный контракт между producer (Phase 0 core) и consumers (render-rule, compile-hook, future spec phases, external AI tools). Изменения schema требуют version bump (`$schema.version`). Backwards compat: consumers читают ≤ своей targeted version.
- **NFR-M2: Decomposed modules.** Phase 0 core реализуется как **композиция 7 отдельных TS modules** (по шагам Step 1..7) + 2 render scripts. Main orchestrator `phase0.ts` ≤ 200 lines, каждый step-module ≤ 300 lines. По правилу `simplify-extended`: избегать god-class.
- **NFR-M3: Templates externalized.** 6-секционный report, JSON Schema, managed rule content, hook block — все как **external templates** в `extensions/onboard-repo/tools/onboard-repo/templates/`, не hardcoded strings в TS.
- **NFR-M4: Exhaustive error taxonomy.** Phase 0 error paths классифицированы: `UserRemediable` (fix env) / `RepoIssue` (not a git repo) / `InfraIssue` (subagent crash) / `SchemaViolation` (internal bug). Classification влияет на exit code + hint message.

## Observability

- **NFR-O1: Phase 0 trajectory log.** Каждый Phase 0 run appends в `.dev-pomogator/logs/phase0-{ISO-date}.log`: step name, start, duration, exit status, key outputs (по паттерну SWE-agent trajectory). При debugging crash — reproducible sequence.
- **NFR-O2: Metrics в onboarding.json.** `.onboarding.json.metrics` ДОЛЖНО содержать: `total_duration_ms`, `per_step_duration_ms{}`, `tokens_consumed` (если известно), `files_scanned`, `subagent_retries`. Основа для continuous optimization.
- **NFR-O3: No PII в logs.** По пересечению с NFR-S1: log-файлы НЕ содержат env values / secrets / user-specific paths (только repo-relative).

## Compatibility

- **NFR-C1: Node.js 18+ (matches dev-pomogator `engines.node`).** Phase 0 TypeScript modules compile/run на Node 18+ (использует ESM, `fs-extra`, `glob`, `cross-spawn` из существующих dependencies dev-pomogator).
- **NFR-C2: Works без repomix.** Если `repomix` CLI отсутствует в PATH — используется shell-based fallback ingestion (top-N по size+recency). Phase 0 НЕ имеет hard dependency на repomix.
- **NFR-C3: Works без git.** Edge case EC-1: repo не git-tracked. Fallback cache invalidation — по mtime манифестов вместо SHA. Warning записывается.
- **NFR-C4: Cross-platform (Windows + Linux + macOS).** Все path ops через `path.join`, `path.resolve`. spawn-ы через `cross-spawn` (не raw `child_process.spawn` — Windows-совместимость).

## Assumptions

- **A-1:** Target repo имеет хотя бы `README.md` ИЛИ один package manifest. Пустой репо — EC-4 (короткий отчёт). Полностью пустой repo — Phase 0 не запускается, error "nothing to onboard".
- **A-2:** `/create-spec` workflow (`specs-management.md`) — stable primary entry point. Альтернативный `/onboard-repo` standalone skill — out of scope v1 (можно добавить в v2 без breaking changes к Phase 0 core).
- **A-3:** Users запускают `/create-spec` с ожиданием что первый в репо может занять ~15 минут на Phase 0. UC-5 error хорошо visible если Phase 0 не стартует.
- **A-4:** Claude Code Explore subagent tool (`Agent subagent_type=Explore`) остаётся доступным в Phase 0 scope. Если subagent API сломается — Phase 0 Step 2 падает → NFR-R4 fallback на sequential scan с warning.
- **A-5:** Dev-pomogator extension marketplace поддерживает installation нового extension `onboard-repo` без breaking изменений в installer core (`src/installer/`).

## Risks

- **Risk-1 (Technical):** `repomix --compress` output format меняется между версиями → breaking Step 3 ingestion. Mitigation: pin repomix version через `packageManager` field в target repos + version check при Step 3 start.
- **Risk-2 (UX):** Developers возмущаются 15-минутным blocker на первом `/create-spec`. Mitigation: explicit progress + `--skip-onboarding` emergency escape hatch (artifact flag `skipped_by_user: true`, follow-up reminders).
- **Risk-3 (Correctness):** Archetype detection ошибается → последующие шаги собирают irrelevant данные. Mitigation: archetype confidence level + text gate catches errors before Phase 1.
- **Risk-4 (Maintenance):** Schema v1 → v2 migration рвёт existing cached `.onboarding.json` файлы в target repos. Mitigation: auto-migration скрипт + graceful fallback "schema outdated, please --refresh-onboarding".
- **Risk-5 (Scope creep):** "Ещё добавим repomap.tree-sitter / ещё добавим Memory Bank sync / ещё добавим ML detection" — feature creep. Mitigation: strict OUT OF SCOPE block в FR.md. v1 = Steps 1-7, не больше.

## Out of Scope

- **OoS-1:** Aider-style tree-sitter PageRank repomap (FR-N OUT OF SCOPE).
- **OoS-2:** Automatic CLAUDE.md generation или update (coexistence only, не replacement).
- **OoS-3:** Cross-repo onboarding (Phase 0 работает per-target-repo, не для monorepo с sub-repos как separate onboarding entities; monorepo = single `.onboarding.json` с `sub_archetypes[]`).
- **OoS-4:** AI agent "ответы на вопросы" на основе `.onboarding.json` (MCP server или аналог) — отдельная будущая спека.
- **OoS-5:** Multi-language parallel onboarding для monorepo (Phase 0 v1 — single pass, archetype `monorepo` с базовой sub-archetype detection).
- **OoS-6:** Continuous onboarding update (auto-refresh по post-commit hook) — manual refresh только в v1.
