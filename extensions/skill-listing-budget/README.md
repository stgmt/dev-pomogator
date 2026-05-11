# skill-listing-budget

Раз и навсегда отключает усечение skill descriptions в Claude Code.

## Зачем

Claude Code 2.1.x по умолчанию выделяет 1% контекста под skill descriptions
(`skillListingBudgetFraction = 0.01`). При установленных 25+ skills этого мало
— часть descriptions отбрасывается:

```
Skill listing will be truncated
25 descriptions dropped (full descriptions kept for most-used skills) (2.4%/1% of context)
run /skills to disable some, or raise skillListingBudgetFraction (currently 1%) in settings.json
Opting in would cost ~5k tokens for skills every session and uses rate limits faster
```

Результат: AI хуже находит skills по trigger phrases. Знания есть — не юзаются.

Этот плагин делает один тупой шаг: пишет `skillListingBudgetFraction: 1.0`
(валидатор-максимум) в `~/.claude/settings.json`. После этого Claude Code
загружает **все** skill descriptions полностью каждой сессии. Стоит это
~5k токенов (2.5% от 200k контекста) — если у тебя «контекста дохуя», это
приемлемая цена за полную видимость инструментов.

## Что делает

1. **Install (через `dev-pomogator` installer)** — сразу пишет ключ в
   `~/.claude/settings.json`, чтобы warning исчез без необходимости перезапуска.
2. **SessionStart hook** — на каждом запуске Claude Code проверяет ключ и
   self-heal-ит если кто-то изменил значение или удалил.

## Поведение по 4 веткам

| Стартовое состояние `~/.claude/settings.json` | Результат | Stderr line |
|------------------------------------------------|-----------|-------------|
| Файл отсутствует | Создаётся с `{ "skillListingBudgetFraction": 1.0 }` | `skillListingBudgetFraction: (unset) → 1.0` |
| Ключа нет в существующем JSON | Ключ добавлен, остальные ключи сохранены | `skillListingBudgetFraction: (unset) → 1.0` |
| Ключ уже `1.0` | No-op (file mtime preserved) | _(тишина)_ |
| Ключ — число `< 1.0` (`0.01`, `0.5` и т.д.) | Поднято до `1.0` | `skillListingBudgetFraction: 0.5 → 1.0` |
| Ключ — невалидный тип / `> 1.0` / отрицательный | Восстановлено до `1.0` | `skillListingBudgetFraction: <invalid: …> → 1.0` |
| Битый JSON во всём файле | Файл бэкапится в `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}`, settings.json перезаписывается с `{ "skillListingBudgetFraction": 1.0 }` | `skillListingBudgetFraction: <invalid: …> → 1.0` |

## Гарантии

- **Atomic write** — через `temp file → rename` (per `.claude/rules/atomic-config-save.md`).
  Никакого partial write визибл другим процессам Claude Code.
- **Preserve other keys** — `theme`, `hooks`, `permissions` и любые user keys
  не трогаются.
- **Idempotent** — повторный запуск при `1.0` уже стоит → нет I/O, file mtime
  не меняется.
- **Fail-open** — любая ошибка (permission denied, disk full) логируется в
  stderr и завершает с exit 0 — никогда не блокирует session start.

## Установка

Через стандартный dev-pomogator installer:

```bash
npx github:stgmt/dev-pomogator
```

После install (или после первого `SessionStart` Claude Code):
```bash
claude --diagnostics | grep -E "Skill listing|descriptions dropped"
# (должно быть пусто)
```

И проверка ключа:
```bash
grep skillListingBudgetFraction ~/.claude/settings.json
#   "skillListingBudgetFraction": 1
```

## Откат

Если по какой-то причине хочешь вернуть default Claude Code поведение:

1. Открой `~/.claude/settings.json`
2. Удали строку `"skillListingBudgetFraction": 1,` (или поменяй значение на нужное)
3. **НЕ запускай** `dev-pomogator update` — SessionStart hook вернёт `1.0`. Либо удали плагин:
   ```bash
   # Когда появится поддержка selective uninstall:
   # dev-pomogator uninstall skill-listing-budget
   ```
   Сейчас selective uninstall не поддержан — придётся удалить весь dev-pomogator
   через `dev-pomogator uninstall` или вручную убрать SessionStart hook из
   `~/.claude/settings.json`.

## Файлы

- `extension.json` — manifest (1 tool, 1 SessionStart hook)
- `tools/skill-listing-budget/apply_skill_budget.ts` — self-contained script
- `tools/skill-listing-budget/README.md` — короткая ссылка на этот README

## Where the spec lives

Полная спецификация фичи (USER_STORIES, USE_CASES, RESEARCH, FR, AC, DESIGN,
TASKS, BDD .feature, FIXTURES, AUDIT_REPORT) — в
[`.specs/skill-listing-budget/`](../../.specs/skill-listing-budget/).

## Out of scope

- **Подсчёт оптимального fraction** — тупо `1.0` всегда, не computed.
- **Doctor-проверка** — отдельной диагностики нет.
- **Per-skill disable** через `skillOverrides` — другая фича Claude Code, не наша.
- **Compactor** — сокращение descriptions делается отдельным плагином
  `skills-rules-optimizer`.
