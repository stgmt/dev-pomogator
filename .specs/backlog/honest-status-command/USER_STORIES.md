# User Stories

> v3 form: `(Priority: P1|P2|P3)` + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: AI delegates spec status check to independent sub-agent (Priority: P1)

As a главный AI-агент, я хочу делегировать проверку статуса фичи независимому sub-agent (Agent tool с подходящим subagent_type), чтобы получить честный отчёт без bias главного агента который вёл задачу и склонен overclaim "всё работает".

**Why:** В incident 2026-05-10 главный AI заявил "всё проверено и пушнуто" хотя на самом деле 4 проверки были blocked Docker/WSL issues. Independent sub-agent с fresh context не имеет goal-completion bias и реально читает артефакты (.progress.json, plan, git, .test-status YAML).

**Independent Test:** `/spec-status honest-status-command` запускает Agent tool (subagent_type=general-purpose) с переданным контекстом (spec slug, plan path, AC checklist), возвращает structured JSON отчёт. Проверка через mock spec — sub-agent должен пометить unverified AC как ❌, не как ✓.

**Acceptance Scenarios:**

Given главный AI закончил implementation спеки X с 5 AC
When пользователь вызывает `/spec-status X`
Then команда invokes Agent("general-purpose") с context bundle
And sub-agent читает .test-status YAML age + AC body
And output reports verified vs claimed AC counts с evidence paths

---

### User Story 2: Команда привязана к текущей спеке + плану + git (Priority: P1)

As a разработчик dev-pomogator, я хочу чтобы `/spec-status` без аргументов автодетектил текущую активную спеку (по .progress.json самой свежей AND по plan-pomogator plan file), и отдавал unified отчёт привязанный к task list из неё.

**Why:** Мы работаем по спекам — задачи из спек, planы из плана. Команда без аргументов должна понимать "что мы сейчас делаем" без manual slug передачи.

**Independent Test:** Запустить `/spec-status` в репо где (a) .specs/X/.progress.json с currentPhase Discovery, (b) ~/.claude/plans/X-plan.md существует, (c) git modified files в scope X. Команда определяет slug=X, читает все три источника, возвращает корреллированный статус.

**Acceptance Scenarios:**

Given .specs/active-feature/.progress.json updated 5 min ago
And ~/.claude/plans/active-feature.md имеет 8 todos (5 completed, 3 pending)
And `git status --short` показывает 12 modified files в .specs/active-feature/
When `/spec-status` (no args) invoked
Then output: feature=active-feature, phase=Phase 3, todos 5/8, git: 12 modified не committed

---

### User Story 3: Тесты проверяются на fake-positives, не только pass/fail (Priority: P1)

As a code reviewer, я хочу чтобы `/spec-status` flagged тесты которые "passed" но реально weak — мок-heavy, нет strong assertions, missing edge cases — потому что "6/6 green" может быть fake-positive.

**Why:** Юзер прямо сказал "тело тестов, не хуйня ли тесты в первую очередь". Test pass count без quality check — false sense of safety. Strong-tests skill уже знает 12-point checklist; sub-agent применяет к тестам в scope текущей спеки.

**Independent Test:** На тестовом fixture — тест с `expect(true).toBe(true)` (fake-positive) и тест с реальными assertions. Sub-agent должен flag первый как WEAK, второй как STRONG. Output содержит test quality breakdown с specific concerns.

**Acceptance Scenarios:**

Given текущая спека ссылается на tests/e2e/X.test.ts с 5 it()-блоков
And 2 из них используют только `expect(result).toBeDefined()` (weak assertion)
And 3 используют `toEqual()` с full structure (strong)
When /spec-status invoked
Then output reports test quality: 3/5 strong, 2/5 weak с line numbers и reason

---

### User Story 4: Environmental blockers vs real failures разделяются (Priority: P2)

As a project manager, я хочу видеть в отчёте отдельную секцию "Environmental Blockers" (Docker down, WSL hang, network) — чтобы не путать инфраструктурные проблемы с реальными bugs.

**Why:** В incident WSL/Docker умер — это environment, не код. Без разделения AI может claim "tests failed" вместо "tests blocked, не запущены".

**Independent Test:** Симулировать WSL connection failure → запустить /spec-status → output должен содержать "Environmental block: WSL connection failed" в отдельной секции, тесты помечены ⏸ (blocked), не ❌ (failed).

**Acceptance Scenarios:**

Given .dev-pomogator/.test-status YAML last updated 25 min ago
And `docker ps` returns connection error
When /spec-status invoked
Then output section "Environmental Blockers" lists "Docker daemon unreachable"
And tests section marks "STALE — last run 25 min ago, blocked by Docker"
And does NOT mark tests as ❌ failed
