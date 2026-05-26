# When to Build Variant Matrix (specs-workflow)

Trigger map для `Skill("variant-matrix-build")` invocation в Phase 2 step 4c. Mirror structure `.claude/rules/scope-gate/when-to-verify.md`.

## Apply WHEN

Invoke skill (или audit category VARIANT_COVERAGE will block STOP #3) если FR в `.specs/{slug}/FR.md` matches ANY of:

- ≥2 polymorphic-trigger regex hits в одном FR section. Triggers — closed list quantifier+axis combinations:
  - EN: `for each|for every|every|across all|all|any|per[-\s]|by[-\s]` + axis noun (doctype, type, kind, variant, provider, adapter, tenant, locale, channel, method, role, version, backend, driver) + `s?`.
  - EN reuse language: `shared (validation|pipeline|handler|...)`, `polymorphic dispatch`, `enum dispatch`, `applies to (all|every|each)`, `same (behavior|logic|rule) for`.
  - RU: `для каждого|для всех|всё|по каждому|на` + `(доктайп|тип|вариант|провайдер|адаптер|тенант|локал|канал|метод|роль|верси|бэкенд|драйвер)` + word ending.
  - RU reuse language: `переиспользуем`, `общая (валидация|обработчик|...)`, `полиморфн* диспатч`, `в зависимости от`.
- 1 hit + axis enumeration signal (markdown table или bullet list с ≥2 рядами enumerating variant axis в same FR section в течение 30 lines).
- Hook detection module `extensions/specs-workflow/tools/specs-generator/variant-matrix/trigger-phrases.ts` returns `{hardOut: false, triggers.length >= 2}`.

## Do NOT apply (hard-OUT signals)

These patterns prevent skill invocation — hardOut takes priority over trigger count. Mitigation H1 risk (`feedback_single-incident-rules-over-generalize.md`):

- FR explicitly says "только/single/specific/единственн{ое,ый}/конкретн{ый,ое}" в same paragraph как polymorphic phrase — phrase используется чтобы scope OUT, не IN.
- FR содержит `> OUT OF SCOPE` blockquote anywhere в body.
- Variant axis уже enumerated в same FR section: markdown table с ≥2 rows ИЛИ bullet list где каждая строка starts с axis prefix (`- doctype X:`, `- doctype Y:`).
- `[OUT_OF_SCOPE: <reason ≥8 chars>]` marker внутри FR section.
- Quantifier появляется ТОЛЬКО внутри fenced code block (` ``` `) — это example code, не requirement text. Code blocks стрипаются перед matching.
- File is `NFR.md` — non-functional requirements имеют свою coverage discipline.
- 1 trigger hit total (без axis enumeration signal) — недостаточно evidence для polymorphic dispatch claim.

## Why hard-OUT list exists

**Prevents H1 regression** (`feedback_single-incident-rules-over-generalize.md`): over-applying prevention rule на cases для которых не designed — это та же failure mode которая motivated этот gate. Если каждый multi-variant FR triggers matrix build, agent будет game escape hatch чтобы bypass — defeating gate.

**Decision heuristic:** если не уверен trigger-нет ли skill — check audit category VARIANT_COVERAGE output. Если audit не emit findings, matrix build не нужен. Если audit emits `AC_DECISION_TABLE_MISSING` — invoke skill.

## Escape hatch vs. skill invocation

Когда оба варианта доступны:

- **Prefer skill** для genuine polymorphic FRs (≥2 triggers + axis enumeration). Skill produces matrix artifacts с evidence trail — future audit-friendly.
- **Prefer escape hatch** ТОЛЬКО когда: (a) AI confident что matrix не applicable (e.g. tested через parametrized helper), И (b) skill mechanical analysis would not surface reasoning (e.g. cross-variant test runner already handles enumeration).

**Never use escape hatch** to:
- Bypass skill потому что "медленно".
- Ship spec с noted-concerns без resolution.
- Circumvent gate после repeated blocks на same spec без changing matrix structure.

См. `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md` для audit details.

## Related

- Skill: [.claude/skills/variant-matrix-build/SKILL.md](../../../../extensions/specs-workflow/.claude/skills/variant-matrix-build/SKILL.md) (or installed copy)
- Escape hatch audit: [escape-hatch-audit.md](escape-hatch-audit.md)
- Adjacent rule (commit-time): [`scope-gate/when-to-verify.md`](../../scope-gate/when-to-verify.md) — triggers per-case codepath reach verification (commit-time, не spec-time).
- Adjacent rule (plan-time): [`plan-pomogator/cross-scope-coverage.md`](../../plan-pomogator/cross-scope-coverage.md) — multi-scope test coverage matrix (plan-time fallback).
- Audit category reference: [`.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md`](../../../skills/create-spec/references/phase3plus_audit-variant-coverage.md)
- Reference incident: Stocktaking MR / Warehouse Transfer (QA Лилия Михайлова, 2026-04-27).
