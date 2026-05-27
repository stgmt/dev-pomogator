# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Все skill descriptions всегда видны без truncation (Priority: P1) — @feature1 @feature4

As a heavy Claude Code user (множество установленных skills + plugins), I want `skillListingBudgetFraction = 1.0` стояло в `~/.claude/settings.json`, чтобы Claude Code никогда не отбрасывал skill descriptions — все trigger phrases доступны AI в каждой сессии.

**Why:** Default 0.01 (1%) недостаточен — `/diagnostics` показывает `25 descriptions dropped (2.4%/1% of context)`. Знания есть, не юзаются. Контекста запас большой, считать оптимум — лишний код. Тупо ставим валидатор-максимум `1.0` (= 100% контекста) и забываем про проблему.

**Independent Test:** После применения фикса в новом окне Claude Code: `/diagnostics` — нет строки "Skill listing will be truncated", нет "N descriptions dropped".

**Acceptance Scenarios:**

Given `~/.claude/settings.json` НЕ содержит `skillListingBudgetFraction` (или содержит значение < 1.0)
When dev-pomogator installer/updater запускается
Then `~/.claude/settings.json` получает `skillListingBudgetFraction: 1.0` (атомарно)
And следующая `claude --diagnostics` сессия не содержит warning "Skill listing will be truncated"
And не содержит "N descriptions dropped"

---

### User Story 2: User-override сохраняется (Priority: P3) — @feature2 @feature3

As a Claude Code user, I want если я вручную поставил `skillListingBudgetFraction = 1.0` (или любое значение), dev-pomogator не дёргал это значение без необходимости.

**Why:** Идемпотентность. Если значение уже `1.0` — не перезаписывать. Если пользователь сознательно понизил до `0.5` — это его выбор, но we'll bump до 1.0 чтобы primary goal сработал (US-1 = "никогда не truncate"). User может re-set ниже после нашего bump — это его последнее слово до следующего installer run.

**Independent Test:** Запустить installer дважды подряд → второй запуск не модифицирует settings.json (file mtime не меняется).

**Acceptance Scenarios:**

Given `~/.claude/settings.json` содержит `skillListingBudgetFraction: 1.0`
When dev-pomogator installer/updater запускается
Then значение не перезаписывается (idempotent)
And settings.json file mtime не меняется

Given `~/.claude/settings.json` содержит `skillListingBudgetFraction: 0.5`
When dev-pomogator installer/updater запускается
Then значение поднимается до `1.0` (per primary goal US-1)
And в install report появляется строка: `skillListingBudgetFraction: 0.5 → 1.0`
