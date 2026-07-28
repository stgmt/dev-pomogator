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


### User Story 6: Verify shipped skill health before distribution (Priority: P1)

As a plugin maintainer, I want one dependency-free checker to assess shipped skills in source CI, release gating, and an installed dependency-absent tree, so a green source checkout cannot hide an installed-user failure.

**Why:** Existing optimizer scripts rely on `tsx` and `yaml`, while the shipped checker must prove the real installed plugin can run without repository dependencies.

**Требование:** [FR-12](FR.md#fr-12-shipped-dependency-free-checker-and-shared-gates)

**Independent Test:** Run `node tools/skill-health/check.mjs --strict --json` in source CI and then from an installed plugin copy after dependencies are unavailable.

**Acceptance Scenarios:**

Given the canonical `tools/skill-health/check.mjs` executable
When source CI, release, and dependency-absent installed verification run
Then all three invoke that same executable and the installed run resolves only Node built-ins

---

### User Story 7: Trust actionable skill diagnostics without noisy permission matches (Priority: P1)

As a skill author, I want malformed metadata, genuine active permission gaps, and unsafe local references identified precisely without prose examples blocking me, so strict CI is trustworthy.

**Why:** The flexible parser currently converts YAML failures into empty metadata and the older region detector mistakes prohibitions for tool calls.

**Требование:** [FR-13](FR.md#fr-13-strict-frontmatter-parser-and-metadata-contract)

**Independent Test:** Run the checker against fixtures for malformed frontmatter, active `Skill(...)`, `Agent(...)`, and MCP calls, negated prose, bare prose, generic examples, missing references, and root escapes.

**Acceptance Scenarios:**

Given a malformed or incomplete SKILL.md
When the checker parses it
Then a structural or required-field finding identifies the file and line

Given genuine active calls and non-executing prose examples
When strict permission checking runs
Then only the genuine missing permission findings block

Given static local links to a present target, missing target, and root escape
When reference validation runs
Then the present target passes and the two invalid links report distinct deterministic findings

---

### User Story 8: Govern known debt and mirrors explicitly (Priority: P2)

As a release owner, I want exact fingerprint baselines and named mirror policies with reproducible reports, so no broad exemption or silent mirror drift can conceal new debt.

**Why:** A broad baseline hides unrelated defects and an implicit mirror convention makes cross-agent copies unreviewable.

**Требование:** [FR-16](FR.md#fr-16-deterministic-report-and-strict-modes)

**Independent Test:** Compare repeat text and JSON output, mutate a fingerprinted file, submit a wildcard baseline, and evaluate exact, adapted, canonical-only, and legacy mirror fixtures.

**Acceptance Scenarios:**

Given a baseline with one exact finding identity
When the file fingerprint changes or a wildcard entry is used
Then the changed finding blocks and the broad entry is rejected

Given every supported mirror policy
When the mirror contract is evaluated
Then each policy has deterministic behavior and drift identifies both paths

---

### User Story 9: Keep skill health outside prompt lifecycle hooks (Priority: P1)

As an interactive Claude Code user, I want skill health checked at deliberate gates rather than every prompt, so authoring remains responsive and does not gain surprise enforcement.

**Why:** Source/release boundaries provide enforceable evidence without adding prompt latency or hook noise.

**Требование:** [FR-19](FR.md#fr-19-no-prompt-lifecycle-hook-rollout)

**Independent Test:** Inspect hook registrations and settings while exercising explicit checker gates.

**Acceptance Scenarios:**

Given plugin hook and settings configuration
When skill-health wiring is inspected
Then no SessionStart or UserPromptSubmit entry invokes the checker

---

### User Story 10: Detect active tool permission gaps precisely (Priority: P1)

As a skill author, I want the checker to distinguish active Skill, Agent, and MCP calls from prose, so I can fix real permissions without strict CI false positives.

**Why:** The code-region detector currently mistakes prohibitions for invocations.

**Требование:** [FR-14](FR.md#fr-14-active-tool-permission-coverage-with-false-positive-pins)

**Independent Test:** Check fixtures containing exact active calls, never-raw-Write prose, bare prose, and generic examples.

**Acceptance Scenarios:**

Given active calls missing exact permissions and prose-only mentions
When strict permission checking runs
Then only the active missing permissions block

---

### User Story 11: Keep shipped local references contained (Priority: P1)

As a skill author, I want static local links checked within the plugin root, so a shipped skill cannot hide a missing target or filesystem escape.

**Why:** Broken or escaping references make an installed skill non-portable.

**Требование:** [FR-15](FR.md#fr-15-local-reference-integrity-and-root-containment)

**Independent Test:** Check present, missing, and parent-traversal Markdown reference fixtures.

**Acceptance Scenarios:**

Given static present, missing, and escaping local links
When reference validation runs
Then the checker reports only the missing and escaping targets

---

### User Story 12: Baseline only the exact known finding (Priority: P2)

As a release owner, I want every baseline exemption tied to exact content, so changed or unrelated defects remain visible.

**Why:** A broad exemption can hide future regressions.

**Требование:** [FR-17](FR.md#fr-17-exact-fingerprint-baseline)

**Independent Test:** Mutate a fingerprinted file and submit a wildcard exemption.

**Acceptance Scenarios:**

Given an exact baseline entry and a changed matching file
When strict mode runs
Then the changed finding blocks and a wildcard entry is rejected

---

### User Story 13: Declare every mirror relationship intentionally (Priority: P2)

As a release owner, I want a finite explicit mirror policy, so canonical and cross-agent skill copies cannot silently drift.

**Why:** Directory-name inference makes policy and adaptations opaque.

**Требование:** [FR-18](FR.md#fr-18-explicit-mirror-policy)

**Independent Test:** Evaluate exact, adapted, canonical-only, and legacy mirror fixtures.

**Acceptance Scenarios:**

Given all supported mirror policy modes
When the checker evaluates the mirror contract
Then drift and policy errors identify the affected paths deterministically
