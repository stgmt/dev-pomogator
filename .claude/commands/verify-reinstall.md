# /verify-reinstall — Проверка идемпотентности переустановки

## Описание

Проверяет, что повторная установка dev-pomogator не создаёт дубликатов, не теряет файлы и не меняет содержимое.

## Параметры

- `TEST_DIR`: путь к тестовой директории (по умолчанию: `../test-reinstall-pomogator` рядом с dev-pomogator)
- `SOURCE_DIR`: путь к репозиторию dev-pomogator (по умолчанию: текущий проект)
- `HOME_DIR`: домашняя директория пользователя (по умолчанию: `$HOME` / `%USERPROFILE%`)

## Workflow

### Шаг 1: Подготовка + первая установка

1. `npm run build` в SOURCE_DIR
2. Создать TEST_DIR, `git init`, `mkdir .cursor`
3. Первая установка:
   ```bash
   node SOURCE_DIR/bin/cli.js --cursor --all
   node SOURCE_DIR/bin/cli.js --claude --all
   ```

### Шаг 2: Снапшот состояния "ДО"

Собрать и запомнить:
1. **Файлы**: рекурсивный список файлов + SHA-256 хешей в:
   - `TEST_DIR/.dev-pomogator/tools/`
   - `TEST_DIR/.cursor/commands/`
   - `TEST_DIR/.claude/commands/`
   - `TEST_DIR/.cursor/rules/pomogator/`
   - `TEST_DIR/.claude/rules/pomogator/`
2. **Hooks**:
   - `TEST_DIR/.claude/settings.json` — количество entries в каждом hook-type
   - `HOME_DIR/.cursor/hooks/hooks.json` — количество entries в каждом event
3. **Config**: `HOME_DIR/.dev-pomogator/config.json` — количество extension entries, projectPaths
4. **Глобальные скрипты**: `HOME_DIR/.dev-pomogator/scripts/` — список файлов

### Шаг 3: Переустановка

```bash
node SOURCE_DIR/bin/cli.js --cursor --all
node SOURCE_DIR/bin/cli.js --claude --all
```

### Шаг 4: Снапшот состояния "ПОСЛЕ" + сравнение

Собрать те же данные и сравнить по чеклисту.

### Шаг 5: Cleanup

Удалить TEST_DIR.

---

## Чеклист

| # | Проверка | Что | Как |
|---|----------|-----|-----|
| R1 | Файлы не задвоились | Кол-во файлов в `.dev-pomogator/tools/`, `.cursor/commands/`, `.claude/commands/` | Одинаково до и после |
| R2 | Claude hooks не задвоились | `.claude/settings.json` — кол-во entries в каждом hook-type | Одинаково до и после |
| R3 | Cursor hooks не задвоились | `HOME_DIR/.cursor/hooks/hooks.json` — нет дубликатов команд в каждом event | Одинаково до и после |
| R4 | Config не задвоился | `HOME_DIR/.dev-pomogator/config.json` — нет дублей в `projectPaths`, нет дублей extension entries | Одинаково до и после |
| R5 | Содержимое не изменилось | SHA-256 хеши файлов до и после | Совпадают |
| R6 | Rules не задвоились | Кол-во файлов в `.cursor/rules/pomogator/`, `.claude/rules/pomogator/` | Одинаково до и после |
| R7 | Глобальные скрипты | `HOME_DIR/.dev-pomogator/scripts/` — кол-во файлов | Одинаково до и после |

---

## Формат отчёта

```markdown
## Отчёт переустановки dev-pomogator

### Summary
- Идемпотентность: OK/FAIL
- Проблемы: N

### Чеклист

| # | Проверка | До | После | Результат |
|---|----------|----|-------|-----------|
| R1 | Файлы tools | N | N | OK/FAIL |
| R2 | Claude hooks | N | N | OK/FAIL |
| R3 | Cursor hooks | N | N | OK/FAIL |
| R4 | Config entries | N | N | OK/FAIL |
| R5 | Хеши файлов | match | match | OK/FAIL |
| R6 | Rules | N | N | OK/FAIL |
| R7 | Глобальные скрипты | N | N | OK/FAIL |

### Проблемы (если есть)
- [описание]
```
