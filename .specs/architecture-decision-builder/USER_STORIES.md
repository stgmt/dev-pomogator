# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Multi-variant stack proposal for greenfield (Priority: P1)

As a developer with a new project (only PRD markdown, no code yet), I want разложенные варианты стека/архитектуры с pros/cons/cost/рекомендацией, so that я выбираю осознанно, а не по первому инстинкту LLM.

**Why:** spec-generator формализует фичу внутри уже выбранного стека, но сам выбор стека для greenfield не покрыт ничем — делается вручную в чате каждый раз.

**Independent Test:** запустить skill (`enumerate` + `next-axis`) на greenfield-fixture PRD без build-manifest → проверить что для оси вернулось ≥3 варианта, каждый с pros/cons и одной выделенной recommendation. Covers @feature1, @feature8.

**Acceptance Scenarios:**

Given PRD-маркдаун без build-manifest и с trigger phrase "выбери стек"
When skill выполняет команду enumerate затем next-axis для первой оси
Then artefact содержит ≥3 варианта с Y-summary, Good/Neutral/Bad буллетами и явной рекомендацией

Given ось с 3 вариантами сгенерирована
When читаю рекомендацию
Then указан выбранный вариант + одно предложение "почему" + условие "когда пересмотреть"

---

### User Story 2: Browser-rendered HTML artefact with highlighted recommendation (Priority: P1)

As a reviewer, I want видеть варианты красивой self-contained веб-страницей с явно выделенной рекомендацией, открывающейся в браузере, so that я понимаю выбор за 30 секунд, а не читаю сырой markdown.

**Why:** markdown глазами читать тяжело; пользователь прямо просил красивый понятный HTML с автооткрытием в браузере для визуализации.

**Independent Test:** сгенерить axis artefact → `open-in-browser` → визуально проверить: recommended-card pinned top, цветовая кодировка ✅/◐/❌, self-contained (inline CSS, без внешних `<link>`). Covers @feature2, @feature3, @feature4.

**Acceptance Scenarios:**

Given axis artefact сгенерирован в markdown
When skill рендерит .html и вызывает open-in-browser
Then HTML self-contained (inline CSS) и рекомендация pinned top независимо от random-order вариантов в grid

Given окружение без браузера (WSL/headless)
When open-in-browser падает с ENOENT
Then skill печатает fallback-путь к файлу и продолжает без исключения

---

### User Story 3: Auto-invoked architecture phase inside create-spec (Priority: P1)

As a create-spec user, I want чтобы при greenfield-спеке архитектурные оси предлагались автоматически (новая Phase 1.75) перед написанием требований, so that FR/DESIGN опираются на уже выбранный стек, а не пишутся в вакууме.

**Why:** без зафиксированного стека FR/DESIGN формулируются абстрактно; Phase 1.75 между Project Context и Requirements закрывает разрыв "что нужно" → "на чём строим".

**Independent Test:** создать тестовую greenfield-спеку → убедиться что Phase 1.75 запускается между Phase 1.5 и Phase 2 → STOP #1.75 (`spec-status.ts -ConfirmStop Architecture`) проходит. Covers @feature5, @feature6, @feature7, @feature9.

**Acceptance Scenarios:**

Given greenfield-спека прошла Phase 1.5 Project Context
When create-spec доходит до Phase 1.75
Then skill вызывается командой enumerate, затем loop next-axis по каждой оси, затем STOP #1.75

Given спека с .progress.json version < 4
When create-spec доходит до Phase 1.75
Then фаза пропускается no-op (migration guard)

---

### User Story 4: Subskill follows existing child-skill pattern (Priority: P2)

As a dev-pomogator maintainer, I want чтобы subskill следовал паттерну существующих child-skills (mirror variant-matrix-build), so that installer/updater обрабатывают его единообразно без рассинхрона.

**Why:** рассинхрон манифеста = skill не установится у пользователей (dev-pomogator шипится через npx); единый паттерн исключает класс багов.

**Independent Test:** `extension.json` содержит skills/skillFiles/ruleFiles/toolFiles записи для нового skill; `extension-layout-validate.ts` exit 0; installer test CORE003_RULES динамически покрывает 2 новых rule. Covers @feature10, @feature11.

**Acceptance Scenarios:**

Given subskill создан в .claude/skills/architecture-decision-builder/
When запускаю extension-layout-validate.ts
Then exit 0 — rules/skills в правильных .claude/ путях, не в extensions/{ext}/

Given 2 новых rule добавлены в extension.json ruleFiles
When запускается installer test CORE003_RULES
Then оба rule установлены и проверены динамически без хардкода
