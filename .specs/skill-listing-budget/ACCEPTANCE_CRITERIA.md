# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-запись-skilllistingbudgetfraction-10-в-claudesettingsjson)

WHEN dev-pomogator installer (`npx github:stgmt/dev-pomogator` или updater) запускается AND `~/.claude/settings.json` либо не существует, либо не содержит ключ `skillListingBudgetFraction` THEN installer SHALL атомарно записать ключ со значением `1.0`.

WHEN existing `~/.claude/settings.json` содержит другие ключи THEN installer SHALL сохранить все остальные ключи без изменений.

IF `~/.claude/settings.json` содержит invalid JSON (parse error) THEN installer SHALL сделать backup в `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}` AND перезаписать файл на `{ "skillListingBudgetFraction": 1.0 }`.

IF installer не имеет прав на запись в `~/.claude/` (permission denied) THEN installer SHALL продолжить остальные шаги install AND записать warning в install report (NFR-R1).

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-идемпотентность-повторных-запусков)

IF `~/.claude/settings.json` уже содержит `skillListingBudgetFraction: 1.0` (strict equality, число `1.0`, не строка `"1.0"`) THEN installer SHALL не вызывать `fs.writeFile`/`fs.move` для этого ключа AND file mtime SHALL остаться неизменным.

WHEN installer пропустил write по idempotency THEN install report SHALL содержать строку `skillListingBudgetFraction: 1.0 (unchanged)`.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-bump-существующего-значения-10)

WHEN `~/.claude/settings.json` содержит `skillListingBudgetFraction` как число в диапазоне `[0, 1.0)` AND installer запускается THEN installer SHALL атомарно поднять значение до `1.0`.

WHEN installer выполнил bump THEN install report SHALL содержать строку `skillListingBudgetFraction: {old} → 1.0` (где `{old}` — точное прежнее значение в исходном представлении).

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-install-report-includes-change-line)

WHEN installer/updater завершает обработку `skillListingBudgetFraction` THEN install report (stdout install log AND/OR `~/.dev-pomogator/last-update-report.md`) SHALL содержать ровно одну строку про этот ключ.

IF ключ был добавлен (был absent) THEN строка SHALL быть `skillListingBudgetFraction: (unset) → 1.0`.

IF ключ был bumped (был number < 1.0) THEN строка SHALL быть `skillListingBudgetFraction: {old} → 1.0`.

IF ключ уже был 1.0 (idempotent path) THEN строка SHALL быть `skillListingBudgetFraction: 1.0 (unchanged)`.

IF ключ был invalid (битый JSON / wrong type / out of range / string) THEN строка SHALL быть `skillListingBudgetFraction: <invalid: {raw}> → 1.0` (где `{raw}` — escaped repr исходного значения, max 50 chars).

## AC-5 (FR-5)

**Требование:** [FR-5: OUT OF SCOPE](FR.md#fr-5-out-of-scope-нет-doctor-проверки-нет-подсчёта-нет-per-skill-логики)

> OUT OF SCOPE — нет behavioral acceptance criterion. FR-5 фиксирует решение НЕ реализовывать перечисленные подходы (doctor-проверка, computed fraction, per-skill disable). Связанные тесты тоже отсутствуют (нет такого функционала). Этот AC существует только для traceability — `LINK_VALIDITY` audit ожидает парную AC для каждой FR-N.
