---
description: "Анализ сессии и предложение Claude rules на основе выявленных паттернов"
allowed-tools: Read, Write, Glob, Grep
argument-hint: "[mem|nomem|session|global|project]"
---

# Suggest Claude Rules

## Mission

Проведи ретроспективный анализ текущей сессии и предложи Claude rules для сохранения ценного контекста и паттернов.

---

## Phase -1: Memory Context — КОМБИНИРОВАННЫЙ ПОИСК

> **ПЕРВОЕ ДЕЙСТВИЕ — комбинированный MCP search по типам записей.**
> Результат определяет режим работы: Full (память + сессия) или Session-only.

### Шаг 1: Определить имя проекта

Имя проекта = последняя часть working directory.
```
D:\repos\lm-saas → project = "lm-saas"
/home/user/my-app → project = "my-app"
```

### Шаг 1.5: Извлечение контекста сессии

**Проанализируй сессию и извлеки ключевые термины:**

| Категория | Что искать |
|-----------|------------|
| **Технологии** | Языки, фреймворки, БД, инструменты |
| **Домены** | Бизнес-области проекта |
| **Проблемы** | Ошибки, исправления, workarounds |
| **Паттерны** | Повторяющиеся подходы в коде |

**Формат вывода:**
```
📊 Контекст сессии:
- Технологии: [...]
- Домены: [...]
- Проблемы: [...]
- Паттерны: [...]
```

### Шаг 2: Динамический поиск (3 запроса параллельно)

**Построить query из контекста сессии (Шаг 1.5) + базовые термины:**

```javascript
// Вставить термины из контекста сессии
discovery_query = "<технологии> <домены> pattern architecture how-it-works"
decision_query = "<домены> <паттерны> principle workflow decision"
bugfix_query = "<проблемы> mistake wrong gotcha avoid"

// 1. Паттерны и архитектура (🔵 discovery)
search({
  query: discovery_query,
  obs_type: "discovery",
  project: "<имя проекта>",
  limit: 15
})

// 2. Решения и принципы (⚖️ decision)
search({
  query: decision_query,
  obs_type: "decision",
  project: "<имя проекта>",
  limit: 10
})

// 3. Anti-patterns из багфиксов (🔴 bugfix)
search({
  query: bugfix_query,
  obs_type: "bugfix",
  project: "<имя проекта>",
  limit: 10
})
```

### Шаг 2.5: Fallback (если 0 результатов)

**Если project filter дал 0 результатов по ВСЕМ 3 запросам:**

```javascript
// Повторить без project — cross-project search
search({ query: discovery_query, obs_type: "discovery", limit: 15 })
search({ query: decision_query, obs_type: "decision", limit: 10 })
search({ query: bugfix_query, obs_type: "bugfix", limit: 10 })
```

**Пометить результаты:** `⚠️ Cross-project` в колонке "Источник".

> **ВАЖНО:** Параметр `obs_type`, НЕ `type`!

### Шаг 3: Показать режим работы (предварительный)

**Вывести предварительный статус памяти:**

| Результат | Что показать |
|-----------|--------------|
| ✅ Найдено N записей | `🧠 Память: N записей (project: <имя>)` |
| ⚠️ Все 3 запроса пусты | `🧠 Память: нет данных` |
| ❌ MCP недоступен | `🧠 Память: MCP недоступен` |

> **Финальная строка режима выводится ПОСЛЕ Phase -0.5** (когда известен статус insights).

### Шаг 4-5: Scoring и Timeline

См. основную документацию по scoring (relevance 40%, recency 30%, impact 20%, type 10%) и timeline enrichment.

---

## Phase -0.5: Insights Context — КРОСС-СЕССИОННЫЕ ПАТТЕРНЫ

> **Claude Code only.** Использует skill `/deep-insights` для глубокого анализа кросс-сессионных данных.
> Пропускается автоматически если данные отсутствуют или платформа — Cursor.

### Шаг 1: Invoke Deep Insights Skill

**Вызвать skill через Skill tool:**

```
Skill("deep-insights")
```

Skill выполняет:
- Агрегацию ALL facets JSON (~50+ файлов) из `~/.claude/usage-data/facets/`
- Кросс-корреляцию friction↔outcome
- Анализ tool errors и workflow patterns
- Чтение report.html для CLAUDE.md suggestions и big wins

