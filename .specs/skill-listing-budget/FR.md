# Functional Requirements (FR)

## FR-1: Запись `skillListingBudgetFraction: 1.0` в `~/.claude/settings.json`

dev-pomogator installer и updater SHALL гарантировать что `~/.claude/settings.json` содержит ключ `skillListingBudgetFraction` со значением `1.0` после успешного завершения install/update.

**Детали:**
- Запись выполняется атомарно: `temp file → fs.move(overwrite: true)` (per `.claude/rules/atomic-config-save.md`).
- Если `~/.claude/settings.json` не существует — создаётся с минимально-валидным содержимым `{ "skillListingBudgetFraction": 1.0 }` (mode 0644).
- Если файл существует и содержит ключ `= 1.0` — write skip (idempotent).
- Если файл существует и содержит другое значение (любое число, строка, null, объект) — перезаписывается на `1.0`.
- Если файл существует но содержит битый JSON — backup в `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}` и rewrite from scratch с `{ "skillListingBudgetFraction": 1.0 }`. Остальные ключи в этом случае теряются (acceptable trade-off: corrupted JSON уже сломан).
- Все остальные ключи в `~/.claude/settings.json` SHALL сохраняться (preserve user config).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-no-key-in-settingsjson-linked-to-us-1-feature1-feature4), [UC-4](USE_CASES.md#uc-4-edge-invalid-existing-value-corrupted-wrong-type-feature1-feature4)
**User Story:** US-1

## FR-2: Идемпотентность повторных запусков

Повторный запуск installer/updater без изменений извне SHALL не модифицировать `~/.claude/settings.json` (file mtime preserved).

**Детали:**
- Перед write — read existing content, JSON.parse, проверка `existing.skillListingBudgetFraction === 1.0` (strict equality).
- Если условие true — пропустить write полностью (никакого `fs.writeFile` + `fs.move`).
- Логировать в install report: `skillListingBudgetFraction: 1.0 (unchanged)`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-re-install-update-value-already-10-linked-to-us-2-idempotent-feature2-feature4)
**User Story:** US-2

## FR-3: Bump существующего значения < 1.0

Если `skillListingBudgetFraction` уже присутствует, но значение валидное число < 1.0 — installer/updater SHALL поднять до 1.0 и залогировать переход.

**Детали:**
- Trigger: `typeof existing === 'number' && existing >= 0 && existing < 1.0`.
- Action: overwrite на 1.0 + log line `skillListingBudgetFraction: {old} → 1.0`.
- Reasoning: primary goal — «никогда не truncate». User-explicit user-override < 1.0 трактуется как stale/forgotten — last write wins.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-user-downgraded-to-lower-value-linked-to-us-2-bump-path-feature3-feature4)
**User Story:** US-2

## FR-4: Install report includes change line

Install/update report (`~/.dev-pomogator/last-update-report.md` или stdout install log) SHALL содержать ровно одну строку про `skillListingBudgetFraction` per run, отражающую один из 4 случаев:

| Случай | Формат строки |
|--------|---------------|
| Не было ключа → добавили | `skillListingBudgetFraction: (unset) → 1.0` |
| Было число < 1.0 → bumped | `skillListingBudgetFraction: {old} → 1.0` |
| Уже было 1.0 | `skillListingBudgetFraction: 1.0 (unchanged)` |
| Было невалидное (битый JSON / wrong type / out of range) → восстановили | `skillListingBudgetFraction: <invalid: {raw}> → 1.0` |

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** все

## FR-5: OUT OF SCOPE — нет doctor-проверки, нет подсчёта, нет per-skill логики

> OUT OF SCOPE — User explicit feedback (2026-05-11): «зачем так сложно? считать что-то. просто прописывать максмально возможно скил бюджет». Подсчёт суммарного size descriptions, auto-tune, отдельная проверка в `pomogator-doctor`, shortening descriptions, per-skill disable через `skillOverrides` — НЕ входят в эту фичу.
>
> Если user manual выставил `skillListingBudgetFraction < 1.0` сознательно и хочет это сохранять — это пока not supported, ему придётся re-set после каждого `dev-pomogator update`. Если возникнет реальный request — отдельная фича.

**Связанные AC:** [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) — explicit OUT OF SCOPE marker, no behavioral criterion.
**Use Case:** UC-5 из черновика USE_CASES.md был удалён (doctor) — relevant decision history в RESEARCH.md.
