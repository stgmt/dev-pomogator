# Research

## Контекст

2026-03-25: у пользователя перестало работать контекстное меню (Nilesoft Shell), все project hooks, auto-update. Причина — `~/.dev-pomogator/` полностью исчез с диска. Пользователь ничего не делал руками.

## Инцидент-анализ (2026-03-25)

### Таймлайн

| Время | Событие | Evidence |
|-------|---------|----------|
| Jan 29 | claude.exe установлен | `Birth: 2026-01-29 10:16:28` |
| Feb 10 | Nilesoft контекстное меню настроено | `claude-code.nss Birth: 2026-02-10` |
| Mar 21 | claude-code.nss обновлён | `Modify: 2026-03-21 21:30:32` |
| **Mar 25 09:10** | **claude.exe обновился до v2.1.83** | `Modify: 2026-03-25 09:10:46` |
| **Mar 25 23:18** | **`~/.claude/` пересоздан с нуля** | Все файлы от 23:18 |
| Mar 25 23:18 | Global settings.json = чистый | Нет SessionStart hook |
| Mar 25 | `~/.dev-pomogator/` не существует | `Test-Path → False` |

### Что удалило `~/.dev-pomogator/`

**Не dev-pomogator.** Весь код installer/check-update проверен — единственное место удаления: `uninstall.ps1` (пользователь не запускал).

Гипотезы:
1. Claude Code v2.1.83 updater зацепил при wipe `~/.claude/`
2. Windows Storage Sense / антивирус
3. npm cache cleanup при обновлении

**Невозможно подтвердить** — claude.exe закрытый бинарник.

### Что сломалось каскадом

```
~/.dev-pomogator/ удалена
├─ scripts/tsx-runner.js → ВСЕ project hooks мертвы (Stop, PreToolUse)
├─ scripts/check-update.js → auto-update мертв
├─ scripts/launch-claude-tui.ps1 → контекстное меню YOLO+TUI мертво
├─ config.json → check-update возвращает false
└─ node_modules/.bin/tsx → tsx-runner fallback мертв

~/.claude/settings.json сброшен
└─ SessionStart hook потерян → check-update никогда не стартует
```

## Источники

- `src/installer/shared.ts:235` — `setupGlobalScripts()` создаёт `~/.dev-pomogator/scripts/`
- `src/installer/claude.ts:277` — `setupClaudeHooks()` пишет SessionStart hook в global settings
- `dist/check-update.bundle.cjs:5838` — `checkUpdate()` читает config, не вызывает `setupGlobalScripts`
- `uninstall.ps1:81` — единственное место удаления `~/.dev-pomogator/`
- `src/installer/shared.ts:313` — `ensureHomeTsx()` ставит tsx в `~/.dev-pomogator/node_modules/`

## Технические находки

### Single point of failure

`setupGlobalScripts()` вызывается ТОЛЬКО из `install`. Если `~/.dev-pomogator/` удалена после install — нет recovery-пути. `check-update.bundle.cjs` не содержит `setupGlobalScripts`.

### Маркер uninstall не существует

`uninstall.ps1` удаляет `~/.dev-pomogator/` без следов. Невозможно отличить легитимный uninstall от аномального удаления.

### Дополнительный баг: `@sel.path` в NSS

`postinstall.ts:58-60` использует `@sel.path` (пустой на background click). Рабочие entry в `terminal.nss` используют `@sel.dir`. Исправлено на `@sel.dir` в текущей сессии.

## Где лежит реализация

- Installer: `src/installer/shared.ts` (`setupGlobalScripts`, `ensureHomeTsx`)
- Global hooks: `src/installer/claude.ts` (`setupClaudeHooks`)
- Check-update: `dist/check-update.bundle.cjs` (bundled, из `src/updater/`)
- Uninstaller: `uninstall.ps1`
- NSS генератор: `extensions/context-menu/tools/context-menu/postinstall.ts`

## Выводы

1. Нужен маркер легитимного uninstall вне `~/.dev-pomogator/` (чтобы пережил удаление)
2. Нужен recovery path в check-update или project hooks
3. Нужна re-registration SessionStart hook если он потерян
4. Различать: первая установка vs аномальное удаление vs легитимный uninstall

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp+move | Запись конфигов | FR-1 (маркер) |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Удалять только managed-файлы | Удаление файлов | FR-2 (uninstall) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Манифест = source of truth | Изменение расширений | FR-3 (recovery) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| setupGlobalScripts | `src/installer/shared.ts:235` | Создание `~/.dev-pomogator/scripts/` | Переиспользовать для recovery |
| setupClaudeHooks | `src/installer/claude.ts:277` | SessionStart hook registration | Переиспользовать для re-registration |
| check-update.bundle.cjs | `dist/check-update.bundle.cjs` | Фоновый апдейтер | Встроить recovery |
| uninstall.ps1 | `uninstall.ps1` | Удаление глобальных файлов | Добавить маркер |

### Architectural Constraints Summary

- `check-update.bundle.cjs` — standalone CJS бандл (esbuild), не импортирует `shared.ts` напрямую. Recovery логику нужно дублировать или бандлить вместе.
- Global `~/.claude/settings.json` контролируется Claude Code — может быть сброшен при обновлении. Hooks в нём ненадёжны как единственный триггер.
- Project hooks (`Stop`, `PreToolUse`) выживают в `.claude/settings.json` проекта — более надёжная точка детекции.