**Если skill недоступен** (не установлен или ошибка):
→ Fallback к прямому чтению report.html (легаси-режим, см. ниже).

### Шаг 2: Consume Structured Output

Skill возвращает structured analysis:

| Секция | Что получаем | Как использовать |
|--------|-------------|-----------------|
| `Freshness` | status, date range, N sessions | Определяет `insights_mode` (fresh/stale/missing) |
| `Friction Trends` | type, count, trend, correlated_outcome | Pre-candidates: 🔴 antipattern / ⚠️ gotcha |
| `Satisfaction` | happy/satisfied/frustrated + trend | Context для общей оценки |
| `Tool Errors` | error pattern, count, suggested_gotcha | Готовые gotcha pre-candidates |
| `Workflow Insights` | finding + rule_candidate | Pattern/checklist pre-candidates |
| `Quantitative Evidence` | total_sessions, success_rate, avg_friction | Scoring bonus в Phase 2 |
| `CLAUDE.md Suggestions` | suggestion text + priority | HIGH priority pattern candidates |

**Если статус `missing`:**
```
📊 Insights: недоступен (данные не найдены)
💡 Совет: запустите /insights для генерации кросс-сессионного анализа
```
- `insights_mode = "unavailable"`
- Перейти к Phase 0 без задержки

### Шаг 3: Generate Pre-candidates

Для каждого friction trend с `trend=rising` или `count >= 3`:
```
📊 Insights находка: "<friction type>"
   Секция: Friction Trends
   Контекст: "<count> occurrences, trend: <trend>, correlates with <outcome>"
   Релевантность сессии: <HIGH|MEDIUM|LOW>

🔄 Предварительная оценка:
├── Тип: 🔴 antipattern | ⚠️ gotcha
├── Название: <kebab-case>
└── Суть: <1 предложение>
```

Для каждого tool error с `count >= 3`:
```
📊 Insights находка: "<error pattern>"
   Секция: Tool Errors
   Контекст: "<count> occurrences"
   Готовый gotcha: <suggested_gotcha>
```

Для каждого workflow insight с rule_candidate:
```
📊 Insights находка: "<finding>"
   Секция: Workflow Insights
   Rule candidate: <rule_candidate>
```

Для каждого CLAUDE.md suggestion с priority HIGH:
```
📊 Insights находка: "<suggestion text>"
   Секция: CLAUDE.md Suggestions
   Priority: HIGH — готовая формулировка правила
```

**Оценка релевантности** — соответствие keywords из Phase -1 Шаг 1.5:
- **HIGH**: Прямое совпадение с технологиями/доменами/проблемами сессии
- **MEDIUM**: Тот же домен, но другая конкретная проблема
- **LOW**: Общее воркфлоу-улучшение без привязки к сессии

### Шаг 4: Deduplication with Session Findings

При обработке в Phase 1.5:
- Если insights-находка совпадает с session-находкой → **MERGE** (session = primary, insights = доп. evidence: "также наблюдалось кросс-сессионно")
- Если insights-находка НЕ имеет session-overlap → независимый кандидат с источником `📊 insights`

### Шаг 5: Unified Mode Display

**ПОСЛЕ Phase -0.5 вывести финальную строку режима:**

```
🔍 Режим: Full (память + сессия + insights)
├── 🧠 Память: N записей (project: <имя>)
├── 📊 Insights: Fresh (Feb 15-22) — N сессий, M находок
└── 📍 Сессия: анализ текущей

📊 Контекст сессии:
- Технологии: [...]
- Домены: [...]
- Проблемы: [...]
- Паттерны: [...]
```

**Варианты режима:**

| Память | Insights | Режим |
|--------|----------|-------|
| ✅ есть | ✅ fresh/stale | `Full (память + сессия + insights)` |
| ✅ есть | ❌ нет | `Full (память + сессия)` |
| ❌ нет | ✅ fresh/stale | `Insights + Session` |
| ❌ нет | ❌ нет | `Session-only` |

### Fallback: Legacy Mode (без skill)

Если `/deep-insights` skill недоступен, использовать прямое чтение:

```javascript
Read("~/.claude/usage-data/report.html")
```

