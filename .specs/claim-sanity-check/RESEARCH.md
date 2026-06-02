# Research

## Контекст

Агент в Claude Code (на opus-4-7) делает hasty conclusions без проверки арифметики и единиц. Триггер-кейс: при VPN debug пользователь дебажил почему медленно (видеостри 167 MB + Claude API 139 MB + GitHub через один AWG/VPN до NL). Агент сказал "VPS bandwidth bottleneck". Пользователь поправил: "119 MB / 60s = 2 MB/s = 16 Mbps — это далеко не bottleneck для VPS". Юзер тратит время вылавливая такие ошибки руками — нужно **автоматическое самопроверка КАЖДОГО финального ответа**, чтобы агент сам ловил численные/факт-фейлы до показа.

> Status: **TODO (реактивировано 2026-06-01)**. Было «отложено»; вернули два новых инцидента того же класса (см. Incident Log ниже). Phase всё ещё Discovery — implementation не начата. Трекинг-issue: [stgmt/dev-pomogator#35](https://github.com/stgmt/dev-pomogator/issues/35).

## Incident Log

> Реактивировано 2026-06-01 двумя инцидентами того же класса (агент выдал непроверённое за факт под давлением «дай ответ»). Оба — в задаче «закупка DDR5 из Китая под перепродажу».

### INC-1 (2026-06-01) — AliExpress: плитка выдачи ≠ карточка товара

- **Заявил как ФАКТ**: «AliExpress, стор KingBank — 32GB DDR5 = €124-143, free shipping в РФ, buyer protection».
- **Реальность**: €123 считано с плитки мультиёмкостного SKU (цена = самый дешёвый 16GB-вариант, не 32GB); карточка не открыта; «шлёт в РФ» додумано из бейджа «free shipping». На запрос ссылки реальный DOM показал SKU $487-617 — арбитраж не сходится (закуп > перепродажи).
- **Класс провала**: source-grade (tile ≠ product card) + wishful-default (под давлением «дай дешёвый канал» взял желаемое).
- **Гейт сработал, но поздно**: pinator Stop-hook фаернул по слову «найдено» — ПОСЛЕ показа фейка, случайным regex, не по распознаванию прайс-claim'а.

### INC-2 (2026-06-01) — ZOL: заголовок ≠ сделка + неправдоподобный набор цен

- **Заявил**: таблицу каталожных цен ZOL по 引用价 (reference). Числа (¥479 и т.п.) — НЕПРОВЕРЕННЫЕ, из моего же дампа, не факт.
- **Два провала**:
  1. **Заголовок ≠ сделка**: 引用价 (справочная/промо/исторический-минимум) ≠ 商家报价 (реальные офферы дистрибьюторов, ~×2 выше). «Открой карточку» из INC-1 НЕ спасает — split живёт ВНУТРИ карточки.
  2. **Нет проверки правдоподобия НАБОРА**: премиальный Kingston FURY Beast 32GB в дампе стоил как бюджетная планка на китайских чипах. Человек ловит рефлексом; агент — нет. = ровно «claim sanity».
- **Инструментальный баг**: `zol_scan.py` системно тащит 引用价, не 商家报价 → скрипт сам зашивает занижение.
- **Класс провала**: headline-not-transactional + cross-claim plausibility (output-invariants, поднятые на факты) + автопилот-без-проверки.

### Общий корень (INC-1, INC-2 + триггер-кейс VPN)

Под давлением «дать ответ» агент оптимизирует «закрыть ход», а не «решить»; выдаёт самое дешёвое правдоподобное в надежде что прокатит; чинит только из-под пинка юзера. Все существующие защиты — advisory-текст или post-hoc Stop-хуки, заточенные под код/спеки; real-world-факт (цена/наличие/доставка) проходит без заслона.

## Источники

### Failure modes (must read перед designing)

- [anthropic/claude-code#8615](https://github.com/anthropics/claude-code/issues/8615) — Stop hooks async не sync, `decision:"block"` иногда не блокирует, создаёт concurrent streams. Closed "not planned".
- [HN 47895029](https://news.ycombinator.com/item?id=47895029) — **Claude 4.7 routinely ИГНОРИРУЕТ stop hooks**. Hook reason приходит как tool-result, модель тренирована считать untrusted (защита от prompt-injection). **Мы на opus-4-7 — критический риск что не сработает вообще.**
- [obra/superpowers#390](https://github.com/obra/superpowers/issues/390) — hook висит forever если Haiku API timeout. Обязателен `timeout 15s` + lock file.
- [claudefa.st changelog](https://claudefa.st/blog/guide/changelog) — 8-block hard ceiling: после 8 подряд блоков Anthropic forces turn end (configurable `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`).

### Production-репо и паттерны (10 решений, по убыванию мощи)

| # | Решение | Механизм | Cost/turn | Latency | Ловит арифметику? |
|---|---|---|---|---|---|
| 1 | [critic-orchestrator](https://github.com/aureliocpr-ctrl/critic-orchestrator) (MCP) | N parallel Claude CLI workers (falsification / counterexample / caller_verification) | ~$0.30 | ~60s | да, overkill |
| 2 | [O'Reilly Auto-Review](https://www.oreilly.com/radar/auto-reviewing-claudes-code/) | Stop hook → read-only Validator sub-agent (Sonnet) | ~$0.05 | 30-120s | да через LLM |
| 3 | [beast-plan](https://github.com/Chornomorets/beast-plan) | 5 actors: Researcher→Planner→Skeptic→TDD Reviewer→Critic | $$ | минуты | через Skeptic |
| 4 | [loopguard](https://github.com/yangyangnovelist-hub/loopguard) | 8-guardrail Ralph-loop + independent verifier | $$ | $$ | да |
| 5 | [claude-code-math-skills](https://github.com/lonexreb/claude-code-math-skills) | 7-agent Generator–Critic loop + **SymPy verifier (детерминистика)** | $ | 5-15s | **да детерминистически** ← наиболее близкое к кейсу |
| 6 | [disler/hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) | Builder/Validator dual sub-agent | $ | 30s+ | да через LLM |
| 7 | Stop hook + Haiku self-critique | одна Haiku call на финал | ~$0.002 | 3-15s | probabilistic |
| 8 | [Stop hook task enforcement](https://claudefa.st/blog/tools/hooks/stop-hook-task-enforcement) | базовый `decision:"block"` pattern | ~$0 | <1s | нет, для todo-completion |
| 9 | Sub-agent critic via Task tool с `stop_hook_active` guard | спавн Task на критику в Stop | ~$0.02 | 10-30s | да через LLM |
| 10 | Anthropic cookbook Reflexion-style | inline self-critique в system prompt | $0 | 0 | **anti-pattern** |

### Production-репо — раунд 2 (2026-06-01, octocode MCP)

Новые решения, почти не пересекаются с 10 выше; ближе к real-world-fact (не только арифметика). Глубина чтения помечена честно.

| Класс | Репо (⭐) | Механизм | Зубы | Читал |
|---|---|---|---|---|
| CC-хук | [set2374/claude-code-fact-verification-hook](https://github.com/set2374/claude-code-fact-verification-hook) (0) | UserPromptSubmit метит «требует проверки» → PostToolUse трекает реальный verify-tool → Stop блок факта без evidence/структуры (Bottom line/Verified facts/Sources) | Stop, по маркеру | код ядра |
| CC-хук | [naimkatiman/continuous-improvement](https://github.com/naimkatiman/continuous-improvement) (4, gateguard «7 Laws») | PreToolUse физически блок Edit/Write/Bash пока не предъявлен fact-list | PreToolUse blocking | README |
| CC-хук | [johnlindquist/plugin-doubt-gate](https://github.com/johnlindquist/plugin-doubt-gate) (3) | Stop: regex hedge-слов → «принеси конкретные доказательства» (= наш pinator/№7 выше) | Stop nudge | код |
| CC-хук | [LZong-tw/clawback](https://github.com/LZong-tw/clawback) (6); kirollosatef/customgpt-quadruple-verification (14) | verification loops / 4-cycle quality-gate | заявл. блок | описание |
| Framework | [NVIDIA-NeMo/Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) (6.3k); [guardrails-ai/guardrails](https://github.com/guardrails-ai/guardrails) (6.9k) | программируемые рейлы + fact-check/groundedness валидаторы | серверный, не для CC-чата | метадата |
| UQ | [cvs-health/uqlm](https://github.com/cvs-health/uqlm) (1.2k) | квантование неуверенности по claim'у → гейт low-confidence | research-grade | метадата |
| Rule-файлы (advisory) | odoo-mcp/.windsurfrules; church-volunteers/.windsurfrules; apache/pulsar AGENTS.md | «report ACTUAL value, cap confidence, cross-check twice»; «decompose claims, verify each, не делай вид что запускал»; «verify don't fabricate» | нет (текст) | сниппеты |

**Связь с 10 решениями выше**: те — про арифметику/код ([claude-code-math-skills](https://github.com/lonexreb/claude-code-math-skills) SymPy-детерминистик = лучший для VPN-кейса). Эти — про real-world-факт-проза (set2374 = лучший для INC-1/INC-2). Вывод сходится: **гибрид одного Stop-хука** — детерминистик-extractor (числа/единицы/правдоподобие набора) ПЛЮС evidence-tracking (открыт ли реальный источник в этой сессии).

### Anti-pattern (do NOT use)

- **Same-model self-critique в одном context window** → converges to "looks good to me". Источники: [nibzard/awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns) + 2026 papers. **External judge ≠ generator обязателен.**
- Inline reflection в system prompt без enforcement.
- Pure LLM judge без deterministic gate для verifiable domains.

### Research consensus 2025-26

Deterministic verifiers (RLVR, SymPy, pint) **>** LLM-as-judge для verifiable domains (math, units). LLM critic — только для prose/logic. Источники:

- AgentV-RL ([arXiv 2604.16004](https://arxiv.org/html/2604.16004v1), Apr 2026) — bidirectional multi-turn tool-augmented verifier; sufficiency+necessity test-time scaling.
- AgentPRM (ACM WebConf 2026) — step-wise Process Reward Models для агентов.
- SETS — parallel+sequential test-time computation, iterative verify-correct + majority voting.
- Gnosis (arXiv 20251223) — intrinsic self-verification через hidden-state signals, ~5M params, "negligible inference cost".
- LaSeR ([arXiv 2510.14943](https://arxiv.org/abs/2510.14943)) — last-token self-rewarding RL.
- SPOC ([arXiv 2506.06923](https://arxiv.org/pdf/2506.06923), Jun 2025) — solution+verification в одном inference pass.

## Технические находки

### Claude Code mechanism для per-response self-check

Hook на текст ответа агента, который **БЛОКИРУЕТ/правит прозу ДО показа — не существует** в Claude Code. (Перепроверено 2026-06-01 против [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — старая формулировка «ни один хук не трогает прозу» УСТАРЕЛА: список вырос до ~30 событий, появился **`MessageDisplay`** — фаерится «while assistant message text is displayed», МОЖЕТ заменить текст НА ЭКРАНЕ через `displayContent`, но **display-only**: транскрипт и то, что видит Claude, остаются оригиналом; блокировать не может.) Итог по сути держится — настоящий рычаг по-прежнему `Stop` hook (фаерится ПОСЛЕ генерации, может форсить продолжение, но не отозвать уже показанный текст). `MessageDisplay` — слабый новый рычаг: можно повесить на экран баннер `[UNVERIFIED]`, но это косметика, не гейт.

- Фаерится после того как Claude закончил говорить (covers tool-call и text-only turns).
- Возвращает `{"decision":"block","reason":"..."}` → Claude получает reason как контекст, делает новый turn.
- Должен проверять `stop_hook_active` flag — иначе бесконечный цикл.
- Hard cap **8 consecutive blocks** (Anthropic, May 2026), configurable.

Альтернативы `Stop`:

| Mechanism | Catches наш case? |
|---|---|
| `SubagentStop` | Только sub-agent output, не main thread |
| `PostToolUse` on TodoWrite | Misses pure conversational answers (нет tool call) |
| Sub-agent critic via Task tool | Высшая fidelity, высший cost/latency |
| MCP middleware (critic-orchestrator) | Сильно для code claims; слабо для generic chat |
| Deterministic Python verifier в hook (SymPy / pint) | **Best для "16 Mbps != bottleneck" кейса** |

### Аудит репо: что уже есть

| Артефакт | Тип | Скоуп | Hook на ответ? |
|---|---|---|---|
| `.claude/rules/plan-pomogator/proactive-investigation.md` | behavioral rule | требует evidence per claim | нет, контекстная установка |
| `.claude/rules/gotchas/verify-divergent-contracts.md` | behavioral rule | не удалять код чтоб тест прошёл без чтения обеих сторон | нет |
| `.claude/rules/pomogator/screenshot-driven-verification.md` | behavioral rule | описывать что видно vs ожидалось | нет |
| `.claude/skills/spec-review/` | manual skill | semantic review спек/кода, не reasoning агента | нет |
| `.claude/rules/auto-simplify/simplify-extended.md` + `simplify_stop.ts` | **Stop hook** | structural review кода/спек/тестов | да, но на код, не на текст |

**GAP:** нет hook который смотрит на natural-language ответ агента и блокирует если фигня. Инфра Stop hook (`simplify_stop.ts`) уже есть — паттерн знакомый.

### TOP-3 ranked решение для "на каждый ответ, low overhead, ловит арифметику/единицы"

**#1 — Hybrid Stop hook: deterministic extractor + Haiku critic [RECOMMENDED]**

- Python скрипт в Stop hook: regex extract числа+единицы (`\d+(\.\d+)?\s*(MB/s|Mbps|MB|GB|B|s|ms|min|%)`) → `pint` library для unit conversion → flag если численный claim несовместим с qualitative claim ("X MB/s = bottleneck" при X < 100)
- ТОЛЬКО при флаге зовёт Haiku с конкретным конфликтом
- Cost ≈ $0 обычно, ~$0.001 при флаге, latency <2s
- Адаптировано из [claude-code-math-skills](https://github.com/lonexreb/claude-code-math-skills) (SymPy паттерн)
- **Risk:** opus-4-7 ignores stop hooks (HN evidence) — нужно проверить эмпирически до постройки

**#2 — Sub-agent critic via Stop hook (model ≠ main)**

- Stop hook спавнит **Sonnet** критика (не Opus и не Haiku — разный модельный класс важен)
- Read-only tools, prompt: "Check arithmetic/units/load-bearing claims, return JSON `{ok, issues[]}`"
- ~$0.02-0.05/turn, latency 10-30s
- Принцип "evaluator ≠ optimizer"
- **Risk:** тот же ignore + latency на каждый turn раздражает

**#3 — critic-orchestrator MCP (для high-stakes only)**

- Не на каждый turn — $0.30 × every response = $$$
- Резерв для explicit "verify this" requests

## Где лежит реализация

- App-код: TBD (предполагаемо `extensions/{slug}/tools/{slug}/`)
- Конфигурация: TBD (Stop hook в `extension.json` → `.claude/settings.json`)
- Существующая Stop hook инфра для адаптации: `extensions/auto-simplify/tools/auto-simplify/simplify_stop.ts`

## Fix design — 3 столпа (из INC-1/INC-2, 2026-06-01)

Расширяет TOP-3 «гибрид Stop-hook» выше; добавляет real-world-fact слой к арифметическому.

1. **Verify-evidence gate** (из INC-1): на verification-sensitive ответе — был ли реально открыт источник (Read/WebFetch/browser product-card) в этой сессии, иначе факт → `[UNVERIFIED]`. Прямой порт паттерна set2374 (PostToolUse-tracker + Stop-gate). Это единственный столп с настоящими зубами.
2. **Transactional-not-headline** (из INC-2a): для цены last-mile = транзакционный оффер (商家报价 / живой продавец / в корзину), НЕ reference/MSRP/промо/исторический-минимум; обязан назвать ТИП цены. Преимущественно model-side (gameable); механически детектируемо только наличие метки `type:`.
3. **Plausibility / cross-claim gate** (из INC-2b): набор чисел проходит доменный smell-test перед выдачей (относительный порядок: премиум>бюджет; magnitude; подозрительно ровно/дёшево → re-verify). = `output-invariants-first`, поднятый на факты. Механизуемо частично: «таблица ≥3 чисел → форсить строку sanity-check» (наличие, не содержание).

**Зубы честно**: столпы 2-3 хук по СОДЕРЖАНИЮ не проверит (не знает, что FURY дороже KingBank) — форсится только НАЛИЧИЕ метки/блока. Настоящий гейт — только столп 1 (есть ли реальный verify-tool-call в сессии). Это тот же потолок, что во всём этом исследовании: hook не читает прозу ответа, только tool-следы.

## Выводы

1. **Hook на текст ответа агента не существует** — Stop hook единственный рычаг, и он async с известными bug-ами.
2. **Same-model self-critique = anti-pattern** — обязателен external judge (другая модель / детерминистика).
3. **Для арифметико-единичных ошибок** (наш триггер-кейс) детерминистика (pint/SymPy) бьёт LLM-as-judge по cost, latency, false-positive rate.
4. **BLOCKER до implementation:** эмпирически проверить игнорит ли opus-4-7 stop hooks как 4.7 на HN. Без этой проверки строить инфру преждевременно. (ОБНОВЛЕНО 2026-06-01: сессия теперь на **opus-4-8** — блокер перепроверить заново на 4-8; поведение stop-hook на новой модели могло измениться, нельзя переносить вывод с 4.7.)
5b. (2026-06-01) Эмпирический тест блокера **ОТЛОЖЕН по решению юзера** — изнутри этой сессии достоверно не проверить, слушает ли opus-4-8 stop-хук. Остаётся ОТКРЫТЫМ блокером до отдельного теста; не выкинут, не помечен как пройденный.
6. **Real-world-факт ≠ только арифметика** (INC-1/INC-2): исходный триггер был числа/единицы; новые инциденты добавили source-grade (плитка≠карточка), headline≠сделка и правдоподобие НАБОРА. Дизайн расширен до 3 столпов (см. выше).
5. **Шаблонная инфра уже есть** в репо (`auto-simplify` Stop hook) — низкая стоимость intergration если blocker снят.

## Открытые вопросы (требуют решения до Phase 2)

- **[BLOCKER]** Игнорит ли opus-4-7 stop hooks? Простой тест: hook возвращает `decision:"block"` `reason:"TEST"` → реакция Claude в фактическом ходе.
- Закрытый список units/conversions покрытия (MB↔Mbps↔Gbps, B↔KB↔MB↔GB, ms↔s↔min, %, ×) — scope чтобы не false-positive.
- Skip-условие когда в ответе нет numeric claims (regex pre-check для short-circuit).
- Что делать при `stop_hook_active` истинном (повторный fire) — пропускать или применять deterministic-only?
- Как обработать short answers ("ок", "понял") — короткий skip path.

## Project Context & Constraints

### Relevant Rules

> Phase 1.5 не запускался (фича отложена). Заполнить при возврате к работе.

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| TBD | TBD | TBD | TBD | TBD |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| auto-simplify Stop hook | `extensions/auto-simplify/tools/auto-simplify/simplify_stop.ts` | Stop hook handler pattern, `decision:"block"` + reason | Прямая инфра для адаптации |
| simplify-extended rule | `.claude/rules/auto-simplify/simplify-extended.md` | Behavioral rule для code review при Stop | Sibling pattern, dual-output (rule + hook) |

### Architectural Constraints Summary

Phase 1.5 не запускался. При возврате — full audit `.claude/rules/` + `extensions/*/extension.json`.

## Risk Assessment

> Заполняется через Skill `discovery-forms` при полном Phase 1 workflow. Здесь — preliminary list для контекста.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| opus-4-7 игнорирует Stop hooks как 4.7 (HN evidence) — фича не работает в принципе | High | High | Эмпирически проверить ДО implementation. Если игнорит — пересмотреть скоуп (PostToolUse / SubagentStop / другой подход). |
| False-positive блоки на legitimate short answers ("ок", "понял") — раздражение юзера, обход через игнор | Medium | Medium | Regex pre-check на numeric claims, short-circuit skip если нет цифр. Whitelist слов "примерно", "около". |
| Haiku timeout вешает hook (superpowers#390) | Medium | High | `timeout 15s` wrapper + lock file. Fail-open на timeout. |
| `stop_hook_active` infinite loop, упор в 8-cap | Low | High | Strict check `stop_hook_active` в первой строке скрипта, max 1 retry, hard exit. |
| Same-model self-critique converges to "looks good" (если выберем не hybrid а pure Haiku) | High | High | Не использовать pure LLM judge без deterministic gate. Hybrid обязателен. |
