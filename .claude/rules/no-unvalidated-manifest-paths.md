# No Unvalidated Manifest Paths

**НЕ ДЕЛАЙ ТАК** — нельзя писать или удалять файлы по путям из манифеста без проверки, что путь остаётся внутри `projectPath`.

## Антипаттерн

Манифест может содержать `../` или абсолютные пути. Без проверки возможна запись/удаление вне проекта.

## Пример из практики (плохо)

```typescript
// relativePath приходит из extension.json
const destFile = path.join(projectPath, relativePath);
await fs.writeFile(destFile, content, 'utf-8');
```

## Последствия

- Запись или удаление вне проекта
- Уязвимость path traversal
- Повреждение внешних файлов

## Как правильно

```typescript
function resolveWithinProject(projectPath: string, relativePath: string): string | null {
  const base = path.resolve(projectPath);
  const resolved = path.resolve(base, relativePath);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

const destFile = resolveWithinProject(projectPath, relativePath);
if (!destFile) throw new Error(`Path traversal: ${relativePath}`);
await fs.writeFile(destFile, content, 'utf-8');
```

## Чеклист

- [ ] Любой путь из манифеста проходит `resolveWithinProject`
- [ ] Отклоняются `../` и абсолютные пути
- [ ] Логируется отклонённый путь
