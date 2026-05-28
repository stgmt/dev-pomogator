# Research

## Контекст

Агент в Claude Code (на opus-4-7) делает hasty conclusions без проверки арифметики и единиц. Триггер-кейс: при VPN debug пользователь дебажил почему медленно (видеостри 167 MB + Claude API 139 MB + GitHub через один AWG/VPN до NL). Агент сказал "VPS bandwidth bottleneck". Пользователь поправил: "119 MB / 60s = 2 MB/s = 16 Mbps — это далеко не bottleneck для VPS". Юзер тратит время вылавливая такие ошибки руками — нужно **автоматическое самопроверка КАЖДОГО финального ответа**, чтобы агент сам ловил численные/факт-фейлы до показа.

> Status: исследование собрано, фича отложена. Возврат — когда юзер скажет.

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

Hook на текст ответа агента **ДО показа юзеру — не существует** в Claude Code (verified против Anthropic docs). Единственный рычаг — `Stop` hook:

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

## Выводы

1. **Hook на текст ответа агента не существует** — Stop hook единственный рычаг, и он async с известными bug-ами.
2. **Same-model self-critique = anti-pattern** — обязателен external judge (другая модель / детерминистика).
3. **Для арифметико-единичных ошибок** (наш триггер-кейс) детерминистика (pint/SymPy) бьёт LLM-as-judge по cost, latency, false-positive rate.
4. **BLOCKER до implementation:** эмпирически проверить игнорит ли opus-4-7 stop hooks как 4.7 на HN. Без этой проверки строить инфру преждевременно.
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
