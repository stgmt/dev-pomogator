# Output Invariants First

Когда функция возвращает коллекцию (list / dict / set / DataFrame / table), её корректность определяется **двумя** наборами проверок:

1. **Per-input correctness** — «при вводе X функция вернула Y». Это уже умеешь.
2. **Output invariants** — свойства самой коллекции, которые должны держаться при ЛЮБОМ вводе. Это место где AI обычно недотягивает.

Если ты написал тесты только класса (1) — баг класса (2) тебя ждёт. Этот документ — про то, как написать оба сразу, **с первой попытки**.

## Какие инварианты бывают (с примерами)

| Инвариант | Что значит | Типичный код | Тест |
|-----------|-----------|--------------|------|
| **Uniqueness** | элемент не повторяется по ключу | join, dedup, scan + merge | `assert len(out) == len(set(out, key=...))` |
| **Conservation** | сумма не теряется и не растёт | partition, route, dispatch | `assert sum(in) == sum(part_a) + sum(part_b)` |
| **Monotonicity** | сортировка/возрастание сохраняется | filter, map, sort | `assert all(a <= b for a, b in zip(out, out[1:]))` |
| **Cardinality** | размер выходит из формулы | join, cartesian, expand | `assert len(out) == len(left) * len(right)` (или `==`, `>=`, `<=` ) |
| **Coverage** | все входные ключи представлены | aggregate, summarize | `assert set(out.keys()) >= set(in.keys())` |
| **Bijection** | round-trip даёт исходник | encode/decode, normalize | `assert decode(encode(x)) == x` |
| **Idempotence** | повторный вызов не меняет | normalize, dedup, init | `assert f(f(x)) == f(x)` |
| **No-leak** | output не содержит сырые internals | sanitize, project, hide | `assert "password" not in str(out)` |

**Правило-эвристика:** перед написанием тестов задай себе три вопроса:

1. Какие два разных входа дают одинаковый по форме output? (uniqueness, dedup invariants)
2. Какая алгебраическая связь между размером входа и размером выхода? (cardinality invariant)
3. Что должно быть верно для output **независимо от входа**? (всё что не зависит от X)

Каждый «да» → отдельный тест.

## Class of bug: leaves correct, composition broken

Это самый коварный класс. Симптомы:

- Каждая функция имеет 100% строкового покрытия unit-тестами.
- Все unit-тесты зелёные.
- Mutation testing 95%+.
- Баг существует месяцами в проде.

Причина: тесты проверяют контракт каждой функции **в изоляции**, но не проверяют, что **композиция** функций удовлетворяет контракту пайплайна целиком.

**Реальный пример (session-pilot, 2026-05-11):**

```python
def discover_repos() -> list[Path]:
    # ищет .git, возвращает каталоги — корректно для main worktrees
    return [c for c in scan_root.iterdir() if (c / ".git").exists()]

def git_worktree_list(repo) -> list[dict]:
    # парсит git worktree list --porcelain — корректно
    return parse_porcelain(run_git(repo))

def build_worktree_index() -> dict:
    rows = []
    for repo in discover_repos():        # 5 «репо» (на самом деле 1 main + 4 linked)
        for wt in git_worktree_list(repo):  # каждый вернёт ВСЕ 5 worktrees того же репо
            rows.append({...wt...})
    return {"rows": rows}                 # 25 строк, каждая worktree встречается 5 раз
```

Все три функции изолированно корректны. Все три имеют тесты. Бага нет ни в одной из них — баг в неявном предположении `discover_repos` что `.git` существует ⇒ это **main** worktree. Это предположение не было выражено как инвариант ни в коде, ни в тестах.

**Чтобы поймать это с первой попытки:**

- В тестах `build_worktree_index` написать инвариант: `assert no duplicate worktree_path`.
- В docstring `discover_repos` зафиксировать контракт: «возвращает только main worktrees».
- В реализации перевести этот контракт в код: `.is_dir()` вместо `.exists()`.

## Why N×M nested loops are a red flag

Если ты пишешь:

```python
for a in collection_a:
    for b in collection_b:
        out.append(...)
```

ОБЯЗАТЕЛЬНО задай два вопроса:

1. **Что произойдёт если `a` и `b` пересекаются** (один объект попадает в обе коллекции)? Не получится ли дубликат в `out`?
2. **Какая ожидаемая cardinality `len(out)`** — `|A| * |B|`, `|A| + |B|`, `|A∪B|`, что-то ещё? Запиши формулу в комментарий или в test assertion.

**Тест шаблон для join/expand операций:**

