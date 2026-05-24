# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Агент сам проверяет ответ перед отправкой (Priority: P1)

As a пользователь dev-pomogator (maintainer-разработчик), I want чтобы агент перед каждым ответом молча прогонял 5-шаговый шаблон самопроверки (что я понял → черновик → самооценка "поймёт?" → ответ-микроистория → переписать если не прошло), so that я не получал жаргонные вопросы с внутренними кодами (Wave N, FR-N, library names как опции) и ответы без причинно-следственной структуры, которые приходится переспрашивать.

**Why:** В сессии 2026-05-23 агент дважды подряд задал multi-select вопросы с жаргоном ("Issue B — Wave 14 vs Wave 11 vs Parallel"), что привело к циклу "не понял → переспроси → опять не понял". Это потеря времени и фрустрация пользователя. Существующее правило `.claude/rules/clear-questions-to-user.md` решает проблему, но живёт россыпью и не оформлено как переиспользуемый extension с явной точкой входа.

**Independent Test:** @feature1 — в test conversation подать агенту prompt который провоцирует жаргонный черновик (например "перечисли все доступные waves и issues"), и проверить что фактический ответ либо не содержит внутренних кодов, либо содержит расшифровку каждого кода в скобках. Acceptance: 0 необъяснённых внутренних кодов в финальном ответе.

**Acceptance Scenarios:**

Given агент готовит ответ содержащий внутренние коды (Wave N, FR-N) или multi-select вопрос с >3 опциями
When срабатывает шаг 3 самопроверки (самооценка "поймёт ли юзер")
Then ответ переписывается в формат микроистории до отправки, или multi-select сокращается до ≤2 опций бытовым языком

Given пользователь говорит "не понял" / "сложно" / "ты не понял сути"
When триггер инцидента
Then агент НЕ задаёт новый уточняющий вопрос, перечитывает копипаст и действует из контекста; если действительно нужно уточнение — задаёт ОДНОЙ свободной фразой без опций

---

### User Story 2: Slash-команда для аудита черновика по требованию (Priority: P2)

As a пользователь dev-pomogator, I want вызывать `/answer-simple <черновик>` в чате и получать переформулированный текст в формате микроистории + список найденных проблем (жаргон, внутренние коды, multi-options), so that вручную проверять читабельность черновиков (например при написании документации, спек, сообщений в коммитах) и обучаться писать лучше через явный feedback.

**Why:** Always-apply rule работает молча — пользователь не видит когда сработал и что именно агент переписал. Slash-команда даёт явный контроль: можно скормить любой текст и получить аудит с диагнозом. Полезно для дебага самого правила (когда оно даёт false positive) и для разработки других навыков агента.

**Independent Test:** @feature2 — вызвать `/answer-simple "Wave 14 (gates+OpenRouter) ПЕРЕД Wave 11 — Keep / Swap / Parallel?"`, проверить что output содержит: (a) переформулированную версию без Wave-кодов и без 3-опционного списка, (b) явный список проблем (жаргон: "Wave 14", "Wave 11", "gates", "OpenRouter"; multi-select 3 опции = превышение ≤2). Acceptance: skill возвращает структурированный ответ с обеими секциями.

**Acceptance Scenarios:**

Given пользователь набрал `/answer-simple <текст>` в чате
When skill парсит входной текст
Then возвращает два блока — "Переформулировано:" с микроисторией-версией текста, "Найдено проблем:" с bullet-list конкретных цитат из исходника

Given входной текст уже соответствует шаблону микроистории и не содержит жаргона/внутренних кодов
When skill анализирует
Then возвращает "Проблем не найдено" + краткое подтверждение какие критерии прошёл (5 опорных точек присутствуют, нет multi-select >2, нет внутренних кодов)

---

### User Story 3: Extension устанавливается через installer dev-pomogator (Priority: P3)

As a другой maintainer dev-pomogator который ставит extensions в свой target-проект через `npx github:<owner>/dev-pomogator` (owner — runtime-derived, не hardcoded), I want чтобы answer-simple ехал как стандартный installable extension (extension.json manifest + rules в `.claude/rules/answer-simple/` + skill в `.claude/skills/answer-simple/`), so that при установке plugin'а у меня сразу появляется и always-apply правило и slash-команда без ручной настройки путей.

**Why:** Без оформления как extension правило clear-questions-to-user работает только в source-репо dev-pomogator. После упаковки в extension оно поедет на любой target-проект где установлен dev-pomogator через installer — это масштабирует пользу с одного maintainer на всех distributees.

**Independent Test:** @feature3 — в свежем временном проекте запустить установку dev-pomogator с answer-simple в списке extensions, после установки проверить что target-проект содержит: (a) `.claude/rules/answer-simple/clear-questions-to-user.md`, (b) `.claude/skills/answer-simple/SKILL.md`, (c) запись о files+hashes в `~/.dev-pomogator/config.json`. Acceptance: все 3 артефакта присутствуют и хеши совпадают с source.

**Acceptance Scenarios:**

Given dev-pomogator installer запущен в новом проекте с answer-simple в active extensions
When installer обрабатывает `extensions/answer-simple/extension.json`
Then в target-проекте создаются файлы по путям из manifest (rules + skills), SHA-256 хеши записываются в managed config

Given пользователь набирает `/answer-simple` в Claude Code в установленном проекте
When Claude Code находит `.claude/skills/answer-simple/SKILL.md`
Then skill активируется и выполняет аудит входного черновика согласно SKILL.md mission
