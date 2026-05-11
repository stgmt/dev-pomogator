# Postmortem — Duplicate rows in /api/index (session-pilot)

**Дата обнаружения:** 2026-05-11
**Серьёзность:** P2 (UX-bug — dashboard показывал ложные данные, но ничего не ломал)
**Затронуто:** все linked git worktrees в любом scan root
**Branch:** `feat/session-pilot` (PR #17)
**Status:** Fixed — `indexer.py:39-58` + `indexer.py:217-251`. Regression tests: `tests/test_indexer_invariants.py` (4 cases, все fail на старом коде, pass на fix).

## Что увидел пользователь

5 разных worktree-ов на дашборде показывали **одинаковые** `Last activity`, `Last message`, `HEAD 7f8950c`. Юзер: «разные сессии а ласт меседж один и тот же».

PowerShell-диагностика подтвердила:

```
Total rows: 76
Top duplicate wt_paths:
  5x  D:/repos/dev-pomogator                          repos: [dev-pomogator, dev-pomogator-canonical-v2,
                                                              dev-pomogator-forbid-root-artifacts,
                                                              dev-pomogator-session-pilot, wt-honest-status-command]
  5x  D:/repos/dev-pomogator-canonical-v2             repos: [...тот же набор...]
  5x  D:/repos/dev-pomogator-forbid-root-artifacts    repos: [...]
  5x  D:/repos/dev-pomogator-session-pilot            repos: [...]
  5x  D:/repos/dev-pomogator/.claude/worktrees/...    repos: [...]
```

Каждый physical worktree встречался ровно 5 раз — по одному ряду на каждую копию.

## Root cause — N×M cartesian, каждый «leaf» корректен

Цепочка вызовов `discover_repos → git_worktree_list → build_worktree_index`:

1. **`discover_repos`** сканировал `~/repos` и `/mnt/d/repos`, фильтр был `child.is_dir() and (child / ".git").exists()`. На linked git worktree `.git` — это **файл** (gitdir pointer), не директория. `exists()` вернёт `True` и для файла, и для директории → linked worktree регистрируется как отдельный «репозиторий».
2. **`git_worktree_list(repo)`** для каждого «репо» запускает `git worktree list --porcelain`. Эта команда вернёт **все** linked worktrees реального git-репо, независимо от того, из какого linked worktree её запустили. У 5 worktrees ОДИН реальный git-репо → каждый из них вернёт одинаковый список из 5.
3. **`build_worktree_index`** итерировал `repos × worktrees` без дедупа. 5 × 5 = 25 рядов для одного физического репо. Дашборд показал каждый worktree 5 раз с прибавкой `repo_name` (имя directory) — поэтому пользователю казалось «разные сессии», хотя `worktree_path` был тот же.

Реальное число строк больше 25 потому что под `~/repos` лежало ещё несколько физических репо.

### Почему каждый шаг проходил code-review

- `discover_repos`: `.git` существует — это git репо. Логично, корректно для **main** worktrees.
- `git_worktree_list`: парсит porcelain — корректно.
- `build_worktree_index`: итерирует и склеивает — корректно для **набора непересекающихся** репо.

Каждая функция выполняет свой контракт. Баг — в **композиции**, в неявной предпосылке «`discover_repos` возвращает только main worktrees», которую никто не валидировал.

## Почему тесты не поймали

### Имеющееся покрытие — `tests/test_jsonl_indexer.py`

10 тестов `T34_01..T34_10` для `claude_sessions_for()`:

- Все тесты — **leaf-level**: один JSONL → один результат, один tempdir → один project dir.
- Все тесты строят синтетические fixture'ы, **обходя** `discover_repos` и `git_worktree_list` целиком.
- Нет ни одного теста, который зовёт `build_worktree_index()` end-to-end.
- Нет ни одного теста, который проверяет **инвариант на форме output**: «каждый worktree_path встречается ≤1 раза».

Покрытие по строкам у `claude_sessions_for` — почти 100%. Покрытие по **инвариантам** у `build_worktree_index` — **0%**.

### Mutation testing — 97.8%

Mutation testing (mutmut 3.5) была запущена на `encode_path_for_claude()`. 97.8% mutation kill rate. **Этот код не имеет отношения к багу.** Mutation testing на perfect-leaf function не может найти баг в композиции функций.

Что было бы поймано mutation-тестом на `discover_repos`:

- `child.is_dir()` → `not child.is_dir()` — поймали бы (нашли бы директорию которая не директория).
- `(child / ".git").exists()` → `not (child / ".git").exists()` — поймали бы (вернули бы пустой список).
- `(child / ".git").exists()` → `(child / ".git").is_dir()` — **НЕ поймали бы**, потому что эта мутация и есть правильный код. Mutmut проверяет, что тест ловит изменение существующего кода, а не предлагает альтернативу.

То есть mutation testing **никогда** не предложил бы правильный фикс — он умеет находить только потерю существующего поведения, а здесь нужно было найти **отсутствие** проверки.

### Integration-test gap

Правило `.claude/rules/integration-tests-first.md` существует и требует: «Каждый FR покрыт минимум 1 интеграционным тестом». Этот FR — «build_worktree_index возвращает корректную таблицу для дашборда» — не был покрыт интеграционным тестом, потому что:

1. Не было FR в форме «output не содержит дубликатов» — был только FR «вернуть worktrees». Из второго первый не выводится автоматически.
2. Discoverability-bias тестописателя — было проще написать unit-test на `claude_sessions_for` (готовый JSONL fixture), чем integration-test на git worktree setup (нужен `git init` + `git worktree add` в tempdir).

## Что добавлено fixed

`tests/test_indexer_invariants.py` — 4 case:

| Case | Что проверяет | Поймал бы баг? |
|------|----------------|----------------|
| IDX_INV_01 | `discover_repos` пропускает linked worktree (`.git` = файл) | ✅ да |
| IDX_INV_02 | `discover_repos` принимает main worktree (`.git` = директория) | sanity check |
| IDX_INV_03 | `build_worktree_index` дедуплицирует даже если `discover_repos` вернёт повторы | ✅ да (defense-in-depth) |
| IDX_INV_04 | end-to-end: 1 main + 2 linked → 3 строки, не 9 | ✅ да (главный gate) |

Все 4 теста запущены против stashed-buggy кода — все 4 FAIL. Восстановили fix — все 4 PASS. Тесты bind invariant, не реализацию.

## Дополнительные находки

- `discover_repos` использовал `split(":")` для парсинга `REPOS` env — конфликтует с Windows drive letters (`C:/...`). Тоже исправлено на `os.pathsep`.
- В обоих fix'ах добавлен docstring, объясняющий **почему** именно `.is_dir()`, а не `.exists()` — иначе ревьюер при будущем рефакторе может «упростить обратно».

## Действия

1. ✅ Fix `discover_repos` — `.is_dir()` вместо `.exists()`.
2. ✅ Defense-in-depth: дедуп по `wt_path` в `build_worktree_index`.
3. ✅ Fix Windows-compatible `REPOS` parsing (`os.pathsep`).
4. ✅ 4 regression теста с output-invariant assertions.
5. ✅ Teaching doc для AI: `.claude/rules/testing/output-invariants-first.md` — общий принцип чтобы не повторять класс ошибки.

## Уроки (генерализуемые)

См. `.claude/rules/testing/output-invariants-first.md`. Кратко:

1. **Каждая функция, возвращающая коллекцию, имеет инварианты на саму коллекцию** (uniqueness, monotonic, conservation, bijection). Тесты должны их явно фиксировать — а не только per-input correctness.
2. **Composition bugs не ловятся unit-тестами leaf-функций**, какое бы покрытие они ни давали. Mutation testing на leaf-функции — ортогонально проблеме.
3. **N×M ситуации (join, cartesian, broadcast) — red flag.** Если в коде есть вложенный `for ... for ...`, должен быть тест где `N == M == >1`, и он явно сравнивает len(output) с ожидаемой формулой.
4. **`.exists()` редко то что нужно** — почти всегда нужно `.is_dir()` или `.is_file()`. `exists()` — это «может быть что угодно», а код обычно ждёт конкретный тип.
