# Skill Listing Budget

Фикс warning Claude Code «Skill listing will be truncated» — тупо ставим `skillListingBudgetFraction: 1.0` в `~/.claude/settings.json` при install/update.

## Зачем

Claude Code 2.1.x по умолчанию выделяет 1% контекста под skill descriptions. При установленных 25+ skills этого мало → часть descriptions отбрасывается → AI не находит skills по trigger phrases. Знания есть, не юзаются.

## Решение в одну строку

```json
{ "skillListingBudgetFraction": 1.0 }
```

`1.0` = валидатор-максимум (весь контекст под listing). После применения: zero truncation независимо от количества/размера skills.

## Стоимость

~5k токенов skill descriptions в каждой сессии. На 200k контекста = 2.5%. User-explicit OK ("контекста дохуя").

## Ключевые идеи

- **Тупая константа `1.0`**, не computed value. User explicit: «зачем так сложно? считать что-то».
- **Атомарная запись** через `temp + fs.move` (per `.claude/rules/atomic-config-save.md`).
- **Идемпотентность**: уже 1.0 → no-op (file mtime preserved).
- **Bump существующего < 1.0** → 1.0 (primary goal: никогда не truncate). User может re-set ниже после updater run — last write wins до следующего updater.
- **Битый JSON** → backup в `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}` + rewrite с 1.0.

## Где лежит реализация

- **Plugin folder**: `extensions/skill-listing-budget/`
  - `extension.json` — manifest (tool + SessionStart hook + postInstall hook)
  - `README.md` — user-facing plugin overview
  - `tools/skill-listing-budget/apply_skill_budget.ts` — self-contained tool (no src/ dependency)
  - `tools/skill-listing-budget/README.md` — короткий pointer на родительский README
- **Tests**: `tests/e2e/skill-listing-budget.test.ts` + `tests/features/core/CORE023_skill-listing-budget.feature`

## Как откатить

1. Открыть `~/.claude/settings.json`
2. Поменять `skillListingBudgetFraction: 1.0` на нужное (например `0.01` для дефолта Claude Code)
3. **НЕ запускать** `dev-pomogator update` (он перепишет назад). Альтернативно — удалить `~/.dev-pomogator/config.json` чтобы отключить updater.

## Out of Scope

- Подсчёт суммарного размера descriptions, auto-tune fraction по количеству skills
- Doctor-проверка отдельной категорией
- Shortening descriptions (это работа `skills-rules-optimizer` extension)
- Per-skill disable через `skillOverrides`
- Per-session env override через `SLASH_COMMAND_TOOL_CHAR_BUDGET`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — кто, зачем, что
- [USE_CASES.md](USE_CASES.md) — 4 сценария (fresh / re-install / bump / corrupted JSON)
- [RESEARCH.md](RESEARCH.md) — verified findings про `skillListingBudgetFraction`, GitHub issue #56966
- [FR.md](FR.md) — 4 functional requirements
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — AC в EARS формате
- [DESIGN.md](DESIGN.md) — алгоритм + Key Decisions
- [TASKS.md](TASKS.md) — 8 задач в TDD-порядке
- [FILE_CHANGES.md](FILE_CHANGES.md) — 5 файлов create/edit
- [skill-listing-budget.feature](skill-listing-budget.feature) — 8 BDD сценариев