Извлечь данные из HTML секций:
| HTML секция | CSS класс | Что извлекать |
|-------------|-----------|---------------|
| Friction categories | `.friction-category` | `.friction-title` + `.friction-desc` |
| CLAUDE.md suggestions | `.claude-md-item` | `data-text` + `.cmd-why` |
| Big wins | `.big-win` | `.big-win-title` + `.big-win-desc` |
| Usage patterns | `.pattern-card` | `.pattern-title` + `.pattern-summary` |

---

## Phase 0: Изучение структуры rules — ДЕРЕВО ФАЙЛОВ

**Выполнить:** `Glob(".claude/rules/**/*.md")`

**Формат вывода — дерево с реальными именами файлов:**

```
## 📂 Существующие rules (N файлов)

.claude/rules/
├── antipatterns/       # ЧТО НЕ ДЕЛАТЬ
├── patterns/           # КАК ДЕЛАТЬ ПРАВИЛЬНО
├── checklists/         # СПИСКИ ПРОВЕРОК
├── <category>/
│   └── ...
└── *.index.md
```

---

## Phase 0.5: Domain Detection — CONTEXT MAP

Определи домены проекта ДО оценки кандидатов (используется в DOMAIN_MATCH и REUSABILITY).

**Источники доменов:**
1. Имена существующих rules (имена файлов внутри `.claude/rules/`).
2. Контекст сессии из Phase -1 (технологии, домены, паттерны).
3. Файлы проекта и зависимости (например `*.csproj`, `docker-compose.yml`, `package.json`).

**Формат вывода:**
```
Project domains: [zoho, ef-core, postgres, docker, csharp]
```

**Правило:** domain-specific = OK, если домен есть в `Project domains`.

---

## Phase 1: Session Analysis

Проанализируй **каждый turn** разговора от начала до этой команды:

**Что искать:**
- 🟢 **Успехи**: Какие паттерны привели к правильному решению?
- 🔴 **Ошибки и исправления**: Где подход провалился? Что исправил пользователь?
- 📁 **Файлы**: Какие файлы обсуждались? Какие паттерны в них?
- 🔧 **Решения**: Какие архитектурные решения были приняты?
- 📚 **Domain knowledge**: Какие специфические знания о проекте раскрыты?
- 🔁 **Повторные итерации**: одна и та же команда/аргументы исправлялись ≥3 раз
- ⏱️ **Потеря времени**: одна ошибка заняла >5 минут или 4+ turn
- 🧰 **CLI-команды**: повторные ошибки в `curl`, `docker`, `kubectl`, `psql`

---

## Phase 1.5: Abstraction Layer — ИЗВЛЕЧЕНИЕ АНТИПАТТЕРНОВ

> **КРИТИЧНО**: Для каждой "сырой находки" задать вопросы абстрагирования.
> Даже специфичный фикс может содержать универсальный антипаттерн!

### Вопросы абстрагирования

Для каждой находки из Phase 1:

| # | Вопрос | Зачем |
|---|--------|-------|
| 1 | Что сломалось/не работало? | Определить проблему |
| 2 | КАК решали? | Выявить подход |
| 3 | Это хороший подход? | Оценить качество решения |
| 4 | Как НАДО было? | Найти правильный паттерн |
| 5 | Что извлечь на будущее? | Сформулировать rule/antipattern |

### Спец-триггер: повторные команды и time-waste

Если одна и та же команда/аргументы исправлялись ≥3 раз или ошибка заняла >5 минут:
- Всегда извлекай ⚠️ gotcha `command-retry-gotcha`
- Если это `curl` — дополни 📋 checklist `curl-args-checklist`

### Формат вывода

```
📍 Сырая находка: "<описание из сессии>"
   Источник: turn #N, "<цитата>"

🔄 Абстрагирование:
├── Что сломалось? → <проблема>
├── Как решали? → <подход>
├── Это хорошо? → ✅ ДА / ❌ НЕТ (антипаттерн)
├── Как надо? → <правильный подход>
└── Извлечь: <тип> "<название>"

📤 Кандидат:
├── Тип: 🔴 antipattern | 🟢 pattern | 📋 checklist | ⚠️ gotcha
├── Название: <kebab-case>
├── Путь: .claude/rules/<категория>/
└── Суть: <1 предложение>
```

