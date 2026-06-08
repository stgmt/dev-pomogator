---
name: spec-review
description: |
  Семантическое pre-stop ревью спеки/кода через 15 категорий (10 spec-time + 3 post-implementation + 2 cross-cutting): external claims, antipatterns, assumption-vs-requirement, memory-constraint compliance, reality-drift и др. Используй ПЕРЕД каждым ConfirmStop в specs-management workflow И после каждой implementation phase. Триггеры — "сам ревью", "проверь спеку", "ревью перед стопом", "review phase N", "spec-review", "pre-stop check". Skip when — spec не существует, активной фазы нет в .progress.json, или пользователь явно отказался.
license: Apache 2.0
allowed-tools:
  - "mcp__dev-pomogator-specs__read_spec_doc"
  - "mcp__dev-pomogator-specs__list_spec_docs"
  - "mcp__dev-pomogator-specs__get_node"
  - "mcp__dev-pomogator-specs__search"
  - "Read"
  - "Grep"
  - "Glob"
  - "Bash(bash:*)"
  - "Bash(grep:*)"
  - "WebFetch"
  - "Edit"
  - "Agent"
  - "Skill"
---

# spec-review — Semantic pre-stop review

Дополняет (не заменяет) `audit-spec.ts` структурный аудит: ловит семантические ошибки, которые валидатор пропускает. Запускается перед каждым `ConfirmStop` в `create-spec` workflow и после каждой implementation phase.

**15 категорий** = 10 spec-time + 3 post-implementation + 2 cross-cutting (категория 14 — memory-constraints; категория 15 — reality-drift). Каждая категория имеет фиксированный severity (P0..P3), grep patterns и remediation. Детали — в `references/categories.md`.

## Когда запускается

| Trigger | Phase | Действие |
|---------|-------|----------|
| Перед `spec-status.ts -ConfirmStop Discovery` | end of Phase 1 | категории 1, 2, 4, 5, 6, 10, **14**, **15** |
| Перед `spec-status.ts -ConfirmStop Requirements` | end of Phase 2 | + 3, 7, 8, 9, 12, 13 (категории **14**, **15** runs every phase) |
| Перед `spec-status.ts -ConfirmStop Finalization` | end of Phase 3 | все 10 spec-time + **14** + **15** |
| После implementation phase (commit candidate) | post-impl | + 11, 12, 13 (spec ↔ code drift) + **14** + **15** на committed code |
| Manual: "проверь спеку" / "spec-review" | any | определить currentPhase из `.progress.json` + **14**, **15** always |

Skip когда:

- Spec не существует (`.specs/{slug}/.progress.json` отсутствует) → exit с сообщением
- `.progress.json.currentPhase` отсутствует или `null` → exit
- Пользователь явно сказал "не надо ревью" в текущей сессии

## 15 категорий (severity matrix)

| # | Category | Severity | Method | Phase scope |
|---|----------|----------|--------|-------------|
| 1 | External-API claim verify | P0 | `WebFetch` official docs | Phase 1+ |
| 2 | Existing-asset duplicate | P0 | `Grep` package.json/csproj/appsettings/DI registrations | Phase 1+ |
| 3 | Antipattern guardrails | P1 | `Grep` `.claude/rules/antipatterns/*.md` triggers | Phase 2+ |
| 4 | Assumption-vs-Requirement | P1 | Cross-reference FR/UC vs Extracted Requirements | Phase 1+ |
| 5 | Open Questions stale | P1 | RESEARCH.md `## Open Questions` checked/migrated | Phase 1 (before ConfirmStop) |
| 6 | @featureN cross-file consistency | P0 | multi-grep across USER_STORIES/USE_CASES/FR/AC/.feature | Phase 2+ |
| 7 | Tooling mismatch | P1 | PowerShell-grammar в bash; `dotnet test` vs `/run-tests`; raw find/grep/cat в TASKS | Phase 2+ |
| 8 | Plan-gate template compliance | P1 | diff против `tools/plan-pomogator/template.md` | Phase 2 (если есть план) |
| 9 | BDD Test Infrastructure → Phase 0 | P0 | DESIGN.classification == TEST_DATA_ACTIVE → TASKS Phase 0 + FILE_CHANGES | Phase 2+ |
| 10 | Hallucination/fluff smell | P2 | paragraphs >5 sentences без code/table refs; "fast/stable" без чисел | any |
| 11 | Spec ↔ code drift | P1 | spec говорит "X via ServiceA" — реально ServiceB | post-impl only |
| 12 | Cross-namespace name collision | P0 | new enum/class collides с NuGet using | post-impl + Phase 2 design review |
| 13 | JWT claim / config key consistency | P2 | `FindFirst("UserId")` vs `ClaimTypes.NameIdentifier` | post-impl |
| 14 | Memory-constraint compliance (dynamic) | P0/P1 | scan `~/.claude/projects/{encoded-cwd}/memory/feedback_*.md` → extract forbidden-literal patterns → grep spec body | any |
| 15 | Reality drift (spec ↔ repo state) | P0/P1/P2 | invoke `Skill("spec-reality-check")` → aggregate findings, map ERROR→P0 / WARNING→P1 / INFO→P2 | any phase + post-impl |

