# Research

## Контекст

Система расширений dev-pomogator не имеет механизма для обозначения стабильности плагина. Все плагины равноправны — при `--all` устанавливаются все. Нужен способ пометить экспериментальные плагины как beta и исключить их из дефолтной установки.

## Источники

- `src/installer/extensions.ts` — Extension interface, `listExtensions()`
- `src/installer/index.ts` — interactive/non-interactive installer flow
- `src/installer/claude.ts` — `installClaude()` pipeline
- `src/config/schema.ts` — Config, InstalledExtension interfaces
- `extensions/*/extension.json` — 12+ manifests

## Технические находки

### Extension interface (текущая)

`src/installer/extensions.ts` — standard fields:
- `name`, `version`, `description`, `platforms`, `category`
- `tools`, `toolFiles`, `skills`, `skillFiles`, `hooks`
- `ruleFiles`, `commandFiles`, `statusLine`, `postInstall`
- `envRequirements`, `requiresClaudeMem`

**Нет поля `stability`, `beta`, `status`.** Все расширения неявно stable.

### Installer selection UI

`src/installer/index.ts:81-88` — interactive checkbox:
```typescript
const selectedExtensions = await checkbox({
  message: 'Select extensions to install:',
  choices: availableExtensions.map(ext => ({
    name: `${ext.name} — ${ext.description}`,
    value: ext.name,
    checked: true,  // все checked по умолчанию
  })),
});
```

### Non-interactive flow (--all)

`src/installer/index.ts:33-40`:
```typescript
if (options.plugins !== undefined) {
  availableExtensions = availableExtensions.filter(ext =>
    options.plugins!.includes(ext.name)
  );
}
```

`--all` = `plugins: undefined` → все extensions без фильтра.

### Categories (не используются для фильтрации)

Поле `category` есть (`automation`, `workflow`, `optimization`, `infrastructure`), но UI не группирует и не фильтрует по нему.

## Где лежит реализация

- Extension interface: `src/installer/extensions.ts`
- Installer UI: `src/installer/index.ts`
- Install pipeline: `src/installer/claude.ts`
- Config: `src/config/schema.ts`
- Manifests: `extensions/*/extension.json`

## Выводы

1. Добавить optional `stability?: 'stable' | 'beta'` в Extension interface — backward compatible (undefined = stable)
2. Installer checkbox: beta = unchecked по умолчанию, показать `(BETA)` label
3. `--all`: фильтровать beta, `--all --include-beta`: без фильтра
4. Минимум изменений: 3 файла (extensions.ts, index.ts) + N extension.json manifests

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth | Изменение extension | FR-1 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Updater обновляет ВСЕ installed plugins | Обновление | FR-5 |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Managed files tracked с hash | Удаление/обновление | FR-5 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Extension interface | `src/installer/extensions.ts` | Manifest type + listExtensions() | Добавить stability field |
| Installer checkbox | `src/installer/index.ts:81-88` | Interactive selection UI | Изменить checked/label для beta |
| Config schema | `src/config/schema.ts` | InstalledExtension tracking | Не нужно менять — beta tracked как обычные |
| docker-optimization | `extensions/docker-optimization/extension.json` | Новый плагин-кандидат на beta | Первый beta manifest |

### Architectural Constraints Summary

- Backward compatible: отсутствие `stability` = stable (не ломает существующие manifests)
- extension.json = source of truth — stability читается из manifest, не из конфига
- Updater обновляет только installed plugins — beta не добавляется автоматически при update