### Пример трансформации

```
📍 Сырая находка: "исправил model_ratio напрямую в prod MySQL"
   Источник: turn #12, "UPDATE options SET value = '{"gpt-5-image": 0.005}'"

🔄 Абстрагирование:
├── Что сломалось? → Pricing новых моделей был неправильный
├── Как решали? → Прямой UPDATE в production базе
├── Это хорошо? → ❌ НЕТ — антипаттерн!
├── Как надо? → Через миграции/API/конфиг с версионированием
└── Извлечь: antipattern "no-direct-prod-db-edits"

📤 Кандидаты:

1. 🔴 no-direct-prod-db-edits (antipatterns/)
   Суть: "Никогда не редактируй production базу напрямую"

2. 📋 new-model-pricing-checklist (checklists/)
   Суть: "При добавлении модели: проверь ratio, tier, limits"
```

### Категории извлечения

| Категория | Папка | Когда использовать |
|-----------|-------|-------------------|
| 🔴 **Antipattern** | `antipatterns/` | Что НЕ делать (плохой подход из сессии) |
| 🟢 **Pattern** | `patterns/` | Как делать правильно |
| 📋 **Checklist** | `checklists/` | Список проверок для повторяющихся задач |
| ⚠️ **Gotcha** | `gotchas/` | Подводные камни, неочевидные нюансы |

---

## Phase 2: Quality Ranking — CATEGORY-BASED

> **Принцип:** Phase 1.5 уже определила ценность кандидата. Phase 2 — **ранжировщик**, а не привратник. Задача — упорядочить кандидатов по score, а НЕ отсеять. REJECT — только для дубликатов, тривиалок и бессмыслиц. Если кандидат предотвращает реальную проблему из сессии — он НЕ может быть REJECT.

**Для каждого кандидата:**
1. Определи тип (🔴 antipattern | 🟢 pattern | 📋 checklist | ⚠️ gotcha).
2. Используй соответствующую таблицу критериев.
3. Просуммируй баллы (max 100).
4. **АРИФМЕТИЧЕСКАЯ ПРОВЕРКА:** пересчитай сумму вручную и убедись что C1 + C2 + C3 + C4 = TOTAL.

**Общее правило начисления баллов:**
- Полное соответствие: +полный вес
- Частичное соответствие: +половина веса (округление вниз)
- Нет соответствия: +0

### Категория: Antipattern

**Главный вопрос:** предотвращает ли повторение ошибки?

| Критерий | Вес | Подсказка |
|----------|-----|----------|
| PREVENTS | 40 | Предотвращает конкретную проблему |
| SEVERITY | 30 | Критичность: data loss > time waste > inconvenience |
| ACTIONABLE | 20 | Понятно что НЕ делать и что делать вместо |
| UNIQUE | 10 | Не дублирует тот же аспект |

**SEVERITY шкала:** critical = 100%, medium = 50%, low = 0%.

### Категория: Gotcha

**Главный вопрос:** сохраняет ли неочевидное знание о проекте?

| Критерий | Вес | Подсказка |
|----------|-----|----------|
| PREVENTS | 35 | Предотвращает повторение confusion/ошибки |
| DOMAIN_MATCH | 35 | Совпадает с `Project domains` из Phase 0.5 |
| SELF_CONTAINED | 20 | Понятен без контекста сессии |
| UNIQUE | 10 | Не дублирует тот же аспект |

**PREVENTS подсказка:** если ошибка заняла >5 минут ИЛИ потребовала >3 итераций исправления — считать полным.
**DOMAIN_MATCH шкала:** прямое совпадение = 100%, смежный домен = 50%, нет = 0%.

### Категория: Checklist

**Главный вопрос:** упрощает ли повторяющуюся задачу?

| Критерий | Вес | Подсказка |
|----------|-----|----------|
| IMPACT | 40 | Сколько времени/итераций экономит чеклист |
| COMPLETENESS | 30 | Покрывает все важные шаги |
| ACTIONABLE | 20 | Пункты конкретные, проверяемые |
| UNIQUE | 10 | Не дублирует существующий checklist |

