# Отчёт адаптации Claude Code → Cursor

**Дата:** 2026-01-18T13:36:49.808Z
**Входной файл:** `extensions/suggest-rules/claude/commands/suggest-rules.md`
**Выходной файл:** `extensions/suggest-rules/cursor/commands/suggest-rules.md`

## Статистика

| Категория | Количество замен |
|-----------|------------------|
| Frontmatter | 3 |
| Пути | 15 |
| Категории | 0 |
| Аргументы | 0 |
| Прочее | 5 |
| **ВСЕГО** | **23** |

## Детали изменений

### Frontmatter

| Было | Стало | Кол-во |
|------|-------|--------|
| `description: "Анализ сессии и предложение Claude rules на основе выявленных паттернов"` | `description: "Анализ сессии и предложение Cursor rules на основе выявленных паттернов"` | 1 |
| `allowed-tools: "Read, Write, Glob, Grep"` | `(удалено)` | 1 |
| `argument-hint: "[mem|nomem|session|global|project]"` | `(удалено)` | 1 |

### Пути

| Было | Стало | Кол-во |
|------|-------|--------|
| `.claude/rules/**/*.md` | `.cursor/rules/**/*.mdc` | 1 |
| `.claude/rules/` | `.cursor/rules/` | 8 |
| `antipatterns/<name>.md` | `antipatterns/<name>.mdc` | 1 |
| `patterns/<name>.md` | `patterns/<name>.mdc` | 2 |
| `checklists/<name>.md` | `checklists/<name>.mdc` | 1 |
| `gotchas/<name>.md` | `gotchas/<name>.mdc` | 1 |
| `<domain>/<name>.md` | `<domain>/<name>.mdc` | 1 |

### Критические правила

| Было | Стало | Кол-во |
|------|-------|--------|
| `БЕЗ frontmatter** — Claude Code rules это чистый M...` | `MDC формат — YAML frontmatter обязателен (name, de...` | 1 |

### Шаблоны

| Было | Стало | Кол-во |
|------|-------|--------|
| `Antipattern template без frontmatter` | `Antipattern template с MDC frontmatter` | 1 |
| `Pattern template без frontmatter` | `Pattern template с MDC frontmatter` | 1 |

### Текст

| Было | Стало | Кол-во |
|------|-------|--------|
| `# Suggest Claude Rules` | `# Suggest Cursor Rules` | 1 |
| `предложи Claude rules` | `предложи Cursor rules (.mdc файлы)` | 1 |

## Ручные исправления

После автоматической адаптации были исправлены вручную:

| Проблема | Исправление |
|----------|-------------|
| `.cursor/rules/antipatterns/no-direct-prod-db.md` | → `.mdc` |
| `.cursor/rules/antipatterns/<name>.mdcc` | → `.mdc` (опечатка) |
| Отсутствующая `**` в критических правилах | Добавлена |

## Результат

✅ Адаптация завершена успешно (23 автозамены + 3 ручных исправления)