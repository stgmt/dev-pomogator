# Functional Requirements (FR)

## FR-1: Качество требований по IEEE 29148 / INCOSE @feature1

Система specs-workflow ДОЛЖНА применять 8 обязательных критериев качества IEEE 29148 при генерации и валидации требований (FR/NFR/AC) в Phase 2. AI-агент не может пропустить ни один критерий — все non-negotiable.

### 8 критериев качества

| # | Критерий | Определение | Пример fail → fix |
|---|----------|------------|-------------------|
| 1 | **Unambiguous** | Одна и только одна интерпретация. Два инженера прочитают — реализуют одинаково | "быстро" → "за ≤2.0 секунды после аутентификации" |
| 2 | **Testable** | Можно написать Pass/Fail тест прямо сейчас. Без теста — не требование | "highly accurate" → "95% queries в top-3 результатов" |
| 3 | **Atomic** | Ровно ОДНО требование. Нет "и"/"или"/"но"/"если не". Compound → split | "save AND email" → REQ-010 (save) + REQ-011 (email) |
| 4 | **Complete** | Вся информация для разработчика И тестировщика. Нет TBD | "after too many" → "после 5 попыток за 15-минутное окно" |
| 5 | **Consistent** | Не противоречит другим REQ в спеке | Конфликт → `[CONFLICT: REQ-N vs REQ-M — resolution needed]` |
| 6 | **Traceable** | Уникальный ID + rationale (backward trace к бизнес-потребности) | REQ-NNN + "Rationale: User Story US-3 требует..." |
| 7 | **Feasible** | Технически, юридически, финансово реализуемо | "100% uptime forever" → "99.9% availability в business hours" |
| 8 | **Necessary** | Трассируется к реальной потребности. Нет gold-plating | Strict translator: нельзя выдумывать то, чего нет в source |

### Banned words (15 запрещённых слов)

AI-промпт ОБЯЗАН содержать список запрещённых слов. Если source использует их — AI переводит в измеримые, тестируемые формулировки:

| Banned Word | Заменяется на |
|-------------|--------------|
| fast | конкретный порог времени ("within 2 seconds") |
| user-friendly | конкретные usability criteria ("completable in 3 steps") |
| robust | конкретное поведение при сбое (retry policy, fallback) |
| seamless | конкретное поведение интеграции (zero-downtime migration) |
| intuitive | конкретные критерии learnability ("first-use without docs") |
| efficient | конкретные метрики ресурсов/времени (CPU < 50%, memory < 256MB) |
| reasonable | конкретный порог или диапазон (5-15 секунд) |
| significant | конкретный процент или количество (>30% improvement) |
| adequate | конкретные минимальные критерии (≥3 replicas) |
| minimal | конкретное максимальное значение (≤100ms latency) |
| approximately | конкретный диапазон или допуск (500 ± 10 records) |
| scalable | конкретные нагрузки ("10,000 concurrent users") |
| secure | конкретные меры ("TLS 1.2+ encryption, bcrypt hashing") |
| reliable | конкретные availability/MTBF ("99.95% SLA, MTBF > 720h") |
| flexible | конкретные точки расширения/конфигурации ("plugin interface with 3 hooks") |

### Strict Translator Constraint

AI НЕ выдумывает требования. Только формализует то, что есть в source (spec.md, USER_STORIES.md, USE_CASES.md):
- Непонятное → `[NEEDS CLARIFICATION: конкретный вопрос]` (максимум 3)
- Невозможное → `[FEASIBILITY CONCERN: описание причины]`
- Конфликт → `[CONFLICT: REQ-N vs REQ-M — resolution needed]` → HALT

### 4 категории REQ с prefix

| Prefix | Категория | Пример |
|--------|----------|--------|
| *(none)* | Functional | `REQ-001` |
| `NF` | Non-Functional | `REQ-NF-001` |
| `IF` | Interface | `REQ-IF-001` |
| `CN` | Constraint | `REQ-CN-001` |

### Verification Method per REQ

Каждый REQ обязан иметь поле Verification Method: **Test** | **Inspection** | **Analysis** | **Demonstration**.

### Independence Coverage для сложных AC (≥2 условий в EARS)

Если AC содержит составное EARS условие (`AND`/`OR`/`IF`) с ≥2 предикатами — ACCEPTANCE_CRITERIA.md ОБЯЗАН содержать **truth table**, где каждое условие независимо влияет на outcome (не только happy path).