**IMPACT шкала:** >5 мин экономии или >3 итерации = 100%, 1-5 мин или 1-2 итерации = 50%, пренебрежимо = 0%.
**Подсказка:** Dockerfile-билд с 5 итерациями исправлений = 100% IMPACT, даже если задача встречалась 1 раз в сессии.

### Категория: Pattern

**Главный вопрос:** фиксирует ли правильный подход?

| Критерий | Вес | Подсказка |
|----------|-----|----------|
| ABSTRACTION | 35 | Принцип абстрагирован от конкретных имён |
| REUSABILITY | 30 | Применим к похожим ситуациям в домене проекта |
| CLARITY | 25 | Понятно когда и как применять |
| UNIQUE | 10 | Не дублирует существующий pattern |

**REUSABILITY подсказка:** domain-specific паттерн = полный балл (30), если домен есть в `Project domains` из Phase 0.5. `.claude/rules/` — это именно место для проектных знаний, domain-specific НЕ штрафуется.

**Confidence = сумма баллов (max 100) + бонусы**

### Бонусы из Deep Insights

| Бонус | Условие | Значение |
|-------|---------|----------|
| QUANTITATIVE_EVIDENCE | Кандидат подкреплён числами из deep-insights (success_rate, friction count) | +10 |
| RISING_FRICTION | friction_trends с trend=`rising` коррелирует с кандидатом | +10 к PREVENTS |
| TOOL_ERROR_MATCH | tool_errors из insights совпадает с gotcha-кандидатом | готовый pre-candidate |

**Бонусы НЕ увеличивают max выше 100** — они поднимают кандидата в ранжировании.

### Уровни confidence

| Уровень | Баллы | Действие |
|---------|-------|----------|
| 🟢 HIGH | 80-100 | Автоматически рекомендовать |
| 🟡 MEDIUM | 60-79 | Показать для выбора |
| 🟠 LOW | 40-59 | Показать с предупреждением |
| 🔴 REJECT | <40 | Отклонить (ТОЛЬКО дубликаты, тривиалки, бессмыслицы) |

### Формат проверки (с контекстом и пруфами)

```
<name> (Score: <N>/100, <LEVEL>)

📋 ЧТО ЭТО:
<описание что это за кандидат>

📍 ОТКУДА ВЗЯЛОСЬ:
<контекст из сессии — что делали, какая проблема>
Источник: turn #N, "<цитата>"

🔧 ЧТО ДЕЛАЛИ:
<код или действие из сессии>

✅/❌ ОЦЕНКА (критерии зависят от типа):
├── <CRITERION_1>: <оценка> (+<баллы>)
│   └── <пояснение с пруфом>
├── <CRITERION_2>: <оценка> (+<баллы>)
│   └── <пояснение>
├── <CRITERION_3>: <оценка> (+<баллы>)
├── <CRITERION_4>: <оценка> (+<баллы>)
├── СУММА: <C1> + <C2> + <C3> + <C4> = <TOTAL>/100
└── CONFIDENCE: <TOTAL>% → <LEVEL>

🔢 АРИФМЕТИЧЕСКАЯ ПРОВЕРКА:
<C1>(N) + <C2>(M) + <C3>(P) + <C4>(Q) = N+M+P+Q = TOTAL ✅/❌

💡 ЕСЛИ БЫ БЫЛО ПОЛЕЗНО:
<что могло бы стать rule/antipattern если абстрагировать>
```

---

## Phase 2.5: Duplicate Check — SMART MERGE

**Ключевой принцип:** дублирование = тот же аспект (одно и то же знание), а НЕ просто общий домен.

**Для каждого кандидата с confidence ≥40%:**

### Алгоритм проверки

1. **Поиск по имени:** Сравнить kebab-case название с файлами из Phase 0
2. **Поиск по содержимому:** Grep ключевых терминов в существующих rules
3. **Анализ совпадения:** Read похожий файл и определить аспект совпадения

### Статусы и действия

| Статус | Совпадение | Действие |
|--------|------------|----------|
| 🆕 NEW | <30% | Создать новый файл |
| 🔀 MERGE | 30-80% | Дополнить существующий (смежный аспект) |
| ⚠️ DUP | >80% | Пропустить (тот же аспект) |

### Smart Merge стратегии

