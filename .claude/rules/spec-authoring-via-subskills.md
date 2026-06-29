# Spec form-docs — author via the automator sub-skills, not by hand (enforced)

## Правило (always-apply)

Форм-документы спеки — `USER_STORIES.md`, `RESEARCH.md`, `REQUIREMENTS.md`, `DESIGN.md`,
`TASKS.md` — ОБЯЗАНЫ заполняться **скилами-автозаполнителями**, а не ручной построчной
писаниной через `apply_spec_change`:

| Документ | Скил-автозаполнитель |
|----------|----------------------|
| `USER_STORIES.md`, `RESEARCH.md` (Risk) | `discovery-forms` |
| `REQUIREMENTS.md`, `DESIGN.md` (CHK + Key Decisions) | `requirements-chk-matrix` |
| `TASKS.md` (Done-When/Status/Est) | `task-board-forms` |

Точечные правки (`old_string`/`new_string`) и не-форм-документы (`FR.md`, `NFR.md`,
`ACCEPTANCE_CRITERIA.md`, `.feature`, `FILE_CHANGES.md`, `README.md`, `CHANGELOG.md`) — руками
через дверь можно.

## Почему

Ручная построчная писанина форм-документов **дерётся** с двумя вещами, которые автозаполнители
делают правильно из коробки:
1. **Кросс-док якорная паутина** — каркас рождает ссылки на заголовки-заглушки (`#fr-1-название`);
   пишешь настоящие заголовки руками → все входящие ссылки рвутся → дверь отказывает → ручной
   танец «развязать → записать → завязать» по 6 документам.
2. **Строгие форм-стражи** — `user-story-form-guard`, `requirements-chk-guard`,
   `design-decision-guard`, `task-form-guard`, `risk-assessment-guard` требуют точные формы
   (Priority/Why/IT/AC; CHK-ID; Decision Rationale/Trade-off/Alternatives; Done-When/Status/Est;
   ≥2 risk rows). Автозаполнители знают эти формы; руками легко получить отказ.

Скилы знают ОБА: ставят правильные якоря-связки (`**Требование:** [FR-N]` внутри блоков —
источник covers-рёбер по FR-47) и валидные формы. Поэтому правильный путь — звать скил, а не
воспроизводить его логику руками.

## Enforcement (hook)

`tools/spec-authoring-steer/steer.ts` — PreToolUse-хук (по образцу `spec-access-guard`):
- **SHADOW** (по умолчанию): полная ручная запись форм-документа (`apply_spec_change` с полным
  `content`, длина ≥400) → лог + stderr-подсказка «зови скил», вызов проходит.
- **ENFORCE** (`SPEC_AUTHORING_ENFORCE=true`): тот же случай → **DENY** с указанием нужного скила.
- Маркер-пропуск: `[skip-spec-steer: <reason ≥8>]` в поле `reason` двери (НЕ в `content` — он бы
  засорил документ), либо session env `SPEC_AUTHORING_SKIP=1`. Оба логируются в
  `.dev-pomogator/logs/spec-authoring-steer.jsonl`.
- **Законные автозаполнители помечают свои `{content}`-записи** этим маркером: 3 скила
  (`discovery-forms`/`requirements-chk-matrix`/`task-board-forms`) + 3 фазовых агента
  (`spec-phase-discovery`/`-requirements`/`-finalization`) — их хук пускает, а ручную писанину режет.
- Builtins-only (`node:fs`/`node:path`), fail-open — работает у юзеров без зависимостей.

Только полный `{content}`-автор форм-документа триггерит хук; точечные правки и обычные документы
проходят свободно.

## Связанные

- `tools/specs-validator/spec-access-guard.ts` — родственный (доступ к `.specs/` только через дверь);
  этот хук — следующий слой (через дверь, но не руками целый форм-документ).
- `.claude/rules/gotchas/enforce-spec-door-bash-workflow.md` — как работать под `SPEC_ACCESS_ENFORCE`.
- `.claude/skills/create-spec/SKILL.md` — воркфлоу, который зовёт эти автозаполнители (Phase 1/2/3).
- `audit-reports/spec-mcp-authoring-friction-2026-06-29.md` — разбор трения, породивший этот хук.

## История

Создано 2026-06-29 после сессии авторинга `.specs/bdd-test-scanner`: агент написал все 13
документов руками построчно через дверь вместо автозаполнителей и весь день дрался с якорной
паутиной + форм-стражами. Владелец: «мсп должен автоматизированно делать всё; обнови хук-блокер +
скилы чтоб направляли тупого по умному». Хук — механический enforcement; это правило — объяснение.
