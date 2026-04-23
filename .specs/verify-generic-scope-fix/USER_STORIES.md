# User Stories

**Feature:** `verify-generic-scope-fix` — skill + hook pair для предотвращения класса багов "structurally no-op scope expansion" (добавление элементов в enum/switch/gate без проверки что каждый элемент реально проходит через редактируемый code path).

**Mотivation:** инцидент MR !100 PRODUCTS-20218 в webapp — Claude Code agent добавил `stocktaking` в `isOutboundDocument()` enum. У Stock Taking отдельная форма создания (`StartStockTakingModal`), qty генерится сервером равным available — валидация qty-vs-available для него структурно недостижима. Tech-lead evolkov на ревью: "Убрать. Stock Taking — другая история, форма другая, остатки при создании не валидируются". Подробнее см. `RESEARCH.md`.

---

## US-1: Claude Code agent защищён от no-op scope expansion @feature1 @feature2

Как **Claude Code agent**, меняющий код guard/policy/enum (`isOutboundDocument`, `canCreate`, `allowedTypes` и т.п.),
**я хочу** обязательный invocation процедурного skill-а перед commit,
**чтобы** не shipнуть structurally no-op fix, когда хотя бы один из добавленных элементов имеет отдельный creation flow (как `stocktaking` → `StartStockTakingModal`).

**Acceptance на высоком уровне:**
- При commit затрагивающем паттерны guard-файлов без свежего marker-а skill'а — hook блокирует с actionable message
- Skill проверяет code-path reachability для КАЖДОГО нового элемента (dedicated-flow grep, dataflow trace, value reachability)
- Если хотя бы один элемент unreachable (структурно no-op) — skill помечает `should_ship: false`, marker запрещает commit

---

## US-2: Reviewer видит auditable escape hatch @feature3

Как **tech-lead reviewer** (в роли аналогичной evolkov),
**я хочу** чтобы commits которые обошли verification несли auditable escape-hatch reason в commit message,
**чтобы** я мог grep-ать `git log` для `[skip-scope-verify:...]` и аудитить когда и почему gate был обойдён.

**Acceptance:**
- Escape hatch через `[skip-scope-verify: <reason>]` в commit message, reason ≥8 символов
- Каждое срабатывание escape hatch логируется в `.claude/logs/scope-gate-escapes.jsonl` с timestamp + reason + diff hash
- Reviewer может анализировать paths через `grep skip-scope-verify .claude/logs/scope-gate-escapes.jsonl`

---

## US-3: Agent не блокируется на тривиальных diff-ах @feature4

Как **Claude Code agent** работающий над docs-only / test-only изменениями,
**я хочу** чтобы hook НЕ блокировал такие diff-ы,
**чтобы** over-eager gating не стал следующим H1-style over-correction паттерном (per `feedback_single-incident-rules-over-generalize.md` memory).

**Acceptance:**
- Diff состоящий только из `*.md`, `*.txt` файлов — score dampening (−2 per file), проходит
- Diff состоящий только из файлов под `/(docs|tests|__tests__|spec)/i/` — score dampening, проходит
- Comment-only / formatting-only изменения в guard-файлах — не триггерят score

---

## US-4: Maintainer защищён от self-invocation H2 паттерна @feature5

Как **maintainer scope-gate**,
**я хочу** чтобы skill имел `disable-model-invocation: true` в frontmatter,
**чтобы** модель не могла "решить пропустить" skill (это воспроизводит H2 "noticed-but-didn't-act" факап где Claude заметил проблему stocktaking но всё равно shipнул).

**Acceptance:**
- SKILL.md содержит `disable-model-invocation: true` в frontmatter
- Skill вызывается только через `/verify-generic-scope-fix` или referenced rule
- Model самостоятельно skill не запускает (prevention of self-override)

---

## Tags legend

- `@feature1` — mandatory skill invocation + reach analysis (core flow)
- `@feature2` — marker invalidation (stale detection)
- `@feature3` — escape hatch + audit trail
- `@feature4` — docs/test dampening (anti-over-application)
- `@feature5` — disable-model-invocation pattern (prevent self-override)

Cross-mapping: US ↔ UC ↔ FR ↔ AC ↔ BDD scenarios см. `REQUIREMENTS.md` (traceability index).
