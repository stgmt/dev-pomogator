# Design

## Реализуемые требования

- FR-1: stability field in extension.json — see [FR.md](FR.md)
- FR-2: Beta label in interactive checkbox — see [FR.md](FR.md)
- FR-3: Beta unchecked by default — see [FR.md](FR.md)
- FR-4: --all excludes beta — see [FR.md](FR.md)
- FR-5: --include-beta flag — see [FR.md](FR.md)
- FR-6: Updater skips new beta — see [FR.md](FR.md)

## Компоненты

- `Extension` interface — добавить optional `stability` field
- Installer UI — checkbox label и default checked logic
- CLI args parsing — `--include-beta` flag
- Updater filter — не добавлять новые beta

## Где лежит реализация

- Extension interface: `src/installer/extensions.ts`
- Installer UI: `src/installer/index.ts`
- Install pipeline: `src/installer/claude.ts`
- Updater: `src/updater/index.ts`

## Директории и файлы

- `src/installer/extensions.ts` — Extension interface
- `src/installer/index.ts` — checkbox UI, --all filter, --include-beta
- `src/updater/index.ts` — updater beta filter
- `extensions/docker-optimization/extension.json` — первый beta manifest

## Алгоритм

### Extension interface change

```typescript
// src/installer/extensions.ts
export interface Extension {
  // ... existing fields ...
  stability?: 'stable' | 'beta';  // undefined = 'stable'
}
```

### Helper function

```typescript
function isBeta(ext: Extension): boolean {
  return ext.stability === 'beta';
}
```

### Interactive checkbox (FR-2, FR-3)

```typescript
// src/installer/index.ts
choices: availableExtensions.map(ext => ({
  name: `${ext.name}${isBeta(ext) ? ' (BETA)' : ''} — ${ext.description}`,
  value: ext.name,
  checked: !isBeta(ext),  // beta = unchecked
})),
```

### Non-interactive --all (FR-4, FR-5)

```typescript
// src/installer/index.ts
if (options.all && !options.includeBeta) {
  availableExtensions = availableExtensions.filter(ext => !isBeta(ext));
}
```

### CLI args parsing

```typescript
// src/index.ts
const args = process.argv.slice(2);
const includeBeta = args.includes('--include-beta');
```

### Updater filter (FR-6)

Updater уже обновляет только `config.installedExtensions` — новые beta не попадают в список.

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**Evidence:** Фича изменяет UI и фильтрацию в installer (1: НЕТ — не создаёт данные), не меняет состояние для отката (2: НЕТ), тесты проверяют installer output и config (3: НЕТ), нет внешних сервисов (4: НЕТ).
**Verdict:** Hooks/fixtures не требуются. Тесты stateless — runInstaller() + проверка installed files.