| Ситуация | Стратегия |
|----------|-----------|
| Новый пример | Добавить в секцию "Правильно/Неправильно" |
| Новый чеклист пункт | Добавить в секцию "Чеклист" |
| Новый аспект | Добавить новую секцию "## <Aspect>" |
| Уточнение | Дополнить существующий параграф |

### Примеры аспектов (НЕ дубликаты)

| Ситуация | Дублирование? |
|----------|---------------|
| `zoho-test-snapshot-usage` vs `zoho-ef-core-table-naming` | НЕТ (разные аспекты) |
| `postgres-case-sensitivity` vs `postgres-naming-gotcha` | Возможно MERGE (один аспект) |
| `no-direct-prod-edits` vs `no-manual-sql-prod` | ДА (тот же аспект) |

---

## Phase 3: Index Output — STREAMLINED

**Формат вывода:**

```
## 🎯 Найдено: N rules + M antipatterns

### 🟢 Рекомендовано (HIGH confidence, 80-100)

| # | Название | Тип | Score | Источник | Статус |
|---|----------|-----|-------|----------|--------|
| 1 | <name>   | 🔴 antipattern | 95% | 📍 turn #12 | 🆕 NEW |
| 2 | <name>   | 🟢 pattern | 85% | 🧠 #163 | 🔀 MERGE |
| 3 | <name>   | ⚠️ gotcha | 82% | 📊 insights | 🆕 NEW |

### 🟡 Для выбора (MEDIUM confidence, 60-79)

| # | Название | Тип | Score | Источник | Статус |
|---|----------|-----|-------|----------|--------|
| 4 | <name>   | 📋 checklist | 78% | 📍 turn #5 + 📊 | 🆕 NEW |

### 🟠 С предупреждением (LOW confidence, 40-59)

| # | Название | Тип | Score | Источник | Статус | Предупреждение |
|---|----------|-----|-------|----------|--------|----------------|
| 5 | <name>   | ⚠️ gotcha | 45% | 📍 turn #8 | 🆕 NEW | Низкий SELF_CONTAINED |
| 6 | <name>   | 🟢 pattern | 42% | 📊 insights ⚠️ | 🆕 NEW | Stale insights (5d) |

### 🔴 Отклонены (REJECT, <40 — только дубликаты/тривиалки)

| - | Название | Score | Причина |
|---|----------|-------|---------|
| - | <name>   | 25%   | Дубликат существующего rule |

### Детали

**1. no-direct-prod-db-edits** (🔴 antipattern, 95%)
- **Что:** Запрет прямого редактирования production базы
- **Откуда:** turn #12 — исправляли pricing через UPDATE в prod MySQL
- **Почему важно:** Нет версионирования, нет отката, риск ошибки
- **Путь:** `.claude/rules/antipatterns/no-direct-prod-db.md`

---
**Выбор:** `1,2,3,4,...` | `all` | `recommended` | `0` (отмена)
```

**⏸️ СТОП: Ожидай выбор пользователя.**

---

## Phase 4: Rule Proposals — SMART GENERATION

**Для каждого выбранного правила/антипаттерна:**

### Принципы генерации

1. **Контекстуализация** — примеры из сессии, НЕ generic
2. **Абстрагирование** — принцип универсальный, примеры конкретные
3. **Связывание** — ссылки на timeline (если есть связанные записи)

### Шаблон для Antipattern (scoped — с frontmatter)

> Если антипаттерн привязан к конкретным файлам/расширениям — добавь `paths:`.
> Если это общий принцип (безопасность, git workflow) — создавай БЕЗ frontmatter (global).

```markdown
---
paths:
  - "**/*.sql"
  - "**/migrations/**"
---

# <Название антипаттерна>

**НЕ ДЕЛАЙ ТАК** — <краткое описание почему плохо>

## Антипаттерн

<описание что это и почему плохо>

## Пример из практики

```<language>
// КАК ДЕЛАЛИ (плохо)
<код из сессии>
```

## Последствия

- <последствие 1>
- <последствие 2>

## Как правильно

```<language>
// КАК НАДО
<правильный подход>
```

## Чеклист

- [ ] Проверь что не делаешь <антипаттерн>
- [ ] Используй <правильный подход> вместо
```

