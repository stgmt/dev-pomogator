# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Detect overlapping skills automatically (Priority: P1)

As a maintainer репозитория с 30+ skills, я хочу автоматически детектировать overlapping skills (по trigger phrases / sections / functional output), чтобы консолидировать knowledge без чтения всех SKILL.md вручную.

**Why:** В этой сессии я (Claude) создал skill `variant-matrix-build` с workflow которое описывает interactive flow ("собрать с пользователя список вариантов"), но `allowed-tools` не содержал `AskUserQuestion`. Никакая automation не сработала — поймал только когда user прямо спросил "артефакты проврил?". Cross-skill overlap имеет аналогичную dynamic: existing skills могут дублировать workflow без явного признака.

**Independent Test:** Запустить `npx tsx audit.ts --dir .claude/skills` на реальном repo с 23 skills. Expect: JSON output с overlap candidates (pairs где Jaccard score ≥0.3 на любой axis), не падает на skill без description, обрабатывает RU+EN trigger phrases.

**Acceptance Scenarios:**

Given в `.claude/skills/` существуют 2 skills с overlapping trigger phrases (Jaccard ≥0.3)
When запустить `audit.ts --dir .claude/skills`
Then output JSON содержит `overlaps[]` со записью `{a, b, axis: "trigger", similarity, recommendation}`

Given skills с разными missions и нет overlap (similarity <0.3)
When запустить audit
Then `overlaps` массив пуст, no false positives

---

### User Story 2: Block skill creation with incomplete allowed-tools (Priority: P1)

As Claude (агент), я хочу быть остановлен ДО создания skill с incomplete `allowed-tools`, чтобы избежать runtime errors при вызове недокларированных tools.

**Why:** Существующий rule `skill-allowed-tools-audit.md` — manual checklist, polагается на agent дисциплину. В этой сессии я нарушил его сам — создал `variant-matrix-build` без `AskUserQuestion`, хотя SKILL.md описывает Step 2 "собрать с пользователя список вариантов". Automation сработала бы немедленно при Write/Edit SKILL.md.

**Independent Test:** Создать SKILL.md с `allowed-tools: Read, Write` в frontmatter и body содержащим `Skill("research-workflow")` invocation. Запустить `audit-skills.ts --dir .claude/skills/<name>`. Expect: error finding `allowed-tools missing: Skill`.

**Acceptance Scenarios:**

Given SKILL.md с frontmatter `allowed-tools: Read, Write` и body содержит `Bash`, `Skill(...)`, `Agent(...)` invocations
When run audit-skills.ts
Then output `withErrors[]` содержит entry `{path, error: "allowed-tools missing: Bash, Skill, Agent"}`

Given SKILL.md где frontmatter exhaustively покрывает все used tools
When run audit
Then no allowed-tools errors

---

### User Story 3: Flag oversize SKILL.md per Anthropic 500-line cap (Priority: P2)

As maintainer, я хочу видеть SKILL.md превышающие 500 строк (Anthropic best-practice hard cap) с предложением вынести разделы в `references/`.

**Why:** Anthropic docs (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) явно рекомендует body ≤500 lines, warning >150 lines. SKILL.md с 700 строками деградирует discovery accuracy и token efficiency. Без automation maintainer не замечает growth до момента когда skill становится monolithic.

**Independent Test:** Создать SKILL.md на 600 строк (lorem-ipsum padding); запустить audit; expect warning `oversize: 600 lines (Anthropic cap: 500)` с suggestion `consider splitting domain-specific sections to references/`.

**Acceptance Scenarios:**

Given SKILL.md содержит 600 строк
When run audit-skills.ts
Then output `withWarnings[]` содержит `{path, warning: "oversize", lines: 600, suggestion: "split to references/"}`

Given SKILL.md ≤500 строк
When run audit
Then no oversize warning

---

### User Story 4: /suggest-rules Phase 6 covers skills + rules (Priority: P1)

As user `/suggest-rules`, я хочу что Phase 6 (auto-optimize) применяется и к новым skills, не только к rules — иначе skill-side findings (overlaps, oversize, missing allowed-tools) теряются между runs.

**Why:** Текущий `/suggest-rules` Phase 6.2 вызывает `audit.ts --dir .claude/rules`. Skill-side audit отсутствует, что нарушает symmetric coverage. После создания нового skill (как в этой сессии — variant-matrix-build) issues копятся silently.

**Independent Test:** Запустить `/suggest-rules`. Expect: Phase 6 report включает раздел "Skills audit" с found issues. Существующий rules audit работает без regression.

**Acceptance Scenarios:**

Given `/suggest-rules` инвокнут после Phase 5 file creation
When Phase 6 запускает audit
Then report содержит обе секции: `Rules findings: ...` и `Skills findings: ...`

Given audit-skills нашёл overlap candidates
When report генерится
Then findings включают recommendations типа "merge skill A + B → проверь через `merge-skills.ts --execute A B merged-name`"

---

### User Story 5: LLM merge synthesis без API key (Priority: P2)

As пользователь dev-pomogator, я хочу что LLM merge synthesis НЕ требует Anthropic API key — только Claude Code sub-agent через `Agent` tool.

**Why:** Repo dev-pomogator используется в team setting; не каждый maintainer имеет личный API key. Полагаться на API key для core optimization workflow создаёт friction. `Agent(subagent_type="general-purpose")` уже доступен в Claude Code — это zero-config LLM access.

**Independent Test:** Mock `Agent` tool response → run `merge-skills.ts --execute A B AB` → verify скрипт emit-ит JSON envelope `{action: "invoke-agent", subagent_type: "general-purpose", prompt: ...}` без single hint на Anthropic SDK / API key.

**Acceptance Scenarios:**

Given user с пустым ANTHROPIC_API_KEY env
When user запускает merge через skill workflow
Then merge succeed (sub-agent работает); no API key error

Given скрипты `merge-skills.ts` / `verify-merge.ts`
When grep по тексту `ANTHROPIC_API_KEY` или `import Anthropic`
Then 0 matches (zero direct API dependency)
