# Atomic Update Lock

Lock должен устанавливаться атомарно, иначе возможны параллельные апдейты.

## Правильно

```typescript
await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
// flag 'wx' гарантирует атомарность
```

## Неправильно

```typescript
if (await fs.pathExists(lockFile)) { ... }
await fs.writeFile(lockFile, process.pid.toString());
```

## Чеклист

- [ ] Lock создаётся атомарно (`wx` / O_EXCL)
- [ ] Stale lock удаляется и затем повторно создаётся атомарно
- [ ] В случае коллизии процесс завершает апдейт
