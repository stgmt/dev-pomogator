# Research

## Контекст

В Claude Code 2.1.x существует механизм "skill listing budget" — лимит на суммарный объём skill descriptions, грузящихся в каждую сессию. При overflow часть descriptions отбрасывается. Это вызывает frustration: установленные skills становятся плохо обнаружимы по trigger phrases.

Запрос пользователя (verbatim): "сперва мне надо чтоб ограничений не было, все остальное потом. в спеках зафиксировать. а то бесит что знания есть а не юзаются, а контекста дохуя"

## Источники

- [Claude Code Docs — Extend Claude with skills](https://code.claude.com/docs/en/skills) — официальная документация секции "Skill descriptions are cut short" [VERIFIED]
- [claudefa.st — Claude Code's Hidden Skill Budget Setting](https://claudefa.st/blog/guide/mechanics/skill-listing-budget) — community deep-dive [SINGLE_SOURCE — не открыт пользователем во время research, ссылка из WebSearch]
- [GitHub issue #56966](https://github.com/anthropics/claude-code/issues/56966) — официальный bug report подтверждает воспроизведение на Windows v2.1.132 [VERIFIED]
- Локальный `claude --diagnostics` от текущей сессии (v2.1.138, win32-x64): `25 descriptions dropped (full descriptions kept for most-used skills) (2.4%/1% of context)` [VERIFIED — primary trigger]

## Технические находки

### F1: Имя ключа и формат значения [VERIFIED]

Ключ в settings.json: **`skillListingBudgetFraction`** (camelCase). Значение — **decimal fraction** в диапазоне (0, 1]:
- `0.01` → 1% контекстного окна (default)
- `0.02` → 2%
- `0.05` → 5%
- `1.0` → весь контекст
- НЕ percent: `2` (= 200%) — невалидно, валидатор отвергает
- НЕ строка: `"0.02"` — невалидно
- НЕ ноль: `0` — невалидно

> "The budget scales at 1% of the model's context window. The fraction is a percentage of the total context window, and that number changes per model." — Claude Code Docs

### F2: Что обрезается и в каком порядке [VERIFIED]

> "All skill names are always included, but if you have many skills, descriptions are shortened to fit the character budget. When it overflows, descriptions for the skills you invoke least are dropped first, so the skills you actually use keep their full text." — Claude Code Docs

Drop-порядок = **LRU по invocation history** (least-invoked → first to be dropped). Имена остаются, но без описания триггеры не работают через auto-invocation.

### F3: Связанные настройки [VERIFIED]

| Ключ | Тип | Default | Назначение |
|------|-----|---------|------------|
| `skillListingBudgetFraction` | float (0, 1] | `0.01` | % контекста под skill descriptions |
| `maxSkillDescriptionChars` | int > 0 | `1536` | Cap на длину каждой description+when_to_use entry |
| `SLASH_COMMAND_TOOL_CHAR_BUDGET` | env var, int chars | unset | Runtime override budget в сырых символах (не fraction) |
| `skillOverrides.{name}` | `"on"\|"name-only"\|"user-invocable-only"\|"off"` | absent → `"on"` | Per-skill visibility tuning |

Из claudefa.st (через WebSearch summary): "1536 is the default, 2048 is a reasonable raise, 4096 is aggressive" — для `maxSkillDescriptionChars`.

### F4: Стоимость [VERIFIED]

Локальный diagnostics: "Opting in would cost ~5k tokens for skills every session and uses rate limits faster."

Это означает: полный listing всех текущих skills = ~5k tokens. На 200k контекста = 2.5%. Default budget 1% = 2k tokens.

### F5: Settings.json location [VERIFIED через документацию]

Параметр — user-level setting в `~/.claude/settings.json` (Personal). Может также жить в `.claude/settings.json` (project) или enterprise managed settings. dev-pomogator уже работает с `~/.claude/settings.json` через `update-config` skill — паттерн знаком.

### F6: Edge case — Claude Code version compatibility [UNVERIFIED]

Когда именно `skillListingBudgetFraction` был добавлен в Claude Code — не нашёл явного changelog entry. Issue #56966 reported на v2.1.132 → значит работает as-of минимум 2.1.132. Текущий env у пользователя v2.1.138. Older versions (≤2.0.x) могут не поддерживать ключ — нужна fallback проверка либо `claude --version` parse.

## Где лежит реализация

- **Источник проблемы**: внутри Claude Code CLI (`C:\Users\stigm\.local\bin\claude.exe`) — closed-source, не модифицируем
- **Точка фикса**: `~/.claude/settings.json` ключ `skillListingBudgetFraction` (user-level) — единственный supported workaround
- **Связанные dev-pomogator артефакты**:
  - `src/installer/*` — installer пишет в settings.json (через `atomic-config-save` rule)
  - `extensions/pomogator-doctor/tools/pomogator-doctor/` — diagnostic checks с 🟢🟡🔴 группами
  - `.claude/skills/update-config/SKILL.md` — manual workflow для settings.json edits
  - `extensions/skills-rules-optimizer/` — audit skill descriptions (token count) — adjacent но не пересекается

## Выводы

1. **Root cause** = default `skillListingBudgetFraction = 0.01` (1%) недостаточен.
2. **Решение** = жёстко прописать `skillListingBudgetFraction: 1.0` (валидатор-максимум) в `~/.claude/settings.json`. Нет счёта, нет пересчёта, нет doctor-логики. User explicit feedback (2026-05-11): "зачем так сложно? считать что-то. просто прописывать максмально возможно скил бюджет".
3. **Идемпотентность**: если уже `1.0` → no-op. Если меньше или невалидно → bump до `1.0`.
4. **OUT OF SCOPE**: подсчёт суммарного size descriptions, auto-tune по количеству skills, shortening descriptions (это работа `skills-rules-optimizer`), disabling skills (`skillOverrides`), per-skill prioritization, doctor-check.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | Запись в settings.json | FR-Implementation |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | User modifications protection через content hash | Edit shared user-level config | FR-3 (user-override) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth | Создание новой extension | FR-Implementation |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` extension в relative imports | TypeScript код в extensions | FR-Implementation |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Path traversal guard | Resolve путей | NFR-Security |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | runInstaller/spawnSync, не unit | Тестирование | NFR-Reliability |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test ↔ .feature | BDD tests | NFR-Reliability |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | tests/** → .specs/ обязательно | Создание тестов | Phase 3 TASKS |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| pomogator-doctor | `extensions/pomogator-doctor/` | 17 diagnostic checks с 🟢🟡🔴, atomic settings.json fixes | Может host новую проверку "Skill Listing Budget" (US-1 happy path) |
| installer settings.json | `src/installer/` | Atomic write в `~/.claude/settings.json` | Reuse existing infra для записи `skillListingBudgetFraction` |
| update-config skill | `.claude/skills/update-config/` | Manual workflow для settings.json | Может вызывать новую compute-budget logic |
| skills-rules-optimizer | `extensions/skills-rules-optimizer/` | Audit skill descriptions (token count) | Уже сканирует SKILL.md frontmatter — reuse для подсчёта суммарных tokens |

### Architectural Constraints Summary

- Запись `~/.claude/settings.json` ОБЯЗАНА быть atomic (temp + move) — `atomic-config-save` rule.
- Пути к user skill directories: `~/.claude/skills/`, project `.claude/skills/`, plugin `<plugin>/skills/`. Подсчёт суммарного size требует сканирования всех.
- Размер description рассчитывается как `len(description) + len(when_to_use)` capped at `maxSkillDescriptionChars` (default 1536). Это формула из docs.
- Должен быть idempotent: повторный запуск не должен дёргать значение без причины.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude Code в будущей версии переименует/удалит ключ `skillListingBudgetFraction` → silent no-op (warning вернётся) | Low | Medium | Доку Claude Code пинить в README с указанием known-good version range (2.1.132+). После install — optional verify через `claude --diagnostics` parse. |
| `1.0` загружает ~5k токенов каждой сессии — потенциально влияет на rate limits | High | Low | User explicit: «контекста дохуя» (мемори `prefer-full-capability-over-budget.md`). Out-of-scope concern. |
| Запись `1.0` затирает user-modified value меньше 1.0 (например 0.5 для rate-limit экономии) | Medium | Medium | По дизайну (US-2): bump до 1.0 — намеренное поведение. User может re-set ниже после updater run — last write wins до следующего updater. Документировать в README/CHANGELOG. |
| settings.json corrupted (битый JSON, race) | Low | High | Atomic write (`atomic-config-save`): temp file + `fs.move` overwrite. JSON.parse pre-check существующего content; при parse error — backup и rewrite from scratch. |
| Установлен dev-pomogator на Claude Code ≤2.0.x где ключ не валиден | Low | Low | Claude Code validator просто проигнорирует unknown key. No-op fallback; не ломает settings.json. |
