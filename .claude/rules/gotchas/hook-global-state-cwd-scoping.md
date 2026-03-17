---
paths:
  - "extensions/*/tools/**/*gate*.ts"
  - "extensions/*/tools/**/*hook*.ts"
  - ".dev-pomogator/tools/**/*gate*.ts"
---

# Hook Global State — CWD Scoping

Hooks, читающие глобальные директории (`~/.claude/plans/`, `~/.claude/prompts/`), ОБЯЗАНЫ использовать `cwd` из hook input для привязки к текущему проекту.

## Антипаттерн

`~/.claude/plans/` содержит планы ВСЕХ проектов. Поиск по mtime без cwd подхватит чужой план при параллельных сессиях.

## Пример из практики (плохо)

```typescript
function findLatestPlanFile(): string | null {
  const plansDir = path.join(os.homedir(), '.claude', 'plans');
  // Сортирует ВСЕ планы глобально по mtime — подхватит чужой проект
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null;
}
```

## Как правильно

```typescript
function findLatestPlanFile(cwd?: string): string | null {
  // 1. Собрать кандидатов по mtime
  // 2. Если cwd доступен — скорировать по content match:
  //    - extractFileChangePaths() → проверить существование в cwd (+10)
  //    - project basename в содержимом (+5)
  // 3. Вернуть best match, fallback на mtime
}
```

## Правило

- `cwd` доступен в hook input (`data.cwd`) — использовать его
- Для content matching: извлечь пути из `## File Changes` таблицы, проверить `fs.existsSync(path.join(cwd, p))`
- Fallback на mtime если нет content match (fail-open)

## Чеклист

- [ ] Hook принимает `cwd` из input data
- [ ] Глобальные пути скорируются по relevance к `cwd`
- [ ] Fallback на текущее поведение при отсутствии `cwd`
- [ ] Fail-open при ошибках чтения