### Шаблон для Pattern/Checklist (scoped — с frontmatter)

> Аналогично: `paths:` для scoped, без frontmatter для global.

```markdown
---
paths:
  - "src/**/*.ts"
---

# <Название>

<описание принципа>

## Правильно

```<language>
// пример из сессии
```

## Неправильно

```<language>
// антипаттерн из сессии
```

## Чеклист

- [ ] <пункт>
```

### Когда использовать frontmatter, а когда нет

| Тип правила | Frontmatter? | Пример |
|-------------|-------------|--------|
| Security, injection, OWASP | НЕТ (global) | `no-sql-injection.md` |
| Git workflow, commits | НЕТ (global) | `always-use-migrations.md` |
| Общий code style | НЕТ (global) | `no-empty-catch.md` |
| API-specific | ДА — `paths: ["**/api/**"]` | `api-error-format.md` |
| Database-specific | ДА — `paths: ["**/*.sql"]` | `no-direct-prod-db.md` |
| Test-specific | ДА — `paths: ["**/tests/**"]` | `test-naming.md` |
| Language-specific | ДА — `paths: ["**/*.ts"]` | `ts-strict-null.md` |

---

## Phase 5: File Creation

**По категории:**

| Тип | Путь |
|-----|------|
| 🔴 antipattern | `.claude/rules/antipatterns/<name>.md` |
| 🟢 pattern | `.claude/rules/patterns/<name>.md` |
| 📋 checklist | `.claude/rules/checklists/<name>.md` |
| ⚠️ gotcha | `.claude/rules/gotchas/<name>.md` |
| 📁 project-specific | `.claude/rules/<domain>/<name>.md` |

---

## Phase 6: Rules Optimization (АВТОМАТИЧЕСКИ)

> После создания правил в Phase 5 — автоматически оптимизировать ВСЕ rules в `.claude/rules/`.
> Phase 6 НЕ требует отдельного СТОП — выполняется как часть suggest-rules pipeline.
> Пользователь уже подтвердил rules в Phase 3/4. Phase 6 только оптимизирует форматирование.

### 6.1: Sync с актуальными доками (опционально)

Если нужно уточнить синтаксис frontmatter:
```
resolve-library-id("claude-code") -> query-docs(id, "rules frontmatter paths format")
```

### 6.2: Аудит

```bash
npx tsx .claude/skills/rules-optimizer/scripts/audit.ts --dir .claude/rules --save audit_before.json
```

Показать результат: файлы без paths, кандидаты на merge, антипаттерны.

### 6.3: Добавить path-scoped frontmatter

Для КАЖДОГО файла без `paths:` в frontmatter:
1. Прочитать содержимое
2. Определить paths по `references/path-inference-table.md`
3. Если правило **global** (безопасность, git workflow, общий стиль) — оставить без frontmatter
4. Если правило **scoped** — добавить YAML frontmatter с `paths:`

### 6.4: Исправить антипаттерны

```bash
npx tsx .claude/skills/rules-optimizer/scripts/check-antipatterns.ts --dir .claude/rules
```

Для каждого найденного — применить фикс из `references/known-antipatterns.md`.

### 6.5: Merge мелких файлов

Для merge-кандидатов из аудита:
- Подтвердить что файлы покрывают **один домен** с **пересекающимися paths**
- Объединить в основной файл + удалить дубликат
- **НЕ мержить** файлы с разными подсистемами (пример: `atomic-config-save` + `atomic-update-lock`)

### 6.6: Финальный отчёт

```bash
npx tsx .claude/skills/rules-optimizer/scripts/audit.ts --dir .claude/rules --save audit_after.json
npx tsx .claude/skills/rules-optimizer/scripts/report.ts --before audit_before.json --after audit_after.json
```

Показать summary что было оптимизировано.

---

## Секция: Antipatterns Detection — ОТДЕЛЬНАЯ КОНФИГУРАЦИЯ

> Эта секция легко дополняется новыми триггерами антипаттернов.

### Триггеры антипаттернов

