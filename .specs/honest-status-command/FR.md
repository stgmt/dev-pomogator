# Functional Requirements (FR)

## FR-1: Invocation Surface

Skill `spec-status` ОБЯЗАН быть invoke-able через два способа: (a) explicit slash command `/spec-status [slug]` пользователем; (b) `Skill("spec-status")` главным AI proactively перед claims о завершении задачи. Frontmatter description содержит explicit trigger keywords чтобы AI вызывал proactively после implementation phase ("before claiming done", "honest status check").

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path), [UC-2](USE_CASES.md#uc-2-user-explicitly-requests-spec-status)
**User Story:** [US-1](USER_STORIES.md), [US-2](USER_STORIES.md)

## FR-2: Active Spec Auto-Detection

При вызове без аргументов skill ОБЯЗАН автодетектить активную спеку через heuristic: (a) самый свежий `.progress.json` в `.specs/*/` по mtime (не старше 7 дней); (b) tie-break по overlap с plan path в `~/.claude/plans/` (slug match); (c) tie-break по git modified files scope. Если ни одного active spec — вывести помощь `Pass slug explicitly: /spec-status <slug>` и exit 0 (no error).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path)
**User Story:** [US-2](USER_STORIES.md)

## FR-3: Sub-Agent Delegation

Skill ОБЯЗАН делегировать verification logic в `Agent(subagent_type=general-purpose)` с context bundle. Context bundle ≤4KB JSON содержит: `{spec_slug, spec_path, plan_path?, test_paths[], ac_ids[], commit_sha}`. Sub-agent сам читает большие файлы через свой Read tool — main AI context остаётся compact. Запрещено выполнять verification logic в main AI (обходит цель US-1 = elimination of goal-completion bias).

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path)
**User Story:** [US-1](USER_STORIES.md)

## FR-4: AC Evidence Classification

Sub-agent ОБЯЗАН классифицировать каждый AC из ACCEPTANCE_CRITERIA.md в одну из 3 категорий с evidence:

- `✓ verified` — AC body matches actual artifact (test file:line OR command output OR file content); evidence path обязателен
- `⏸ blocked` — AC требует verification но blocked environmental (Docker down, WSL hang, network, missing dep); reason обязателен
- `❌ claimed-only` — AC marked done в TASKS.md но no evidence file/test/commit найден

Запрещено помечать AC `✓` без evidence path.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path), [UC-2](USE_CASES.md#uc-2-user-explicitly-requests-spec-status)
**User Story:** [US-1](USER_STORIES.md)

## FR-5: Test Results Recency Audit

Sub-agent ОБЯЗАН читать `.dev-pomogator/.test-status/status.<prefix>.yaml` (latest by mtime) и классифицировать состояние тестов: (a) `fresh` — passed/failed counts с mtime <5 min; (b) `stale` — `state: running` но mtime ≥5 min (heartbeat dead, process likely environmental hang); (c) `not_run` — no YAML found (tests never executed for this scope). Output содержит test counts + mtime age + classification.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-environmental-block-detected-during-status-check)
**User Story:** [US-4](USER_STORIES.md)

## FR-6: Test Body Quality Classification

Sub-agent ОБЯЗАН применять test quality checklist (reuse patterns из `.claude/skills/strong-tests/SKILL.md` и `.claude/skills/tests-create-update/SKILL.md`) для каждого test file в scope спеки. Каждый `it()` block classified: `STRONG` / `WEAK` / `FAKE-POSITIVE-RISK` с specific reason (line number + concern). Patterns to detect:

- WEAK: only `toBeDefined()` / `toBeTruthy()` без value-level assertion
- WEAK: missing edge cases (no boundary, null, error scenarios)
- FAKE-POSITIVE-RISK: `vi.mock()` для critical production paths
- FAKE-POSITIVE-RISK: tests `expect(true).toBe(true)` или similar tautology
- STRONG: `toEqual()` / `toMatchObject()` с full expected structure
- STRONG: integration tests без mocks for production paths

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-sub-agent-flags-weak-tests-fake-positive-risk)
**User Story:** [US-3](USER_STORIES.md)

## FR-7: Git Working State Cross-Reference

Skill (parent OR sub-agent) ОБЯЗАН выполнять `git status --short` + `git log origin/main..HEAD --oneline` и классифицировать modified/staged/pushed файлы по их overlap с scope текущей спеки (paths в `.specs/{slug}/`, `extensions/`, `src/`, `tests/` упомянутые в FILE_CHANGES.md). Output: counts (X modified, Y staged, Z committed, W pushed).

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path)
**User Story:** [US-2](USER_STORIES.md)

## FR-8: Environmental Blockers Section

Output ОБЯЗАН содержать отдельную секцию `## Environmental Blockers` отдельно от test failures. Section listed если detected: (a) `docker ps` returned non-zero OR error message containing "connection"; (b) WSL connection failure (Windows-specific check); (c) `.test-status` YAML stale heartbeat (FR-5 staleness condition); (d) network reachability fail (если spec requires external services). Empty section omitted from output.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-3](USE_CASES.md#uc-3-environmental-block-detected-during-status-check)
**User Story:** [US-4](USER_STORIES.md)

## FR-9: Output Format — Structured JSON + Markdown Render

Sub-agent ОБЯЗАН возвращать structured JSON (schema в `honest-status-command_SCHEMA.md`) с полями `{spec, phase, ac: {verified, blocked, claimed}, tests: {results, quality}, git, environmental_blockers}`. Skill ОБЯЗАН render JSON в human-readable markdown report для main AI / user (sections: Spec Progress / AC Status / Tests / Git / Environmental Blockers). Оба формата — JSON для programmatic consumption, markdown для human review.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path)
**User Story:** [US-1](USER_STORIES.md)

## FR-10: Reuse spec-status.ts Wrapper

Skill ОБЯЗАН wrap (не replace) existing `.dev-pomogator/tools/specs-generator/spec-status.ts` для базовой progress info (.progress.json read, phases summary). New value-add от spec-status skill = sub-agent delegation + AC evidence audit + test body quality audit + environmental blockers detection. Существующий spec-status.ts код не модифицируется.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-checks-current-spec-status-before-claiming-done-happy-path)
**User Story:** [US-2](USER_STORIES.md)
