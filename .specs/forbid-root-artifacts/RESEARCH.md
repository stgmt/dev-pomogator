# Research

## Контекст

Bug surfaced на MR-5993 (cleverence ms-smarts, MS-18576 task). Внешний reviewer Лазарев увидел в `.root-artifacts.yaml` записи `Local.testsettings`, `MobileSmarts.Common.vssscc`, `UpgradeLog.htm` и квалифицировал как «у нас нет таких файлов / шум, не должно быть в fix-MR». Это classic Visual Studio legacy artifacts, попавшие в whitelist через `configure.py --non-interactive` / "all" shortcut на legacy репозитории. Спека требует расширить `TRASH_PATTERNS` в `check.py` для VS legacy patterns + добавить auto-prune (in pre-commit `check.py`) + Trash-aware configure + shared classifier module.

## Источники

- [GitHub gitignore canonical VisualStudio.gitignore](https://github.com/github/gitignore/blob/main/VisualStudio.gitignore) — Microsoft-curated industry-standard set ignored patterns для VS репозиториев (раздел «User-specific files»: `*.suo`, `*.user`; legacy SCC: `*.vssscc`, `*.vspscc`; upgrade reports: `UpgradeLog*.htm`, `UpgradeLog*.XML`). Fetched main branch.
- [Microsoft Learn — Migrate testsettings to runsettings](https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings?view=visualstudio) — official deprecation: «Providing a .testsettings file to the run triggers an error in VSTest 18.0+».
- [Microsoft Learn — Configure unit tests with .runsettings](https://learn.microsoft.com/en-us/visualstudio/test/configure-unit-tests-by-using-a-dot-runsettings-file) — recommended replacement format.
- [Microsoft Learn — Code Coverage configuration using Test Settings is deprecated](https://learn.microsoft.com/en-us/previous-versions/dd504821(v=vs.140)) — explicit deprecation marker для `.testsettings` code coverage.
- [SourceGear Support — Visual Studio .sln/.vcproj/.vspscc/.vssscc files](https://support.sourcegear.com/viewtopic.php?t=7115) — community confirmation legacy SCC bindings.
- [Visual Studio Developer Community — .vspscc & .vssscc files (issue 133069)](https://developercommunity.visualstudio.com/content/problem/133069/vspscc-vssscc-files.html) — Microsoft developer community thread по cleanup.
- [GitHub Issue PowerPointLabs/PowerPointLabs#1859 — Unnecessary file in project: UpgradeLog.htm](https://github.com/PowerPointLabs/PowerPointLabs/issues/1859) — community example удаления UpgradeLog.htm как temporary artifact.
- [Quickly remove all source control bindings — gyorgybalassy.wordpress.com](https://gyorgybalassy.wordpress.com/2013/03/31/quickly-remove-all-source-control-bindings/) — community guide про vssscc/vspscc как vestigial.

## Hypotheses (formulated before research)

| H# | Statement | Expected Proof Type | Fallback |
|----|-----------|---------------------|----------|
| H1 | `*.vssscc` + `*.vspscc` — VS source-control bindings legacy формат, не нужный в современных репо | Presence в GitHub VisualStudio.gitignore + Microsoft community refs | `[UNVERIFIED]` если только community refs |
| H2 | `*.testsettings` — deprecated в VS2012+, заменён на `*.runsettings`; не должен быть в repo root | Microsoft Learn deprecation page + migration tool docs | `[NEEDS_CONFIRMATION]` если только один MS source |
| H3 | `UpgradeLog*.htm` + `UpgradeLog*.XML` — temporary VS Project Upgrade Wizard reports | Presence в gitignore + MS docs/community refs | `[UNVERIFIED]` если не в gitignore |
| H4 | `*.suo`, `*.user` — per-user VS state, никогда не нужны в repo | Presence в gitignore — этот pattern universally known | Достаточно одного official source |

## Verification table (3-angle triangulation)

| H# | Hypothesis | Status | Angle 1 (Official docs / Microsoft) | Angle 2 (Canonical gitignore) | Angle 3 (Community) |
|----|-----------|--------|-------------------------------------|-------------------------------|---------------------|
| H1 | `*.vssscc` / `*.vspscc` legacy SCC bindings | [VERIFIED] | Microsoft Developer Community issue 133069 | ✅ Both `*.vspscc` + `*.vssscc` присутствуют в `github.com/github/gitignore/VisualStudio.gitignore` main branch | SourceGear KB + gyorgybalassy blog: «vestigial files from Visual SourceSafe era» |
| H2 | `*.testsettings` deprecated, replaced by `*.runsettings` | [VERIFIED] | learn.microsoft.com `migrate-testsettings-to-runsettings`: «Providing a .testsettings file to the run triggers an error in VSTest 18.0+» + previous-versions code-coverage deprecation page | NOT in GitHub gitignore (migration path is convert, не ignore — но deprecation status подтверждён) | Microsoft Q&A + .NET migrating-vstest docs |
| H3 | `UpgradeLog*.htm` / `UpgradeLog*.XML` temporary upgrade wizard output | [VERIFIED] | VS Developer Community issue про automatically-generated UpgradeLog | ✅ Both `UpgradeLog*.htm` + `UpgradeLog*.XML` присутствуют в GitHub VisualStudio.gitignore | PowerPointLabs#1859, tutorialpedia.org, Hassan Tariq blog (multiple community refs) |
| H4 | `*.suo` / `*.user` per-user VS state | [VERIFIED] | Standard в Microsoft VS templates | ✅ Both в GitHub gitignore раздел «User-specific files» (top of file) | Universally known — все VS gitignore tutorials |

Recency: GitHub gitignore main branch (rolling current); Microsoft Learn pages про runsettings/testsettings обновлены недавно (mention VSTest 18.0+ — current major version); community refs от 2013-2020 — pattern stable, deprecated formats не меняются. **No `[STALE_RISK]` markers.**

## Технические находки

### Visual Studio source control bindings (`*.vssscc`, `*.vspscc`)

[VERIFIED: github.com/github/gitignore/VisualStudio.gitignore + developercommunity.visualstudio.com/content/problem/133069 + sourcegear.com/viewtopic.php?t=7115]

**Что:** VSSSCC (Visual Studio Solution Source Control) и VSPSCC (Visual Studio Project Source Control) — metadata text файлы хранящие connection info и exclusion lists для интеграции с source control providers (VSS, TFS old protocol). Solution-level (`.vssscc`) и Project-level (`.vspscc`).

**Происхождение:** Visual SourceSafe era (VS 2003-2010). С приходом Git/Subversion в качестве primary VCS в VS2013+ — стали vestigial.

**Цитата из community guide:** «VSSSCC and VSPSCC files are legacy binding hints from the Visual SourceSafe era that modern Git repositories don't need. These files are purely vestigial.»

**Решение:** Default Visual Studio `.gitignore` templates сейчас включают exclusion patterns автоматически — индустриально признано как legacy. Безопасно удалить из working directory (regenerate если reconnect to legacy SCC).

**Implication для FR/Design:** Включить в TRASH_PATTERNS (Phase 2 FR-3): `*.vssscc`, `*.vspscc`. Confidence high — 3 INDEPENDENT angles.

### Visual Studio test settings (`*.testsettings`)

[VERIFIED: learn.microsoft.com/visualstudio/test/migrate-testsettings-to-runsettings + learn.microsoft.com/previous-versions/dd504821 + learn.microsoft.com/dotnet/core/testing/migrating-vstest-microsoft-testing-platform]

**Что:** `.testsettings` — Visual Studio Test Settings file (Visual Studio 2010 era), используемый MSTest legacy adapter для конфигурации test runs. Заменён на `.runsettings`.

**Цитата из learn.microsoft.com:** «Although .testsettings files from Visual Studio 2010 will still work in current editions, Microsoft recommends removing the .testsettings file to take advantage of enhanced testing features, and to use a .runsettings file instead.» И critically: «Providing a .testsettings file to the run triggers an error in VSTest 18.0+».

**Migration tool:** `SettingsMigrator` (installs along with Visual Studio).

**Key differences:**
- `.testsettings` — only MSTest legacy adapter
- `.runsettings` — works with any unit test framework adapter (xUnit.net, NUnit, MSTest)

**Implication для FR/Design:** Включить `*.testsettings` в TRASH_PATTERNS. Note: Не в GitHub canonical gitignore (потому что migration path = convert не ignore), но deprecated status подтверждён 3 MS sources independent angles. Recommendation если файл найден: посоветовать SettingsMigrator + add to .gitignore. Confidence high.

### Visual Studio Upgrade Wizard reports (`UpgradeLog*.htm`, `UpgradeLog*.XML`)

[VERIFIED: github.com/github/gitignore/VisualStudio.gitignore + github.com/PowerPointLabs/PowerPointLabs/issues/1859 + developercommunity.visualstudio.com/content/problem/128528]

**Что:** HTML/XML reports генерируемые Visual Studio Project Upgrade Wizard при миграции старых .csproj/.sln форматов (например VS2010 → VS2017). Содержат лог изменений сделанных wizard'ом.

**Связанные artifacts:** `_UpgradeReport_Files/` (папка), `Backup*/` (backup проекта pre-upgrade), `UpgradeLog*.XML` (machine-readable вариант).

**Status:** Temporary, regenerate-on-need. Никогда не нужны в repo.

**В canonical gitignore:** Оба паттерна присутствуют в GitHub `VisualStudio.gitignore` main branch (per WebFetch результат: «UpgradeLog*.XML and UpgradeLog*.htm appear»).

**Implication для FR/Design:** Включить в TRASH_PATTERNS: `UpgradeLog*.htm`, `UpgradeLog*.XML`. Confidence high — все 3 angles confirm.

### Per-user Visual Studio state (`*.suo`, `*.user`)

[VERIFIED: github.com/github/gitignore/VisualStudio.gitignore (top section "User-specific files") + universally known]

**Что:**
- `*.suo` (Solution User Options) — binary file хранящий per-user IDE state (open windows, breakpoints, debug settings) per solution.
- `*.user` (Project User Options) — XML file хранящий per-user project state (debug args, build paths overrides).

**Status:** Per-user, никогда не нужны в shared repo. В GitHub VisualStudio.gitignore — в самом верху раздела «User-specific files» (наряду с `*.userosscache`, `*.sln.docstates`).

**Implication для FR/Design:** Включить `*.suo`, `*.user` в TRASH_PATTERNS. Confidence absolute — самые известные VS patterns для gitignore.

### Сводная таблица предлагаемых TRASH_PATTERNS additions

| Pattern | Status | Source angles | Action |
|---------|--------|---------------|--------|
| `*.vssscc` | [VERIFIED] | gitignore + MS community + 3rd-party blogs | Add to TRASH_PATTERNS |
| `*.vspscc` | [VERIFIED] | Same as above | Add to TRASH_PATTERNS |
| `*.testsettings` | [VERIFIED] | MS Learn deprecation + migration docs + .NET docs | Add to TRASH_PATTERNS |
| `UpgradeLog*.htm` | [VERIFIED] | gitignore + MS Developer Community + community blogs | Add to TRASH_PATTERNS |
| `UpgradeLog*.XML` | [VERIFIED] | gitignore + MS Developer Community + community blogs | Add to TRASH_PATTERNS |
| `*.suo` | [VERIFIED] | gitignore + MS templates + universal | Add to TRASH_PATTERNS |
| `*.user` | [VERIFIED] | gitignore + universal | Add to TRASH_PATTERNS |

## Где лежит реализация

- Plugin source: `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/`
  - `check.py` — pre-commit checker; TRASH_PATTERNS:157-181, classify_file:197-216, main:265-362
  - `configure.py` — interactive whitelist setup; find_files_not_in_whitelist:311-341, --non-interactive:478-480, interactive_select:344-369
  - `default-whitelist.yaml` — default allowed files (НЕ нужно расширять для VS legacy — это per-project gitignore territory)
  - `setup.py` — bootstrap (template copy + pre-commit install)
  - `deps-install.py` — pyyaml + simple_term_menu installer
- Plugin manifest: `extensions/forbid-root-artifacts/extension.json`
- Target output: `.root-artifacts.yaml` (создаётся в repo root downstream проекта)
- Skill (commands): `.claude/commands/configure-root-artifacts.md` (через extension manifest)

## Выводы

1. Все 4 главные гипотезы [VERIFIED] через 3+ INDEPENDENT angles. Расширение TRASH_PATTERNS на `*.vssscc`, `*.vspscc`, `*.testsettings`, `UpgradeLog*.htm`, `UpgradeLog*.XML`, `*.suo`, `*.user` — defensible решение основанное на industry-standard MS-curated gitignore + Microsoft Learn deprecation docs + community consensus.
2. `*.testsettings` deprecated path требует special UX: при детекции в configure.py — посоветовать SettingsMigrator (`learn.microsoft.com/migrate-testsettings-to-runsettings`), не просто .gitignore.
3. **Open question для Phase 2 DESIGN:** Должны ли VS-related TRASH patterns быть в shared `_classifier.py` всегда или per-project (только если detected `.csproj`/`.sln`)? Рекомендация: всегда — паттерны очень specific, false-positive риск минимальный (никто не называет config файл `*.vssscc` намеренно).
4. **Re-research триггеры:** (a) если Microsoft изменит status `.testsettings` (e.g. полностью удалит support из VSTest); (b) если появится новый VS pattern в industry-curated gitignore (отслеживать через GitHub gitignore commits); (c) если configure.py сценарий пойдёт не на VS-репо — patterns останутся conservative и не ударят по non-VS проектам.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move (writeJson → tempfile → fs.move) | YAML save в auto-prune (in pre-commit `check.py`) сохраняет очищенный `.root-artifacts.yaml` | NFR-Reliability; FR-1 (auto-prune save) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — single source of truth; обновлять `toolFiles[]` при добавлении файлов | Добавление `_classifier.py` в plugin tools | FR-4 (shared module) — manifest update обязателен |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test↔feature, naming `DOMAIN_CODE_NN`, запрет inline-копий, import guard | Расширение существующих PLUGIN004 тестов + .feature | FR-1..FR-4 — все Acceptance scenarios должны иметь it()↔Scenario pair |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными (runInstaller / spawnSync) | Тесты вызывают `python check.py` / `configure.py` через execSync — pattern уже соблюдён | NFR-Reliability — нельзя unit-only тесты как замену |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | tests/** в FILE_CHANGES → .specs/ или .feature обязательны | Bug-fix спека => регрессионный .feature scenario для каждого US | FR-1..FR-4 — каждая story → `.feature` scenarios + test |
| no-test-helper-duplication | `.claude/rules/test-quality/no-test-helper-duplication.md` | Перед новым helper — проверить `tests/e2e/helpers.ts` | Если будут shared helpers (e.g. `createStaleAllowYaml`) — добавить в helpers.ts, не дублировать | FR-2/FR-3 implementation tests |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | После каждого изменения — `npm run build`, копировать в installed location, /run-tests, screenshot | Workflow для каждого commit; копировать `.dev-pomogator/tools/forbid-root-artifacts/` в test fixtures | NFR-Reliability — gate перед коммитом |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Апдейтер удаляет только managed-файлы; user-модификации backup-ятся | `.root-artifacts.yaml` — НЕ managed (user file), auto-prune в check.py модифицирует — нужно reasoning что safe | FR-2 (safety boundary) |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = глоссарий/индекс на rules; при добавлении/удалении rules — обновить таблицу | Если в Phase 2 появится новое правило (например `trash-classifier-shared.md`) | FILE_CHANGES — CLAUDE.md update |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| forbid-root-artifacts plugin (current) | `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/` | Existing `check.py` (TRASH_PATTERNS:157-181, classify_file:197-216, find_violations), `configure.py` (find_files_not_in_whitelist:311-341), `setup.py`, `default-whitelist.yaml` | Direct extension target — все 4 stories модифицируют именно эти файлы; classify_file() уже существует и переиспользуется (US-4 shared module = вынести его в `_classifier.py`) |
| Existing tests | `tests/e2e/forbid-root-artifacts.test.ts` (PLUGIN004) | vitest + execSync python-call pattern, `runCheck()` / `runSetup()` helpers, beforeEach copies tools to test repo | Расширить этот файл новыми describe-блоками (Trash-Aware Configure, Auto-Prune, Stale Detection, Shared Classifier); НЕ создавать новый test file |
| Existing BDD feature | `tests/features/plugins/forbid-root-artifacts/PLUGIN004_forbid-root-artifacts.feature` | 9 existing Scenarios (default whitelist, extend/replace/deny modes, ignore_patterns, directories, setup, .progress.json trash classification) | Расширить новыми Scenarios согласно стилю — Background «git repository + plugin installed», Given/When/Then без сложных steps; naming PLUGIN004_NN |
| BDD framework detector output | `bdd-framework-detector.ts . →` `csharp/Reqnroll` | **False positive** — detector нашёл Reqnroll в `tests/fixtures/steps-validator/csharp/Project.csproj` (тестовая фикстура валидатора), не настоящий test framework | **Real framework для PLUGIN004 — vitest (TypeScript)** через `npm test`. Зафиксировать в DESIGN.md что detector вернул мусор на этом репо потому что Reqnroll fixture сидит в tests/fixtures/, а реальные тесты — vitest. Test runner — `npx vitest run tests/e2e/forbid-root-artifacts.test.ts` (через `/run-tests` per `centralized-test-runner` rule). |
| Helpers | `tests/e2e/helpers.ts` | initGitRepo, runInstaller, fs-extra wrappers — для shared test logic | Если новые helpers (e.g. `setupRepoWithStaleYaml(testRepoDir, allowEntries)`) — добавить сюда per `no-test-helper-duplication` |
| pre-commit hook integration | `.pre-commit-config.yaml` (target repo) | Hook entry для check.py | Существующая интеграция — Phase 2 не меняет |
| YAML conventions | `pyyaml` library, `yaml.safe_load` / `yaml.dump` patterns | Standard Python YAML I/O; preserves user config formatting | --prune save должен использовать pyyaml + atomic temp-file pattern (per `atomic-config-save` rule) |

### Architectural Constraints Summary

1. **Test infrastructure constraint:** Тесты — vitest (TypeScript) через `npx vitest run tests/e2e/forbid-root-artifacts.test.ts`. Python тесты НЕ применяются. Pattern: `execSync('python check.py')` + assert exit code + stdout content. BDD feature файл аккомпанирует test file 1:1 per `extension-test-quality` rule (PLUGIN004_NN naming).

2. **Manifest integrity constraint:** Любой новый файл в `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/` (e.g. `_classifier.py`) ОБЯЗАН быть добавлен в `extension.json → toolFiles[]`. Validator проверяется through `CORE003_RULES` динамический test (per `manifest-test-coverage` rule).

3. **Atomic save constraint:** YAML save в auto-prune (check.py) и в configure.py НЕ должен использовать direct `yaml.dump(open('w'))` — risk of corruption. Pattern: `tempfile + os.replace` (atomic move). См. `atomic-config-save` rule. Существующий `save_user_config` в configure.py:401-424 НЕ atomic — это existing bug, который надо fix параллельно (опц. для FR-2 реализации).

4. **Backward compat constraint:** `.root-artifacts.yaml` format не меняется. Существующие downstream YAML файлы продолжают работать. `--prune` — opt-in command, не запускается автоматически. `check.py` без `--prune` flag — exit codes остаются 0/1/2 как сейчас.

5. **No mocks для Python integration:** Тесты вызывают реальный `python check.py` / `configure.py` (execSync). Mocking Python-side НЕ применяется — это integration tests by definition (per `integration-tests-first` rule).

6. **Existing PLUGIN004 test scope:** Существующие 9 Scenarios остаются. Новые добавляются как PLUGIN004_10..PLUGIN004_18 (или с под-доменом, e.g. PLUGIN004_PRUNE_01). naming согласуется с `extension-test-quality` rule в Phase 2.

7. **CLAUDE.md glossary update:** Если в Phase 2 будет создано новое rule (например для shared classifier discipline) — обновить CLAUDE.md table per `claude-md-glossary` rule. Если нет — без изменений.

8. **Centralized test runner:** Запуск тестов исключительно через `/run-tests` или `npm test`. Прямой `npx vitest` блокируется hook'ом per `tui-test-runner/centralized-test-runner` rule.

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ {Low, Medium, High}, Impact ∈ {Low, Medium, High}, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing `.root-artifacts.yaml` в downstream репозиториях уже содержит stale entries (накопились до фикса) | High | Medium | Auto-prune в pre-commit silently мигрирует на первом commit downstream-проекта — изменения yaml попадают в тот же commit. Opt-out через `auto_prune.enabled: false` для users которые не готовы к auto-fix workflow. |
| Trash-aware filter ломает legitimate edge case (пользователь намеренно хочет whitelist логфайл) | Low | Low | Добавить `--allow-trash` флаг для override; document edge case в README; classify_file ≠ deletion — только filter из auto-suggest. User также может явно add file в `allow:` — auto-prune не trigger когда файл существует на диске. |
| Расширение `trash_patterns_default` в `default-whitelist.yaml` неверно классифицирует файл какого-то framework как trash (false positive) | Medium | Medium | Defaults остаются conservative — только VS legacy (vssscc, testsettings и т.п.) + общеизвестные temp/log; user полностью отключает через `use_default_trash_patterns: false`; can override via `trash_patterns: []` user-side. |
| Shared classifier module меняет import path → ломает downstream pre-commit hook на старой версии скрипта | Low | Medium | Versioning: bump `extension.json` version + entry в CHANGELOG; `check.py` имеет embedded fallback на `_FALLBACK_TRASH_PATTERNS` если `import _classifier` fails (graceful degradation, WARN в stderr — UC-7). |
| Auto-prune уничтожает intentional unstaged entry (пользователь добавил файл, который ещё не закоммичен и не существует в worktree) | Medium | High | Atomic commit pattern (NFR-Reliability-7): auto-prune изменения попадают в тот же commit что delete файла → `git revert HEAD` восстанавливает both atomically (UC-8); user видит diff в working tree до stage; opt-out через `auto_prune.enabled: false`. |
| LLM (Claude CLI) hallucinates trash классификацию для legitimate config файла | Low | Medium | LLM вызывается ТОЛЬКО для unmatched файлов в hybrid mode (rare path); user видит yaml diff до stage; cache fixed на 24h — повторный subprocess не повторяет hallucination до cache expiry; user может добавить файл в explicit `config_patterns:` для skip LLM (NFR-Security-4). |
| Claude CLI subprocess slow в pre-commit (500-2000ms per uncached call) | Medium | Low | Cache в `.dev-pomogator/.classifier-cache.json` (24h TTL по default) — после первого pre-commit все known files cached. Hybrid mode = LLM только для unmatched (rare). User может выбрать `mode: config` если speed critical. |
| Claude CLI отсутствует на CI runner (no Claude Code subscription) → unmatched files trеат как trash by surprise | Low | Medium | NFR-Reliability-5: graceful fallback `'unknown'` (НЕ `'trash'`) при отсутствии CLI; one-time WARN в stderr (UC-10); CI workflow не ломается, просто получают conservative behavior. |
