# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature2

**Требование:** [FR-1](FR.md#fr-1-uninstall-маркер-feature2)

WHEN `uninstall.ps1` выполняется THEN система SHALL создать файл `~/.dev-pomogator-uninstalled` с содержимым `{"timestamp":"<ISO>","source":"uninstall.ps1"}` ПЕРЕД удалением `~/.dev-pomogator/`.

## AC-2 (FR-2) @feature1

**Требование:** [FR-2](FR.md#fr-2-детекция-аномального-удаления-feature1)

WHEN hook стартует AND `~/.dev-pomogator/scripts/tsx-runner.js` не существует AND маркер `~/.dev-pomogator-uninstalled` не существует AND project `.claude/settings.json` содержит pomogator hooks THEN система SHALL классифицировать ситуацию как `ANOMALOUS_DELETION`.

WHEN hook стартует AND `~/.dev-pomogator/scripts/tsx-runner.js` не существует AND маркер `~/.dev-pomogator-uninstalled` существует THEN система SHALL классифицировать ситуацию как `LEGITIMATE_UNINSTALL`.

WHEN hook стартует AND `~/.dev-pomogator/scripts/tsx-runner.js` не существует AND маркер не существует AND project settings не содержит pomogator hooks THEN система SHALL классифицировать ситуацию как `FIRST_INSTALL`.

## AC-3 (FR-3) @feature1

**Требование:** [FR-3](FR.md#fr-3-auto-recovery-global-scripts-feature1)

WHEN ситуация классифицирована как `ANOMALOUS_DELETION` THEN система SHALL создать `~/.dev-pomogator/scripts/` и скопировать туда `tsx-runner.js`, `check-update.js`, `launch-claude-tui.ps1` из dist/ бандла.

## AC-4 (FR-4) @feature1

**Требование:** [FR-4](FR.md#fr-4-re-registration-sessionstart-hook-feature1)

WHEN project hook детектит что `~/.claude/settings.json` не содержит SessionStart hook с `check-update.js` THEN система SHALL добавить hook в `~/.claude/settings.json` через atomic read-modify-write.

## AC-5 (FR-5) @feature3

**Требование:** [FR-5](FR.md#fr-5-диагностическое-логирование-feature3)

WHEN recovery или skip выполняется THEN система SHALL записать строку с `[RECOVERY]`, `[SKIP_UNINSTALLED]`, `[SKIP_FIRST_INSTALL]` или `[HOOK_REREGISTERED]` в stdout.
