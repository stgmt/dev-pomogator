# Global Dir Guard

Защита `~/.dev-pomogator/` от аномального удаления. Если директория исчезла не через uninstaller — автоматическое восстановление critical scripts (tsx-runner, check-update, launch-claude-tui). Различает: аномальное удаление vs легитимный uninstall vs первая установка.

## Ключевые идеи

- Маркер `~/.dev-pomogator-uninstalled` вне удаляемой директории — признак легитимного uninstall
- Guard скрипт (`global-dir-guard.cjs`) запускается из project hook, не зависит от global SessionStart
- Recovery копирует 3 скрипта из dist/ бандла + re-registers SessionStart hook

## Где лежит реализация

- **Guard**: `src/guard/global-dir-guard.ts` → `dist/global-dir-guard.cjs`
- **Uninstall маркер**: `uninstall.ps1`
- **Hook wiring**: `src/installer/claude.ts`

## Спеки: 5 FR, 8 BDD сценариев, 4 фазы реализации

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