Подробные patterns + grep recipes — в [`references/categories.md`](references/categories.md). Antipattern triggers (категория #3) — в [`references/antipattern-triggers.md`](references/antipattern-triggers.md). Lessons learned (15 case studies) — в [`references/lessons-learned.md`](references/lessons-learned.md). Memory-constraint extraction protocol — в [`references/category-14-memory-constraints.md`](references/category-14-memory-constraints.md). Reality-drift category-15 protocol — в [`references/category-15-reality-drift.md`](references/category-15-reality-drift.md).

## Category 14: Memory-aware constraint compliance (NEW)

Triggers when project memory dir `~/.claude/projects/{encoded-cwd}/memory/` contains `feedback_*.md` files. For each such file, extract:

1. **Forbidden literals** — phrases in backticks following words like "literal", "literals", "hardcoded", "must not appear", "禁止". Example: feedback file says ``literal `stgmt/dev-pomogator` `` → forbidden literal = `stgmt/dev-pomogator`.
2. **Required patterns** — phrases following "must use", "MUST", "обязан", "always", "from now on". Example: "env file MUST be created before asking" → required pattern (semantic, not always grep-able).
3. **Severity** — P0 if memory uses "MUST" / "obязан" / "никогда не" / strong negatives; P1 otherwise.

For each forbidden literal — scan the spec through the MCP read door (MCP-rails
FR-39 — never a raw `grep -r` of `.specs/`): `list_spec_docs({ spec: "{slug}" })`,
then `read_spec_doc` each doc and substring-match the literal in the returned
content. Any match → finding with severity from above; link the source memory
file in the finding's `Notes` column.
> ⚠️ **Coverage note (conscious narrowing):** `list_spec_docs` enumerates
> `*.md` + `*.feature` + `.progress.json` only — the old recursive `grep` also
> scanned `.yaml`/`.json` spec artifacts (e.g. `consistency-report.yaml`). A
> forbidden literal hardcoded in such an artifact is no longer caught by this
> step; that check belongs engine-side (the reconcile/audit CLIs), not in an
> agent grep. Do not silently treat md/feature coverage as total.

For required patterns — semantic check (read FR/DESIGN to see if pattern present). Harder to automate; emit as P2 "review hint" if uncertain.

Example output finding:

```
| 14-1 | Memory: no-hardcoded-repo | RESEARCH.md:184 | Forbidden literal `npx github:stgmt/dev-pomogator` found in mitigation text; violates `feedback_no-hardcoded-repo-or-user-identifiers.md` | P0 | Replace with generic `npx github:<owner>/<repo>` placeholder or remove fallback entirely |
```

Phase scope: runs at ANY phase if memory dir non-empty. Specifically intended for "lessons learned in this project" enforcement at spec generation time, not just code review.

## Severity rules

| Severity | Action | Examples |
|----------|--------|----------|
| **P0** | БЛОКЕР до закрытия фазы. ОБЯЗАН быть исправлен до `ConfirmStop`. | external fact wrong, name collision, @featureN broken, hooks absent в Phase 0 |
| **P1** | Fix BEFORE Stop, но user может явно override через `[skip-spec-review: <reason>]` маркер в спеке. | antipattern violation, tooling mismatch, spec drift, template incompliance |
| **P2** | Recommendation — записать в REVIEW_NOTES, но не блокировать. | stylistic, brevity, minor inconsistency |
| **P3** | Log only — fragile string matches типа SQL state codes ("23505"). | edge cases где false-positive высок |

## Workflow

### Step 1: Detect spec & phase

```bash
# Найди .specs/{slug}/.progress.json (последняя modified)
ls -t .specs/*/.progress.json | head -1
```

Прочти `.progress.json` → `currentPhase` определяет scope категорий (см. таблицу выше). Если файла нет → завершить с "spec не найдена, нечего ревьюить".

### Step 2: Read spec files

Spec-time review (категории 1-10): прочитать релевантные spec файлы:

- USER_STORIES.md, USE_CASES.md, RESEARCH.md (Phase 1+)
- FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, REQUIREMENTS.md (Phase 2+)
- DESIGN.md, FILE_CHANGES.md, FIXTURES.md, `*_SCHEMA.md` (Phase 2+)
- TASKS.md, `{slug}.feature` (Phase 3+)

Post-implementation review (+ категории 11-13): дополнительно прочитать изменённые файлы из `git diff --name-only HEAD~1..HEAD` или из staged area.

### Step 3: Run categories

**Параллельно через Agent(Explore subagent)** — категории с дорогими операциями (multiple WebFetch / wide grep):

- Category 1 (External-API claim verify) — может потребовать 5-15 WebFetch
- Category 2 (Existing-asset duplicate) — wide grep по package.json/csproj/appsettings*/DI files
- Category 6 (@featureN consistency) — multi-grep по 4-6 spec файлам

Использование Agent: `Agent("Explore", task="run spec-review category {1|2|6} on .specs/{slug}/, return findings as table per references/categories.md format")`.

**Локально (без Agent)** — быстрые категории:

- 3 (Antipattern guardrails) — grep по `.claude/rules/antipatterns/*.md` если существует, иначе skip
- 4 (Assumption-vs-Requirement) — diff Extracted Requirements плана vs FR/UC
- 5 (Open Questions stale) — grep `^- \[ \]` в `## Open Questions` секции RESEARCH.md
- 7 (Tooling mismatch) — grep PowerShell glyphs в bash blocks; raw test commands
- 8 (Plan-gate template compliance) — diff vs template, если plan-файл существует
- 9 (BDD Test Infrastructure) — read DESIGN.md classification → check TASKS Phase 0 hooks
- 10 (Hallucination/fluff smell) — paragraph length / vague metrics scan
- 11, 12, 13 (post-impl) — git-diff aware grep

### Step 4: Collect REVIEW_NOTES.md

Записать в `.specs/{slug}/REVIEW_NOTES.md` (overwrite существующий):

```markdown
# Spec Review: {slug}

**Phase:** {currentPhase}
**Generated:** {ISO timestamp}
**Scope:** {list of category numbers checked}

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | N | ⚠️ STOP / ✅ clear |
| P1 (fix before stop) | N | ⚠️ review / ✅ clear |
| P2 (recommendations) | N | ℹ️ logged |
| P3 (informational) | N | ℹ️ logged |

**Overall verdict:** STOP_BLOCKED / READY_WITH_WARNINGS / READY

## P0 Findings

| # | Category | Location | Issue | Required fix |
|---|----------|----------|-------|--------------|
| ... | | | | |

## P1 Findings

| # | Category | Location | Issue | Suggested fix |
|---|----------|----------|-------|---------------|
| ... | | | | |

## P2 / P3 Findings

| # | Category | Location | Note |
|---|----------|----------|------|
| ... | | | |

## Auto-fix patches

(Optional. Edit-tool old/new pairs для тривиальных fixes — например, унификация терминологии или замена raw test command на /run-tests.)

### Patch 1: {description}

**File:** `{path}`

**old_string:**
\`\`\`
...
\`\`\`

**new_string:**
\`\`\`
...
\`\`\`
```

### Step 5: Decide flow

| Result | Action |
|--------|--------|
| P0 > 0 | **STOP** — print summary, demand fix перед `ConfirmStop`. Не вызывать `spec-status.ts -ConfirmStop`. |
| P0 == 0 && P1 > 0 | List P1 findings via AskUserQuestion-style summary в чате. Спросить "пропустить P1 как known-issues или fix сначала?". Если skip — добавить marker `[skip-spec-review-p1: <reason>]` в spec README.md. |
| P0 == 0 && P1 == 0 | Print compact summary, allow `ConfirmStop` flow. P2/P3 logged in REVIEW_NOTES.md только. |

## Output format в чате (после Step 4)

```
🔍 Spec Review: {slug} (Phase {N})

P0 (blockers):  {n} ⚠️ {short list / ✅ none}
P1 (warnings):  {n}
P2/P3 (info):   {n+m}

Verdict: STOP_BLOCKED / READY_WITH_WARNINGS / READY
Details: .specs/{slug}/REVIEW_NOTES.md
```

## Optional helper script

[`scripts/check_external_claims.py`](scripts/check_external_claims.py) — batch WebFetch helper для категории #1. Принимает список URL-claim пар, fetches каждый, ищет цитату в HTML/text. Использовать когда категория #1 имеет 5+ external claims (manual WebFetch tedious).

## Anti-patterns (что spec-review НЕ делает)

- НЕ переписывает спеку — только указывает на findings + опциональные Edit patches
- НЕ запускает `audit-spec.ts` — это делает create-spec workflow Phase 3+ отдельно
- НЕ модифицирует `.progress.json` — это делает `spec-status.ts`
- НЕ блокирует на P2/P3 — только P0 (всегда) и P1 (если user не override)
- НЕ генерирует findings для категорий вне currentPhase scope (см. таблицу Step 1)

## Cross-references

- `create-spec` SKILL.md cross-link: «before each STOP, run `Skill("spec-review")` for semantic check»
- Структурный аудит: `tools/specs-generator/audit-spec.ts` — Phase 3+ автоматический, дополняет spec-review
- Antipattern rules: `.claude/rules/antipatterns/*.md` (если существуют в target проекте) — источник triggers для категории #3
- Plan template: `tools/plan-pomogator/template.md` — source-of-truth для категории #8
- Lessons learned: [`references/lessons-learned.md`](references/lessons-learned.md) — 15 case studies из реальных PR sessions
