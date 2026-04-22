# Use Cases

## UC-1: Scaffold спеки в проекте где BDD-фреймворк ещё не установлен @feature6

Агент запускает `/create-spec` для фичи в C#-проекте (`MobileSMARTS.Tests`, plain xUnit, Reqnroll ещё не установлен — remediation target, не стабильное "без BDD" состояние).

- Phase 1.5 вызывает `bdd-framework-detector.ts` → детектор отвечает `{ language: 'csharp', framework: null, suggestedFrameworks: ['Reqnroll','SpecFlow'], evidence: ['csproj has xUnit, no Reqnroll PackageReference'] }`
- Phase 2 Step 6 требует TEST_FORMAT=BDD (дефолт везде) + Framework=Reqnroll + Install Command=`dotnet add package Reqnroll`
- TASKS.md Phase 0 автогенерирует bootstrap block: `install-bdd-framework` → `bootstrap-bdd-hooks` → `bootstrap-bdd-fixtures-config`
- Все implementation tasks содержат `depends: bootstrap-bdd-fixtures-config`
- Результат: фича не может начаться без установленного Reqnroll + Hooks + fixtures + reqnroll.json

## UC-2: Multi-folder scan `.feature` в solution с несколькими test-проектами @feature3

Агент запускает `/create-spec` в solution где `.feature` лежат в `Cloud/server/Cleverence.Server.Tests/Features/` и `src/apps/Tests/Features/` (не в дефолтной `tests/features/`).

- `analyze-features.ts` рекурсивно сканит `**/*.feature` с ignore `node_modules`/`dist`/`build`/`bin`/`obj`/`.git`
- Оба `.feature` файла находятся в отчёте, Background и step patterns доступны для переиспользования
- Результат: новый `.feature` наследует реальные Given-шаги из существующих (`# Source: Cloud/server/Cleverence.Server.Tests/Features/ConnectorPersistence.feature`), а не выдумывает с нуля

## UC-3: State machine блокирует ConfirmStop Requirements без Classification @feature5

Агент пытается `spec-status.ts -Path .specs/my-feature -ConfirmStop Requirements` но DESIGN.md не содержит `## BDD Test Infrastructure` с TEST_DATA + TEST_FORMAT + Framework полями.

- `commandConfirmStop(Requirements)` читает DESIGN.md, проверяет regex `\*\*TEST_DATA:\*\*\s*(TEST_DATA_ACTIVE|TEST_DATA_NONE)` и `\*\*TEST_FORMAT:\*\*\s*(BDD|UNIT)`
- Regex не matches → throw Error, exit code 1
- stderr: «DESIGN.md missing BDD Test Infrastructure Classification. Run Phase 2 Step 6 assessment. See specs-management.md.»
- Результат: фаза не переходит в Finalization, агент вынужден заполнить Classification

## UC-4: Emergency escape hatch `-TestFormat unit` с обязательным обоснованием @feature4

Агент в крайнем случае пытается `scaffold-spec -TestFormat unit` (когда установка BDD framework фактически невозможна: legacy проект с запретом новых deps, или embedded target без Reqnroll runtime).

- Scaffold создаёт `SCENARIOS.md` (doc-only) с header `> DOC ONLY — no executable BDD in this project. UNIT test format selected (see DESIGN.md Risks for justification).`
- DESIGN.md `## BDD Test Infrastructure` требует `**TEST_FORMAT:** UNIT` + justification в Risks секции
- Validator BDD_INFRA_CLASSIFICATION_COMPLETE проверяет что Risks содержит непустое обоснование — если пусто, severity ERROR
- Результат: UNIT доступен только с явным и видимым обоснованием; дефолт везде BDD