```python
def test_<thing>_cardinality():
    a = make_collection_of_size(3)
    b = make_collection_of_size(4)
    out = build(a, b)
    # явно ожидаемая формула — если ожидаешь дедуп, считай дедуп
    assert len(out) == 3 + 4 - len(intersect(a, b)), f"got {len(out)}: {out}"
```

Если в коллекциях возможны overlapping элементы (общий случай для file paths, IDs, URLs) — **обязательно** тест с overlapping fixture-ами.

## Mutation testing — что оно реально гарантирует

Mutation testing меняет существующий код и проверяет что тесты ловят изменение. Это полезно для **regression-grade** в зрелом коде. Это **не** заменяет:

- Тесты на инварианты (мутация не предлагает добавить отсутствующее условие).
- Integration-тесты (мутация работает на уровне токенов, не композиций).
- Тесты на пропущенные case-ы (мутация ничего не знает о требованиях, только о существующем коде).

**Когда mutation testing вводит в заблуждение:**

- Высокий mutation score на perfect-leaf function (`encode_path`, `parse_int`, `format_date`) и низкий integration coverage — это **хуже** чем равномерное среднее coverage, потому что создаёт ложное чувство безопасности.
- Mutation testing на leaf-функции не сообщит что **другие** функции, которые её используют, имеют проблемы композиции.

**Правило:** прежде чем тратить время на mutation testing, проверь что у тебя есть **хотя бы один integration-тест end-to-end pipeline**. Mutation testing — это инструмент полировки, не инструмент поиска class-bug-ов.

## Discoverability bias — почему ты пишешь не те тесты

AI (и люди) пишут тесты которые **легко написать**, а не те которые **нужно написать**:

- Легко: unit-тест на pure-function (готовый input → expected output, нет setup).
- Сложно: integration-тест с `git init`, `git worktree add`, tmpdir, monkeypatch.

В итоге получается покрытие смещённое к простым функциям. Сложные интеграции — где живут composition bugs — остаются непокрытыми.

**Контр-эвристика для AI:** при написании тестов **первым** задай вопрос — «какой самый дорогой по setup тест я могу написать на end-to-end pipeline?» и пиши его в первую очередь. Дешёвые unit-тесты добавляй после, не вместо.

## Чеклист «прежде чем сказать тесты готовы»

- [ ] Перечислил инварианты output (см. таблицу выше) — минимум 2 для любой функции возвращающей коллекцию.
- [ ] Для каждого инварианта есть отдельный тест, который **только** этот инвариант проверяет.
- [ ] Для функций, вызывающих другие функции (composition), есть минимум 1 integration-тест с реальным setup-ом, без mock-ов на промежуточные слои.
- [ ] Для N×M nested loops явно записана ожидаемая формула cardinality.
- [ ] Для функций, принимающих overlapping inputs (paths, IDs, URLs), есть тест с overlapping fixture-ами.
- [ ] Прогнал tests **с временно сломанным кодом** (revert fix → tests должны FAIL → restore fix → tests PASS). Это проверяет что тесты bind на правильное поведение, а не случайно зелёные.
- [ ] Не положил тесты на mutation testing как замену integration-тестам.

## Анти-эвристики (когда не применять)

- **Pure leaf функции** (`add(a, b)`, `parse_iso8601(s)`) — инвариантов почти нет. Не выдумывай.
- **Stateless transformations** где input полностью определяет output и output полностью определяется входом — uniqueness и conservation тривиальны, тесты не нужны.
- **Throwaway scripts** где код выкинут через неделю — overhead не оправдан.

Этот rule применяется когда:

- Функция возвращает коллекцию (`list[X]`, `dict[K, V]`, `set[X]`, `pd.DataFrame`).
- Функция вызывает 2+ других функций последовательно.
- Функция имеет nested `for ... for ...`.
- Функция работает с file paths, IDs, URLs, или другими identifier-ами (где duplicates приходят естественно).

## Source incident

Real bug (caught **after** ship):

- session-pilot dashboard показывал 5 одинаковых worktree-ов вместо 1.
- `discover_repos` фильтр `.git").exists()` принимал и linked worktrees (`.git` = файл).
- `git_worktree_list` для каждого «репо» возвращал все 5 → N×N cartesian.
- 10 unit-тестов на `claude_sessions_for` + mutation 97.8% на `encode_path_for_claude` не поймали.
- Поймал бы тест: «1 main + 2 linked → ровно 3 ряда в output, не 9».

Postmortem: `.specs/session-pilot/POSTMORTEM-duplicate-rows.md`.
