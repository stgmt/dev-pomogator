# BDD Enforcement — BDD is default для всех языков

## Принцип

**BDD — дефолтный test format для dev-pomogator specs. Везде. Для всех языков.** Escape hatch `TEST_FORMAT=UNIT` — emergency путь, не альтернатива.

Проекты без установленного BDD framework = **remediation target** (Phase 0 bootstrap block), не стабильное состояние "без BDD". Если в target test-проекте нет Reqnroll / Cucumber.js / pytest-bdd — план установки ставится первой задачей Phase 0, все implementation tasks зависят от неё.

## Framework Decision Tree

| Language | Framework (primary) | Framework (alternative) | Install Command | Hooks convention | Config |
|----------|---------------------|-------------------------|-----------------|------------------|--------|
| C# (.NET) | Reqnroll | SpecFlow | `dotnet add package Reqnroll && dotnet add package Reqnroll.xUnit` | `Hooks/BeforeAllHook.cs`, `Hooks/ScenarioHooks.cs` с `[BeforeScenario]` / `[AfterScenario]` attributes | `reqnroll.json` |
| TypeScript / JS | Cucumber.js | Playwright BDD | `npm install --save-dev @cucumber/cucumber` | `features/support/hooks.ts` с `Before()` / `After()` | `cucumber.js` |
| Python | pytest-bdd | Behave | `pip install pytest-bdd` | `tests/conftest.py` с `autouse=True` fixtures | `pytest.ini` |
| Python (alt) | Behave | — | `pip install behave` | `features/environment.py` с `before_scenario` / `after_scenario` | `behave.ini` |

## Phase 0 Bootstrap Block

Когда `Framework` отсутствует в target (Evidence = "not installed") И `TEST_FORMAT=BDD`, TASKS.md Phase 0 ОБЯЗАН содержать 3 task в строгой последовательности:

```
- [ ] Install {framework}: {installCommand}                                  — id: install-bdd-framework
- [ ] Bootstrap Hooks folder {hookFileHints} (Before/After All/Scenario)     — id: bootstrap-bdd-hooks
  _depends: install-bdd-framework_
- [ ] Create fixtures folder {fixturesFolderHint} + config {configFileHint}  — id: bootstrap-bdd-fixtures-config
  _depends: bootstrap-bdd-hooks_
```

Все implementation tasks (Phase 1+) ОБЯЗАНЫ содержать `_depends: bootstrap-bdd-fixtures-config_`.

## Escape Hatch: `-TestFormat unit`

Использовать **только** в крайних случаях:
- Legacy проект с запретом на новые dependencies (политика owner-а)
- Embedded target где BDD runtime фактически не работает
- Framework несовместим с другими ограничениями проекта

**Требования при TEST_FORMAT=UNIT:**
- DESIGN.md `## Risks` секция ≥30 символов с конкретным обоснованием
- `## BDD Test Infrastructure` поля: `TEST_FORMAT: UNIT`, `Framework: N/A`, `Install Command: N/A (BDD not applicable)`, `Evidence: {ссылка на Risks с justification}`
- `scaffold-spec -TestFormat unit` создаёт `SCENARIOS.md` (doc-only) вместо `.feature`
- Validator выдаёт ERROR если Risks пустая/короткая

## Integration with specs-management

Этот rule работает совместно с:
- `specs-management.md` Phase 2 Step 6.1a/b/c — классификация (TEST_DATA + TEST_FORMAT + Framework)
- `specs-management.md` Phase 1.5 Шаг 4a — детект framework через `bdd-framework-detector`
- `specs-validation.md` правило `BDD_INFRA_CLASSIFICATION_COMPLETE` (severity ERROR)
- State machine gate в `spec-status.ts -ConfirmStop Requirements` — exit code 1 без Classification

## См. также

- [.specs/create-specs-bdd-enforcement/](../../../.specs/create-specs-bdd-enforcement/) — полная спека с 9 FR и 6 BDD сценариями SBDE001_01..06
- [.specs/spec-phase-gate/](../../../.specs/spec-phase-gate/) — phase-gate hook architecture (reference)
- `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` — shared module для детекта
