# Spec Review: answer-simple

**Phase:** Discovery (pre-STOP #1)
**Generated:** 2026-05-23T18:50:00Z (approx)
**Scope:** categories 1, 2, 4, 5, 6, 10, 14 (Phase 1 + always-on cat 14)

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 1 → 0 (auto-fixed) | ✅ clear after patch |
| P1 (fix before stop) | 0 | ✅ clear |
| P2 (recommendations) | 0 | — |
| P3 (informational) | 0 | — |

**Overall verdict:** READY (после автопатча P0)

## P0 Findings (resolved)

| # | Category | Location | Issue | Required fix |
|---|----------|----------|-------|--------------|
| 14-1 | Memory-constraint compliance | `USE_CASES.md:35`, `USER_STORIES.md:49` | Forbidden literal `stgmt/dev-pomogator` найден в bootstrap-команде `npx github:stgmt/dev-pomogator`. Нарушает memory `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-hardcoded-repo-or-user-identifiers.md` — "dev-pomogator is distributed via npx github:stgmt/dev-pomogator to other users — every skill in this repo is shipped to third parties, so any maintainer-specific hardcoding is a correctness bug". | Replace literal with generic placeholder `<owner>/dev-pomogator` + annotation "runtime-derived from git remote". См. Patches ниже. |

## P1 / P2 / P3 Findings

Нет.

## Категории — что проверено

| Cat | Name | Result |
|-----|------|--------|
| 1 | External-API claim verify | ✅ Все 7 file paths в RESEARCH.md (rules + extensions + skills) подтверждены через Glob — существуют |
| 2 | Existing-asset duplicate | ✅ `extensions/answer-simple/` и `.claude/skills/answer-simple/` не существуют — спека не дублирует |
| 4 | Assumption-vs-Requirement | ✅ 3 user stories трассируются на user-stated requirements: US-1 → "плагин который бы вот так работал... я рулес всегдаподключаемый хотел", US-2 → "скил команду вызывать через слеш", US-3 → "плагин" implies installable |
| 5 | Open Questions stale | ✅ Нет `## Open Questions` секции в RESEARCH.md — нечего ловить как stale |
| 6 | @featureN cross-file consistency | ⏭ Skip — нет .feature файла на Phase 1 (создаётся в Phase 2) |
| 10 | Hallucination/fluff smell | ✅ Длинные параграфы в RESEARCH.md содержат цитаты/факты; нет "fast/stable" без чисел |
| 14 | Memory-constraint compliance | ⚠️→✅ P0 finding выше (auto-fixed) |

## Auto-fix patches (applied)

### Patch 1: Remove hardcoded `stgmt/dev-pomogator` literal в USE_CASES.md

**File:** `.specs/answer-simple/USE_CASES.md` (line 35)

**old_string:**
```
- Шаг 1: `npx github:stgmt/dev-pomogator install` либо bundled install со всеми extensions
```

**new_string:**
```
- Шаг 1: `npx github:<owner>/dev-pomogator install` (где `<owner>` — фактический GitHub-owner репозитория dev-pomogator, runtime-derived из remote URL) либо bundled install со всеми extensions
```

### Patch 2: Remove hardcoded `stgmt/dev-pomogator` literal в USER_STORIES.md

**File:** `.specs/answer-simple/USER_STORIES.md` (line 49 area)

**old_string:**
```
As a другой maintainer dev-pomogator который ставит extensions в свой target-проект через `npx github:stgmt/dev-pomogator`, I want чтобы answer-simple ехал как стандартный installable extension
```

**new_string:**
```
As a другой maintainer dev-pomogator который ставит extensions в свой target-проект через `npx github:<owner>/dev-pomogator` (owner — runtime-derived, не hardcoded), I want чтобы answer-simple ехал как стандартный installable extension
```

## Lessons recorded

- В Phase 2 при заполнении DESIGN.md / FILE_CHANGES.md избегать литеральных owner/repo идентификаторов. Использовать `<owner>/<repo>` или `<git-remote-derived>` placeholder. Тот же rule применяется для команд установки, URL example, manifest fields.
- При написании user stories для extensions с installer-сценарием — отметить в Independent Test что test должен использовать derived/mocked owner, не literal.

## Next action

P0 resolved через автопатч. Verdict READY. Можно запускать `spec-status.ts -ConfirmStop Discovery`.
