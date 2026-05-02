# Fixtures

## Overview

Все фикстуры — static SKILL.md файлы под `tests/fixtures/skills-rules-optimizer/`. Read-only, без teardown (no state mutation, no DB, no API). Lifecycle — global (один раз создаётся в repo, переиспользуется во всех scenarios). Per-scenario hooks не нужны (см. DESIGN.md "BDD Test Infrastructure: TEST_DATA_NONE").

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | valid-skill | static | `tests/fixtures/skills-rules-optimizer/valid-skill/SKILL.md` | global | (none — read-only) |
| F-2 | claude-in-name | static | `tests/fixtures/skills-rules-optimizer/claude-in-name/SKILL.md` | global | (none) |
| F-3 | missing-allowed-tools | static | `tests/fixtures/skills-rules-optimizer/missing-allowed-tools/SKILL.md` | global | (none) |
| F-4 | oversize-skill | static | `tests/fixtures/skills-rules-optimizer/oversize-skill/SKILL.md` | global | (none) |
| F-5 | transitive-references | static (3 files) | `tests/fixtures/skills-rules-optimizer/transitive-references/{SKILL.md,references/A.md,references/B.md}` | global | (none) |
| F-6 | overlap-pair | static (2 files) | `tests/fixtures/skills-rules-optimizer/overlap-pair/{a,b}/SKILL.md` | global | (none) |

## Fixture Details

### F-1: valid-skill

- **Type:** static file
- **Format:** Markdown с YAML frontmatter (`name`, `description`, `allowed-tools`)
- **Setup:** copied to repo при создании fixture; SKILL.md ~80 lines с valid frontmatter и body использующим только tools declared в `allowed-tools`
- **Teardown:** none (read-only)
- **Dependencies:** none
- **Used by:** @feature1 (positive baseline для audit)
- **Assumptions:** None — self-contained, не require external resources

### F-2: claude-in-name

- **Type:** static file
- **Format:** Markdown с YAML frontmatter where `name: "Claude Helper"` (forbidden token "claude" present)
- **Setup:** copied to repo
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature2 (FR-2 forbidden token detection)
- **Assumptions:** Audit-skills.ts checks `name` against `["claude", "anthropic"]` regex case-insensitive

### F-3: missing-allowed-tools

- **Type:** static file
- **Format:** Markdown с frontmatter `allowed-tools: Read, Write` и body содержит `Bash` and `Skill("research-workflow")` invocations (3 missing tools)
- **Setup:** copied to repo
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature3 (FR-3 coverage check)
- **Assumptions:** Audit-skills.ts regex matches tool keywords в body

### F-4: oversize-skill

- **Type:** static file
- **Format:** Markdown SKILL.md ~600 lines (lorem-ipsum padding в Steps section); valid frontmatter; valid allowed-tools coverage
- **Setup:** copied to repo
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature9 (FR-2 oversize warning) — note: scenario не explicit в .feature но covered в audit unit tests
- **Assumptions:** Anthropic 500-line cap is checked

### F-5: transitive-references

- **Type:** static file group (3 files)
- **Format:**
  - `SKILL.md` — references `references/A.md`
  - `references/A.md` — references `references/B.md` (depth-2 link → violates Anthropic one-level-deep)
  - `references/B.md` — leaf node, no further references
- **Setup:** all 3 files copied to repo
- **Teardown:** none
- **Dependencies:** Internal — A.md depends on B.md existing (file-system, not test state)
- **Used by:** Audit unit tests for transitive-references antipattern (UC-5)
- **Assumptions:** Audit walks reference chain via regex `references/\S+\.md`

### F-6: overlap-pair

- **Type:** static file group (2 files)
- **Format:**
  - `overlap-pair/a/SKILL.md` — frontmatter `description` содержит triggers `"test runner"`, `"vitest"`, `"pytest"`
  - `overlap-pair/b/SKILL.md` — frontmatter `description` содержит triggers `"test runner"`, `"vitest"`, `"jest"` (4-token Jaccard ≈ 0.5 — выше threshold 0.3)
- **Setup:** both files copied
- **Teardown:** none
- **Dependencies:** none
- **Used by:** @feature4, @feature5 (FR-4 detection, FR-5 merge envelope)
- **Assumptions:** Jaccard threshold 0.3; trigger extraction regex `/"([^"]+)"/g`

## Dependencies Graph

Все фикстуры независимы (static, нет cross-references между fixtures).

```
F-1 (standalone)
F-2 (standalone)
F-3 (standalone)
F-4 (standalone)
F-5 (internal: SKILL → A → B; не cross-fixture)
F-6 (internal: a + b parallel, не depend on each other)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | SRO002_audit_skills_emits_structured_json | F-1 (positive baseline) | none |
| @feature2 | SRO003_frontmatter_name_forbidden_token | F-2 | none |
| @feature3 | SRO004_allowed_tools_missing_skill_token | F-3 | none |
| @feature4 | SRO005_triple_axis_jaccard_overlap_detected | F-6 (a+b pair) | none |
| @feature5 | SRO006_merge_emits_invoke_agent_envelope | F-6 (a+b reused) | none |
| @feature6 | SRO007_ratchet_revert_on_regression | (mock data inline в test, no fixture) | none — test composes invalid SKILL.md draft inline |
| @feature7 | SRO008_originals_preserved_after_successful_merge | F-6 (a+b reused) | none |
| @feature8 | SRO009_rules_audit_byte_identical_after_rename | (existing rules fixtures + baseline JSON snapshot) | Baseline snapshot must be captured ДО rename — added к Phase 2 task as guard |

## Notes

- **No teardown** — read-only fixtures; tests don't mutate files
- **Lorem padding в F-4** — 500+ lines генерится один раз через `lorem-ipsum` package при создании fixture; стабильный (детерминированный seed)
- **F-6 overlap calibration** — Jaccard score между a/b ≈ 0.5; если threshold увеличится до 0.6 в будущем, нужно будет добавить F-7 с higher overlap (e.g. 0.7); сейчас 0.5 > 0.3 default — safe margin
- **No Docker, no DB, no API** — все fixtures static; tests run host (через wrapper per `run-tests/SKILL.md` Step 3.6 host-bypass mode)
