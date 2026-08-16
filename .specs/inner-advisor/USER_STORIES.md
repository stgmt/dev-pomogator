# User Stories

### User Story 1: Rolling session summary, не пересобирать транскрипт (Priority: P1)

As a Claude Code power user, I want адвизор вести постоянный 10-секционный `summary.md` по сессии и консультироваться по нему, чтобы каждая консультация не читала весь гигантский транскрипт (10-90MB) заново, а опиралась на компактную память сессии.

**Why:** Сейчас каждая консультация пересобирает полный digest из транскрипта: на 90MB сессии это 90M raw → ~10K пакета, но всё равно читает и парсит весь файл. Rolling summary (порт нативной Anthropic Session Memory) сокращает вход консультации до «summary + небольшой delta-хвост» и переживает `/compact`/`--resume`.

**Independent Test:** Спека `inner-advisor.feature`, сценарий `@feature1` + офлайн-проверка `buildSummaryPacket`: при существующем summary `mode='summary'`, пакет на порядки меньше raw.

**Acceptance Scenarios:**

Given сессия длинная (≥5K контент-токенов)
When адвизор обновляет summary по гейту (5K роста + ≥3 tool calls)
Then `.dev-pomogator/advisor/summary/<sid>.md` обновлён атомарно и содержит 10 секций с целыми якорями `#`

Given существует rolling summary
When вызывается MCP-консультация `advisor` (без параметров)
Then консультация строится из summary + delta-хвоста, а не из полного транскрипта

---

### User Story 2: Модель-пара executo-адвизор (proxy native) во всех сессиях (Priority: P1)

As a plugin maintainer, I want адвизор быть частью канонического плагина (зарегистрирован в `hooks.json`/`.mcp.json` c resolve от `CLAUDE_PLUGIN_ROOT`), чтобы он работал во всех сессиях Claude Code у всех users, а не только при ручном overlay.

**Why:** Сейчас `inner-advisor` активен только под ручным `--settings` overlay и абсолютными путями `E:/repos/...` — на других машинах/ворктри ломается. Для «читает во всех сессиях» нужна каноническая регистрация: Stop-hook + MCP-тул, разрешение путей через `CLAUDE_PLUGIN_ROOT` (как `dev-pomogator-specs`).

**Independent Test:** Проверить после установки плагина на свежей сессии: MCP-тул `mcp__dev-pomogator-advisor__advisor` доступен, `.dev-pomogator/advisor/summary/<sid>.md` создаётся на длинной сессии.

**Acceptance Scenarios:**

Given плагин установлен канонически (marketplace install)
When курс новая сессия и агент зовёт адвизора
Then тул доступен во всех сессиях и работает без ручных машинных путей

Given ход завершён на длинной сессии
When Stop-hook видит рост ≥5K контент-токенов и ≥3 tool calls
Then summary обновляется через плагинный Stop-hook (не требует ручного `--settings`)

---

### User Story 3: Fail-open и стоимость под контролем (Priority: P2)

As a user, I want адвизор молча деградировать при проблемах (нет модели/таймаут/битый транскрипт) и консультировать по гейту, а не на каждый ход, чтобы сессия не висла и не тратила деньги на мусорные вызовы.

**Why:** Инцидент в разработке: живой вызов без таймаута и дельта-лимита виснул на 120s (суб2api). Fail-open + bounded delta + гейт — это обязательная защита, иначе «работает во всех сессиях» = «стоит каждую сессию».

**Independent Test:** Спека сценарий `@feature3` (отсутствующий ключ/таймаут → `{}` / skip + не крах); варианты: скоффка не стреляет на короткой сессии.

**Acceptance Scenarios:**

Given нет модели/таймаут/битый транскрипт
When вызывается адвизор
Then ответ fail-open (одна строка-ошибка или `{}`), сессия не блокируется

Given короткая сессия (<5K контент-токенов)
When Stop-hook проверит гейт init
Then summary не создаётся (нет расходов на пустую сессию)

---

### User Story 4: Не мешать out-session-advisor (AddressBook отдельно) (Priority: P3)

As a maintainer, I want inner-advisor быть чётко отделён от существующей спеки `out-session-advisor` (внешний noot-мониторинг чужих сессий через stream-json/ConPTY), чтобы два адвизора не стакались по именам, хукам и данным.

**Why:** `out-session-advisor` про внешний ноут над сторонними сессиями (ConPTY, stream-json, git add -A guard, parallel locks). `inner-advisor` — внутренний in-session rolling summary + MCP-тул. Разделение по: путям (`tools/advisor/` vs вне), хукам (Stop/MCP vs SessionStart/подпроцессы), данным (`summary/<sid>.md` vs чужие транскрипты). Не дублировать FR, не переиспользовать скрипты наоборот.

**Independent Test:** `grep -R` подтверждает: `tools/advisor/` не импортирует из out-session-advisor; имена спеки-слагe отдельные (`inner-advisor` vs `out-session-advisor`); hooks не пересекаются.

**Acceptance Scenarios:**

Given репо содержит обе спеки
When проверяется изоляция
Then `inner-advisor` не зависит от `out-session-advisor` и их пути/хуки/данные не пересекаются

---

### User Story 5: Измеряемая консультация (двухпроход + скепсис) (Priority: P2)

As a reviewer, I want адвизор в режиме `balanced` судить по делу (блокировать «не done» только при реальной причине) и отдавать evidence-based совет, чтобы совет был полезным, а не шаблонной парашой.

**Why:** A/B скепсиса: `balanced` в ~2× короче, структурнее и не подаёт «32 строки git status» как повод блокировать read-only задачу. Проверено живыми прогонами.

**Independent Test:** `bench/skeptic-ab.mjs` на реальных сессиях: strict vs balanced, ожидаем `balanced` блокирует только при причине.

**Acceptance Scenarios:**

Given консультация вызвана
When адвизор оценивает digest/report
Then «не done» появляется только при конкретной причине (нет улики / drift / нарушение правила / ошибки); иначе — «выглядит sound + 1 проверка»