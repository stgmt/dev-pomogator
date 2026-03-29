# Functional Requirements (FR)

## FR-1: Uninstall маркер @feature2

При легитимном удалении через `uninstall.ps1` система SHALL записать маркер-файл `~/.dev-pomogator-uninstalled` ВНЕ удаляемой директории ПЕРЕД удалением `~/.dev-pomogator/`. Маркер содержит timestamp и source (`uninstall.ps1`).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-2](USE_CASES.md#uc-2-легитимный-uninstall-feature2)

## FR-2: Детекция аномального удаления @feature1

При запуске hook-а (SessionStart или project-level) система SHALL проверить:
1. Существует ли `~/.dev-pomogator/scripts/tsx-runner.js`
2. Если нет — существует ли маркер `~/.dev-pomogator-uninstalled`
3. Если маркера нет И ранее была установка (есть project `.claude/settings.json` с pomogator hooks) → аномальное удаление

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-аномальное-удаление--auto-recovery-feature1)

## FR-3: Auto-recovery global scripts @feature1

При детекции аномального удаления система SHALL восстановить `~/.dev-pomogator/scripts/` из бандла: `tsx-runner.js`, `check-update.js`, `launch-claude-tui.ps1`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-аномальное-удаление--auto-recovery-feature1)

## FR-4: Re-registration SessionStart hook @feature1

При детекции отсутствия SessionStart hook в `~/.claude/settings.json` система SHALL переписать hook для `check-update.js`. Проверка запускается из project-level hook.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-global-settingsjson-сброшен-feature1)

## FR-5: Диагностическое логирование @feature3

Система SHALL логировать в `~/.dev-pomogator/logs/guard.log` (или stdout если директория недоступна) тип события: `RECOVERY`, `SKIP_UNINSTALLED`, `SKIP_FIRST_INSTALL`, `HOOK_REREGISTERED`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-первая-установка-feature1)
