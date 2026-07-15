# User Stories

### User Story: Monitor a test run @feature1

**Требование:** [FR-1]

Как разработчик, я хочу видеть ход тестового запуска в четырёх вкладках TUI, чтобы быстро понять его состояние.

### User Story: Run framework tests through one entry point @feature11

**Требование:** [FR-11]

Как разработчик, я хочу запускать поддерживаемые тестовые фреймворки через `/run-tests`, чтобы использовать единый безопасный путь запуска.

### User Story 20: Opt-in batched test execution (Priority: P1) @feature20

**Требование:** [FR-20]

As a developer running several supported test commands, I want to explicitly request an atomic spec-door batch, so that I receive one verifiable result while ordinary single-command `/run-tests` behavior remains unchanged.

**Why:** A local sequential loop could execute earlier commands before discovering a later invalid one; an endpoint transaction validates the entire requested batch before it has side effects.

**Independent Test:** Invoke `/run-tests` without `--batch` and assert no transaction is requested; invoke it with an invalid `--batch` command and assert the endpoint reports rejection with zero command executions.

**Acceptance Scenarios:**

Given supported dispatch-table commands
When `/run-tests --batch` submits them to the spec-door endpoint
Then the response has a transaction id and one result for each command
