# Use Cases

## UC-1: Fresh install — no key in settings.json (linked to US-1) — @feature1 @feature4

User устанавливает dev-pomogator на машину где Claude Code показывает "Skill listing will be truncated".

- User: `npx github:stgmt/dev-pomogator`
- Installer: читает `~/.claude/settings.json` (создаёт если нет)
- Installer: ключа `skillListingBudgetFraction` нет → добавляет `skillListingBudgetFraction: 1.0`
- Installer: атомарно пишет (per `atomic-config-save` rule)
- Installer: в install report: `skillListingBudgetFraction: (unset) → 1.0`
- User: открывает новое окно Claude Code → `/diagnostics` → warning исчез
- Результат: все skills видны полностью каждой сессии

## UC-2: Re-install / update — value already 1.0 (linked to US-2, idempotent) — @feature2 @feature4

User повторно запускает dev-pomogator installer/updater.

- Installer: читает `~/.claude/settings.json`
- Installer: ключ `skillListingBudgetFraction = 1.0` уже стоит → no-op
- Installer: settings.json НЕ перезаписывается (file mtime preserved)
- Installer: в install report: `skillListingBudgetFraction: 1.0 (unchanged)`
- Результат: идемпотентность, никаких лишних write'ов

## UC-3: User downgraded to lower value (linked to US-2, bump path) — @feature3 @feature4

Пользователь сознательно понизил `skillListingBudgetFraction = 0.5` (например для экономии rate limits). Запускается updater.

- Updater: читает значение `0.5`
- Updater: bump до `1.0` (per primary goal — "ограничений не должно быть")
- Updater: install report: `skillListingBudgetFraction: 0.5 → 1.0`
- Результат: даже если user понизил, после нашего updater вернётся к 1.0. User может re-set ниже после — это его последнее слово до следующего updater run.

## UC-4: Edge — invalid existing value (corrupted, wrong type) — @feature1 @feature4

settings.json содержит `skillListingBudgetFraction: "0.02"` (string) или `2` (out of range).

- Installer: читает значение
- Installer: detects invalid type/range → перезаписывает на `1.0`
- Installer: install report: `skillListingBudgetFraction: <invalid: "0.02"> → 1.0`
- Результат: вернуто к valid state.