**Формат таблицы:**

| Test | Условие A | Условие B | NOT Условие C | Outcome | Что проверяет |
|------|-----------|-----------|----------------|---------|---------------|
| T1   | T         | F         | F              | fail    | A alone достаточно |
| T2   | F         | T         | F              | fail    | B alone достаточно |
| T3   | T         | T         | T              | pass    | C (skip) побеждает |

Каждая строка таблицы = **отдельный Gherkin сценарий** в `.feature` файле.

**Когда применять:** EARS формулировки типа `WHEN (X OR Y) AND NOT Z THEN system SHALL ...`

**Пруф:** адаптировано из MC/DC coverage criterion (DO-178C, ISO 29119-4) — universal technique, применимо к любым complex boolean AC, независимо от домена. Источник: [§22 RESEARCH.md](RESEARCH.md#22-white-box-unit-test-techniques-из-unit-testmd).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

---

## FR-2: Детерминированная coverage validation @feature2

Система specs-workflow ДОЛЖНА использовать детерминированные скрипты (regex, exit code 0/1) для валидации coverage на каждом уровне V-Model. Принцип: **"Scripts Verify, AI Generates"** — AI генерирует контент, скрипты валидируют. AI НИКОГДА не оценивает собственное покрытие.

### 4 уровня coverage скриптов

| Скрипт | Design → Test | Forward check | Backward check |
|--------|--------------|---------------|----------------|
| validate-requirement-coverage | REQ-NNN → ATP-NNN-X | Каждый REQ имеет хотя бы один ATP | Каждый ATP ссылается на существующий REQ |
| validate-system-coverage | SYS-NNN → STP-NNN-X | Каждый SYS имеет хотя бы один STP | Каждый STP ссылается на существующий SYS |
| validate-architecture-coverage | ARCH-NNN → ITP-NNN-X | Каждый ARCH имеет хотя бы один ITP | Каждый ITP ссылается на существующий ARCH |
| validate-module-coverage | MOD-NNN → UTP-NNN-X | Каждый MOD имеет хотя бы один UTP | Каждый UTP ссылается на существующий MOD |

### Что каждый скрипт делает

1. Парсит design-файл → извлекает все ID данного уровня (regex)
2. Парсит test-файл → извлекает все test case ID (regex)
3. **Forward coverage:** каждый design ID → есть хотя бы один test case
4. **Backward coverage:** каждый test case → ссылается на существующий design ID
5. **Orphan detection:** test cases без parent design item
6. **Gap detection:** design items без test case
7. **exit 0** = 100% coverage, **exit 1** = gaps found (с конкретным списком missing IDs)

### Coverage gate

- Запускается **после каждой пары** (не в конце)
- Не пропускает к следующему уровню при exit 1
- AI получает конкретный список gaps для исправления

### build-matrix

Автогенерация quadruple traceability matrix:
```
REQ-NNN → ATP-NNN-X → SYS-NNN → STP-NNN-X → ARCH-NNN → ITP-NNN-X → MOD-NNN → UTP-NNN-X
```

Скрипт `build-matrix` парсит `Parent Requirements` / `Parent System Components` / `Parent Architecture Modules` из конкретных секций файлов (section-scoped regex).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

---

## FR-3: ID-based трассируемость @feature3

Система specs-workflow ДОЛЖНА использовать self-documenting ID schema из 12 типов ID по 4 уровням V-Model, где parent ID закодирован в child ID (intra-level), а между уровнями связь через explicit field (inter-level).

### 12 типов ID, 4 уровня

| Уровень | Design ID | Test Case ID | Scenario/Step ID | Чтение |
|---------|-----------|-------------|-----------------|--------|
| Requirements ↔ Acceptance | `REQ-NNN` | `ATP-NNN-X` | `SCN-NNN-X#` | SCN-003-A1 = "сценарий 1, тест A, требование 003" |
| System ↔ System Test | `SYS-NNN` | `STP-NNN-X` | `STS-NNN-X#` | STS-005-B2 = "шаг 2, тест B, компонент 005" |
| Architecture ↔ Integration | `ARCH-NNN` | `ITP-NNN-X` | `ITS-NNN-X#` | ITS-002-A3 = "шаг 3, тест A, модуль 002" |
| Module ↔ Unit Test | `MOD-NNN` | `UTP-NNN-X` | `UTS-NNN-X#` | UTS-010-C1 = "шаг 1, тест C, модуль 010" |

### Intra-level трассируемость (закодировано в ID)

NNN-часть child ID = parent ID. Связь автоматическая, не требует явного поля:
```
REQ-003  →  ATP-003-A  →  SCN-003-A1
     ^^^        ^^^
     "003" IS the link
```

### Inter-level трассируемость (explicit field)

Между уровнями — many-to-many связь через explicit field в design-файле:
- `SYS-001 → Parent Requirements: REQ-001, REQ-NF-002`
- `ARCH-003 → Parent System Components: SYS-001, SYS-004`
- `MOD-007 → Parent Architecture Modules: ARCH-002, ARCH-005`

### ID правила (permanent, never renumber)

- Последовательная нумерация: REQ-001, REQ-002, REQ-003...
- **Gaps допустимы:** если REQ-003 удалён, REQ-004 остаётся REQ-004
- При обновлении: preserve existing IDs + append new ones
- Category prefix только для REQ/ATP/SCN: NF, IF, CN

### Regex валидация

```
REQ:  REQ-(?:[A-Z]+-)?[0-9]{3}       # REQ-001, REQ-NF-001
ATP:  ATP-(?:[A-Z]+-)?[0-9]{3}-[A-Z]  # ATP-001-A
SCN:  SCN-(?:[A-Z]+-)?[0-9]{3}-[A-Z][0-9]+  # SCN-001-A1
SYS:  SYS-[0-9]{3}                    # SYS-001
STP:  STP-[0-9]{3}-[A-Z]              # STP-001-A
STS:  STS-[0-9]{3}-[A-Z][0-9]+        # STS-001-A1
ARCH: ARCH-[0-9]{3}                    # ARCH-001
ITP:  ITP-[0-9]{3}-[A-Z]              # ITP-001-A
ITS:  ITS-[0-9]{3}-[A-Z][0-9]+        # ITS-001-A1
MOD:  MOD-[0-9]{3}                     # MOD-001
UTP:  UTP-[0-9]{3}-[A-Z]              # UTP-001-A
UTS:  UTS-[0-9]{3}-[A-Z][0-9]+        # UTS-001-A1
```

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

---

## FR-4: Трёхуровневый design (IEEE 1016 + IEEE 42010 + DO-178C) @feature4

Система specs-workflow ДОЛЖНА поддерживать 3 уровня design-документов, каждый с собственным IEEE стандартом, 4 mandatory views и coverage gate. Итого **12 обязательных views**.

### Level 2: System Design (IEEE 1016 §5)

**Вход:** requirements.md → **Выход:** system-design.md

| View | IEEE § | Содержимое | Feeds в тестах |
|------|--------|-----------|----------------|
| Decomposition (§5.1) | Таблица `SYS-NNN` + Name + Description + Parent Requirements + Type | Forward coverage gate |
| Dependency (§5.2) | Source → Target → Relationship → Failure Impact + ASCII/Mermaid диаграмма | Fault Injection tests |
| Interface (§5.3) | External interfaces (user/hardware) + Internal interfaces (inter-module) — **РАЗДЕЛЬНЫЕ таблицы** | Interface Contract tests |
| Data Design (§5.4) | Entity → Component → Storage → Protection at Rest → Protection in Transit → Retention | Boundary Value Analysis |

**Strict translator:** NO inventing capabilities not traceable to REQ-NNN.

**Derived Requirement Detection:** Если architecture requires capability, которой нет в requirements → `[DERIVED REQUIREMENT: description + rationale]` → HALT. Человек решает: add to requirements / reject / merge.

**Many-to-many:** один REQ может быть в нескольких SYS, один SYS может покрывать несколько REQ. Decomposition View `Parent Requirements` column = single source of truth.

**Component types:** Subsystem | Module | Service | Library | Utility.

**Coverage gate:** КАЖДЫЙ REQ-NNN из requirements.md обязан появиться в Parent Requirements хотя бы одного SYS. Скрипт `validate-system-coverage` проверяет.

**Safety-critical (conditional, если `v-model-config.yml` domain set):**
- Freedom from Interference (ISO 26262-6 §7.4.8): ASIL isolation между компонентами
- Restricted Complexity (ISO 26262-6 §7.4.9): cyclomatic complexity, nesting depth, coupling

### Level 3: Architecture Design (IEEE 42010 / Kruchten 4+1)

**Вход:** system-design.md → **Выход:** architecture-design.md

| View | Kruchten | Содержимое | Feeds в тестах |
|------|----------|-----------|----------------|
| Logical View | Component Breakdown | `ARCH-NNN` + Name + Description + Parent System Components + Type + `[CROSS-CUTTING]` tag | Forward coverage gate |
| Process View | Dynamic Behavior | Mermaid `sequenceDiagram` с ARCH-NNN как participants + concurrency model + synchronization points | Concurrency & Race Condition tests |
| Interface View | Strict API Contracts | Direction + Name + Type + Format + Constraints для КАЖДОГО ARCH (no black boxes) | Interface Contract + Fault Injection |
| Data Flow View | Data Transformation | Stage → Module → Input Format → Transformation → Output Format | Data Flow tests |

**`[CROSS-CUTTING]` tag:** Для инфраструктурных модулей (Logger, Config Manager, Thread Pool) — не derived, но без Parent SYS. ОБЯЗАНЫ иметь Interface contracts в Interface View.

**`[DERIVED MODULE]` detection:** Модуль не traceable к SYS-NNN и не `[CROSS-CUTTING]` → `[DERIVED MODULE: description]` → HALT. Человек решает: add to system-design / reject / tag as CROSS-CUTTING.

**Anti-pattern guard:** Reject "black box" описания — каждый ARCH ОБЯЗАН иметь explicit interface contract (inputs, outputs, exceptions). Если description слишком vague → warning + refine. "The module processes data" — ОТКЛОНЯЕТСЯ.

**Mermaid diagrams:** `sequenceDiagram` обязательны в Process View, синтаксически валидны, используют ARCH-NNN как participants.

**Coverage gate:** КАЖДЫЙ SYS-NNN из system-design.md → хотя бы один ARCH-NNN. Скрипт `validate-architecture-coverage`.

**Scale handling:** 50+ SYS inputs — every one addressed individually, no batching/summarization.

**Safety-critical (conditional):**
- ASIL Decomposition (ISO 26262-9 §5): parent SYS ASIL → child ARCH ASIL allocation
- Defensive Programming (ISO 26262-6 §7.4.2 / DO-178C §6.3.3): invalid input detection, recovery
- Temporal & Execution Constraints (DO-178C §6.3.4): watchdog timers, scheduling, deadlock prevention

### Level 4: Module Design (DO-178C / ISO 26262)

**Вход:** architecture-design.md → **Выход:** module-design.md

| View | Содержимое | Anti-pattern |
|------|-----------|-------------|
| Algorithmic/Logic | Пошаговый pseudocode в fenced `\`\`\`pseudocode\`\`\`` blocks. Каждый branch/loop/decision explicit | ❌ "processes input appropriately" → ✅ `if input.length > MAX: return ERROR_OVERFLOW` |
| State Machine | Mermaid `stateDiagram-v2` для stateful ИЛИ bypass `N/A — Stateless` (regex-detectable) | ❌ "the module has states" → ✅ полная диаграмма с transitions/guards/actions |
| Internal Data Structures | Type + Size/Constraints + Initialization + Lifecycle для КАЖДОЙ переменной/буфера | ❌ "uses a buffer" → ✅ "buffer: uint8_t[256], init: zero-filled" |
| Error Handling & Return Codes | Error → Contract mapping (из Architecture Interface View) + propagation + recovery | ❌ "handles errors" → ✅ exact error codes, catch vs re-throw |

**CRITICAL DISTINCTION:** Module Design ≠ архитектура. НЕ описывает boundaries/interfaces между модулями. Описывает ВНУТРЕННЮЮ логику, state, data structures.

**Decomposition rules by ARCH Type:**

| ARCH Type | Decomposition Rule | Пример |
|-----------|-------------------|--------|
| Component | 1 MOD per major function/class | ARCH-001 (Parser) → MOD-001 (parse_input), MOD-002 (validate_schema) |
| Service | 1 MOD per endpoint/handler | ARCH-003 (API Service) → MOD-005 (handle_create), MOD-006 (handle_delete) |
| Library | 1 MOD per public API surface | ARCH-005 (Template Lib) → MOD-008 (load_template), MOD-009 (render_template) |
| Utility | Often 1:1 with ARCH | ARCH-007 (Config Loader) → MOD-010 (load_config) |

**Tag routing:**
- `[CROSS-CUTTING]` → full 4-view decomposition (infra = same rigor as business logic)
- `[EXTERNAL]` → only wrapper/config interface, skip library internals. Wrapper logic (retry, circuit breaker) MUST be documented
- Untraceable → `[DERIVED MODULE]` → HALT

**Target Source File(s):** Каждый MOD обязан указать физический путь в репозитории (`Target Source File(s): src/parser.py`). Bridge spec → code.

**Mandatory pseudocode:** Каждый non-EXTERNAL MOD содержит fenced pseudocode block. Structural validators reject vague prose.

**Coverage gate:** КАЖДЫЙ ARCH-NNN → хотя бы один MOD-NNN. Скрипт `validate-module-coverage`.

**Safety-critical (conditional):**
- Complexity Constraints (MISRA C/C++, CERT-C): cyclomatic complexity ≤10 per function
- Memory Management (DO-178C / ISO 26262): no dynamic alloc after init, bounded loops, max stack depth
- Single Entry/Exit (DO-178C Level A): exactly one return per function

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

---

## FR-5: Paired generation + progressive traceability @feature5

Система specs-workflow ДОЛЖНА генерировать design-документ и test-документ ПАРОЙ на каждом уровне V-Model, с запуском trace и coverage gate после каждой пары. Gaps ловятся инкрементально, не в конце.

### 4 пары design ↔ test

| # | Design (left side) | Test (right side) | ISO standard | Что тестирует |
|---|-------------------|------------------|-------------|--------------|
| 1 | requirements.md | acceptance-plan.md | ISO 29119 | User needs: ATP/SCN в Given/When/Then |
| 2 | system-design.md | system-test.md | ISO 29119-4 | Architecture works: 4 named techniques по IEEE 1016 views |
| 3 | architecture-design.md | integration-test.md | ISO 29119-4 | Module seams: 4 mandatory techniques по Kruchten views |
| 4 | module-design.md | unit-test.md | ISO 29119-4 | Internal logic: white-box по pseudocode |

### Named ISO 29119 test techniques per level

**System Test (targets IEEE 1016 views):**

| Design View | ISO 29119 Technique | Что тестирует |
|------------|-------------------|--------------|
| Interface View | Interface Contract Testing | API contracts, protocol compliance, error responses (External + Internal — separate test cases) |
| Data Design View | Boundary Value Analysis | Data limits, thresholds, ranges (exact boundaries ± 1) |
| Data Design View | Equivalence Partitioning | Representative data classes |
| Dependency View | Fault Injection / Negative Testing | Failure propagation, graceful degradation, isolation |

**Integration Test (targets Kruchten 4+1 views):**

| Architecture View | ISO 29119 Technique | Что тестирует |
|------------------|-------------------|--------------|
| Interface View | Interface Contract Testing | Consumer-provider contract compliance (Module A ↔ Module B) |
| Data Flow View | Data Flow Testing | Transformation chain correctness, intermediate format verification |
| Interface + Process View | Interface Fault Injection | Malformed payloads, timeouts, partial responses, error propagation |
| Process View | Concurrency & Race Condition Testing | Simultaneous access, queue ordering, deadlock avoidance, starvation |

Каждый test case ОБЯЗАН:
1. **Назвать ISO 29119 technique** explicitly
2. **Указать какой design view** он targets
3. **Содержать хотя бы один scenario** (STS/ITS/UTS) в Given/When/Then

### Language mandates per test level (PROHIBITED phrases)

| Уровень теста | Запрещено | Обязательный стиль |
|--------------|-----------|-------------------|
| **Acceptance Test** | *(нет ограничений — user language)* | "the user clicks", "the dashboard shows" |
| **System Test** | "user clicks/sees/navigates/enters/selects/receives", "dashboard shows", "form displays" | "the [component] receives [input]", "the [service] returns [output] within [threshold]" |
| **Integration Test** | user-centric phrases И "function returns/method throws" | "ARCH-NNN sends [message] to ARCH-NNN", "data flowing from ARCH-NNN to ARCH-NNN" |
| **Unit Test** | user-centric И module-boundary phrases | "function X returns Y when Z", "method throws ExceptionType" |

Каждый уровень имеет СВОЙ language mandate — нельзя мешать стили.

### Progressive Traceability Matrix

Trace запускается **4 раза** — после КАЖДОЙ пары:

```
1. requirements + acceptance     → Matrix A     (REQ ↔ ATP ↔ SCN)
2. + system-design + system-test → Matrix A+B   (+ SYS ↔ STP ↔ STS)
3. + architecture + integration  → Matrix A+B+C (+ ARCH ↔ ITP ↔ ITS)
4. + module + unit               → Matrix A+B+C+D (+ MOD ↔ UTP ↔ UTS)
```

**Gaps ловятся на каждом уровне.** Если SYS-003 не имеет STP — это видно сразу после level 2. Не надо ждать level 4.

### Coverage gate per level

- **exit 0** = 100% forward + backward coverage → proceed to next level
- **exit 1** = gaps found → AI получает конкретный список, исправляет, coverage re-run
- Переход к следующему уровню БЛОКИРУЕТСЯ пока предыдущий level не 100%

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

---

## FR-6: Cross-Platform Script Safety @feature6

Все детерминированные скрипты (coverage validation, build-matrix, ID validation) ДОЛЖНЫ корректно работать на bash и PowerShell без повреждения данных. Подтверждённый баг: build-matrix.ps1 повреждает Unicode-эмодзи и интерпретирует `|` в markdown-таблицах как PowerShell pipeline operator.

### 3 обязательных constraint

| # | Constraint | Что значит | Пример fail → fix |
|---|-----------|-----------|-------------------|
| 1 | **Unicode output safety** | Эмодзи (⬜✅❌🚫⏸️) и Unicode символы (═, ─, │) не должны повреждаться при генерации output файлов | `⬜` → `???` в PowerShell output → fix: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` |
| 2 | **Markdown pipe escaping** | Символ `\|` внутри markdown-таблиц НЕ должен интерпретироваться как shell pipeline operator | `\| REQ-001 \| Description \|` → PowerShell pipeline error → fix: строка в кавычках, не bare expression |
| 3 | **Cross-platform output parity** | bash и PowerShell версии скрипта ДОЛЖНЫ генерировать семантически идентичный output | Matrix из bash ≠ matrix из PowerShell → fix: единый output format, parity тесты |

### PowerShell-specific mitigations

1. **UTF-8 encoding:** Каждый скрипт, генерирующий markdown с Unicode, ОБЯЗАН устанавливать:
   ```powershell
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   # или при записи в файл:
   Set-Content -Path $output -Value $content -Encoding utf8
   ```

2. **Pipe-safe string construction:** Markdown-таблицы строить через string concatenation или here-string, НИКОГДА не через bare expressions содержащие `|`:
   ```powershell
   # ❌ WRONG — PowerShell интерпретирует | как pipe
   | REQ-001 | Description | Status |

   # ✅ CORRECT — строка в кавычках
   $row = "| REQ-001 | Description | Status |"
   ```

3. **Heredoc для multi-line tables:**
   ```powershell
   $table = @"
   | ID | Name | Status |
   |-----|------|--------|
   | REQ-001 | First requirement | ⬜ Pending |
   "@
   ```

### Bash-specific mitigations

1. **Locale verification:** `export LANG=en_US.UTF-8` или проверка `locale charmap` = UTF-8
2. **printf vs echo:** Для Unicode output использовать `printf '%s\n'`, не `echo` (behavior varies across shells)

### Parity testing

Каждый скрипт с bash + PowerShell версией ОБЯЗАН иметь parity тесты:
- Одинаковый input → одинаковый output (diff на ASCII subset, semantic diff на Unicode)
- Spec-kit-v-model подход: 91 bats tests + 91 pester tests = полная паритетность
- Exit code parity: оба скрипта возвращают одинаковый exit code на одинаковом input

### Источник требования

Подтверждённый баг при запуске `build-matrix.ps1` из spec-kit-v-model на Windows:
- Unicode-эмодзи статусов (⬜, ✅, ❌, 🚫, ⏸️) повреждены в output
- `|` в markdown table rows интерпретирован как PowerShell pipeline operator
- Bash-версия (`build-matrix.sh`) работает корректно на тех же данных

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
