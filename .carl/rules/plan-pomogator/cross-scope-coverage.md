# Cross-Scope Test Coverage Matrix

## Step 0: Spec-time application (priority gate)

Если spec был создан после `specs-workflow` v1.19.0 — variant matrix уже built на spec stage через `Skill("variant-matrix-build")` (Phase 2 step 4c) + audit category `VARIANT_COVERAGE` (Phase 3+). Этот rule остаётся как **plan-time fallback** для:

- Legacy specs созданных до v1.19.0 без spec-variant-matrix enforcement.
- Plans без spec (когда задача напрямую переходит из Jira/issue в plan-pomogator development plan без полного `.specs/` workflow).
- Plans которые охватывают changes за рамки одного spec (cross-cutting refactors).

При наличии spec с variant matrix — этот rule complementary, не дублирующий: spec covers per-variant *call-site mapping*, plan-pomogator covers *test breadth* (scope × variant matrix). См. cross-link на `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md`.

## Правило

При работе с фичей, которая реализована в нескольких scope-ах (сервисы, модули, endpoints, платформы, доктайпы — любая ось вариации проекта), агент ОБЯЗАН построить coverage matrix перед объявлением тестов завершёнными.

## Триггер

Фича затрагивает >1 scope. Определить через grep: один и тот же метод/паттерн вызывается в нескольких местах кодовой базы.

## Алгоритм

1. **Identify scopes** — grep по методу/паттерну → сколько call sites / сервисов / модулей содержат реализацию
2. **Identify variants** — какие типы входных данных, режимы, флаги, edge cases обрабатывает фича
3. **Build matrix** — scope × variant (markdown таблица)
4. **Map tests** — для каждой ячейки: есть BDD сценарий / тест? Указать ID
5. **Flag gaps** — пустая ячейка = либо создать тест, либо `[OUT_OF_SCOPE: причина]`

## Coverage Matrix шаблон

```markdown
| Variant / Scope      | Scope A  | Scope B  | Scope C  |
|----------------------|----------|----------|----------|
| Happy path           | TEST-001 | TEST-002 | ???      |
| Mixed types          | TEST-003 | ???      | ???      |
| Error case           | TEST-004 | ???      | ???      |
| Edge: empty input    | ???      | ???      | ???      |
```

`???` = gap. ОБЯЗАН быть закрыт тестом или `[OUT_OF_SCOPE: причина]`.

## Gap Report формат

После заполнения матрицы — summary:

```markdown
### Coverage Summary
- Scopes: 3 (Scope A, Scope B, Scope C)
- Variants: 4
- Total cells: 12
- Covered: 4 (33%)
- Gaps: 8

### Gaps requiring tests
| Scope | Variant | Priority | Action |
|-------|---------|----------|--------|
| Scope B | Happy path | HIGH | Create TEST-005 |
| Scope C | Mixed types | MEDIUM | [OUT_OF_SCOPE: shared code path with Scope A] |
```

## Антипаттерн

Фича реализована в 3 сервисах. Тесты написаны для 1. Агент говорит "все тесты проходят" — технически верно, покрытие ложное.

```
# ❌ НЕПРАВИЛЬНО
"Все 5 тестов проходят → фича готова"
# (5 тестов покрывают только 1 из 3 сервисов)

# ✅ ПРАВИЛЬНО
"Coverage matrix: 3 scope × 4 variants = 12 cells.
Покрыто: 5/12 (42%). Gaps: 7 (см. таблицу).
Нужны ещё 4 теста, 3 — OUT_OF_SCOPE (shared code path)."
```

## Когда НЕ применять

- Фича затрагивает только 1 scope
- Scopes используют один code path (протестировано один раз = протестировано для всех)
- Фича явно ограничена одной областью в требованиях

## Интеграция с specs-management

В Phase 2 (Requirements + Design) при заполнении `.feature`:
- Если FR описывает поведение для >1 scope → построить matrix ПЕРЕД написанием сценариев
- Каждый `???` в матрице → либо BDD Scenario, либо `[OUT_OF_SCOPE]` в AC

## Чеклист

- [ ] Определены все scopes где фича реализована (grep evidence)
- [ ] Определены все variants (input types, modes, error cases)
- [ ] Матрица scope × variant построена
- [ ] Каждая ячейка: тест ID или `[OUT_OF_SCOPE: причина]`
- [ ] Gap report с summary (covered % и список gaps)
- [ ] Нет ячеек с `???` — все закрыты

## See also

- `.claude/rules/scope-gate/when-to-verify.md` — per-case codepath reach verification (scope-gate extension). Смежное правило: cross-scope-coverage покрывает matrix scope × variant (test coverage); scope-gate покрывает per-case codepath reach (prevents structurally no-op fixes при enum/switch expansion).
- `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md` — spec-time primary gate (specs-workflow ≥1.19.0). Триггерится при создании spec; этот rule (cross-scope-coverage) — plan-time fallback.