| Триггер в сессии | Антипаттерн | Категория |
|------------------|-------------|-----------|
| "напрямую в prod" | no-direct-prod-edits | antipatterns/ |
| "UPDATE ... WHERE" на проде | no-manual-sql-prod | antipatterns/ |
| "захардкодил" | no-hardcoded-values | antipatterns/ |
| "костыль", "workaround" | document-tech-debt | gotchas/ |
| "потом исправлю" | no-deferred-fixes | antipatterns/ |
| "скопировал код" | no-copy-paste | antipatterns/ |
| "отключил тесты" | no-disabled-tests | antipatterns/ |
| "игнорируем ошибку" | no-silent-catch | antipatterns/ |
| "try {} catch {}" без обработки | no-empty-catch | antipatterns/ |
| "без миграции" | always-use-migrations | patterns/ |
| "руками проверил" | automate-checks | checklists/ |
| "повторял команду 3+ раз", "исправил команду с N-й попытки" | command-retry-gotcha | gotchas/ |
| "curl ... invalid argument", "curl: (3) URL malformed" | curl-args-checklist | checklists/ |

### Добавление нового триггера

Чтобы добавить новый триггер:

```markdown
| "<фраза из сессии>" | <kebab-name> | <категория>/ |
```

---

## Критические правила

1. **НЕ создавай автоматически** — только после явного выбора пользователя
2. **НЕ предлагай тривиальные** — Quality Filter обязателен
3. **ВСЕГДА абстрагируй** — Phase 1.5 обязательна
4. **ИЩИ антипаттерны** — даже в "успешных" фиксах
5. **ПРУФЫ обязательны** — цитаты и номера turn
6. **< 500 строк** — большие разбивай на несколько
7. **Self-contained** — понятно без контекста сессии
8. **Path-scoped frontmatter** — scoped rules создаются сразу с `paths:` в YAML frontmatter, global rules без frontmatter

---

## Execution Order (КРИТИЧНО)

```
1.  [АНАЛИЗ] Извлечение контекста сессии (Шаг 1.5)
2.  [TOOL] MCP search ×3 (динамический query из контекста)
3.  [TOOL] Fallback без project (если 0 результатов)
4.  [TEXT] Предварительный статус памяти
5.  [SKILL] Invoke /deep-insights (Skill tool)
6.  [TEXT] Phase -0.5: deep-insights output + unified mode display
7.  [TOOL] Glob rules
8.  [TEXT] Phase 0: дерево файлов
9.  [TEXT] Phase 0.5: domains (+ insights project areas)
10. [TEXT] Phase 1: анализ сессии (сырые находки)
11. [TEXT] Phase 1.5: Abstraction (session + insights находки!)
12. [TEXT] Phase 2: Quality Ranking (category scoring, confidence, ПРУФЫ)
13. [TEXT] Phase 2.5: Smart Merge
14. [TEXT] Phase 3: Streamlined таблицы (sources: 📍 📊 🧠)
15. [STOP] Ожидание выбора
16. [TEXT] Phase 4: Smart Generation (с path-scoped frontmatter)
17. [STOP] Ожидание подтверждения
18. [TEXT] Phase 5: создание файлов
19. [TOOL] Phase 6: audit.ts → аудит rules
20. [TOOL] Phase 6: check-antipatterns.ts → фиксы
21. [TEXT] Phase 6: добавление frontmatter + merge (silent, без STOP)
22. [TOOL] Phase 6: report.ts → финальный отчёт
```

**❌ ЗАПРЕЩЕНО:**
- Пропускать Phase 1.5 (Abstraction)
- Выводить без пруфов и контекста
- Отклонять без объяснения "что могло бы быть rule"
- Generic примеры вместо контекстных

---

## Начни

1. Извлечь контекст сессии → построить динамические query
2. MCP Search ×3 (с project) → если 0, fallback без project
3. Read insights report → Phase -0.5 (если доступен) → unified mode display
4. Phase 0 (дерево) → Phase 0.5 (domains + insights areas) → Phase 1 (сырые находки) → **Phase 1.5 (ABSTRACTION — session + insights!)** → Phase 2 (category scoring + пруфы) → Phase 2.5 (merge) → Phase 3 (таблицы)
5. **СТОП** — ждать выбор
6. Phase 4 (generation с frontmatter) → **СТОП** — ждать подтверждение
7. Phase 5 (создание) → Phase 6 (optimization — silent, без STOP)
