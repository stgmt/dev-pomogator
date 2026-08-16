# Research

## Project Context & Constraints

### Existing Patterns & Extensions

- `tools/advisor/*` уже реализовано (PoC): Session Summary, MCP-тул, digest, bench. Спека фиксирует канонический статус и отрисовку во всех сессиях.
- `out-session-advisor` — внешний адвизор над чужими сессиями; не пересекается.
- Прочее: расписание прово — см. разделы ниже.

### Environment

- Windows; локальный proxy sub2api (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`, Anthropic-compatible `/v1/messages`). Нативный server-side advisor tool недоступен → client-side MCP-тул.

### Boundaries

- Часть канонического плагина dev-pomogator → работает во всех сессиях users; активация конфигом+env, fail-open.
- Изоляция от `out-session-advisor`: не пересекаться по путям/хукам/данным.

### Constraints

- BDD-тесты только в Docker (`docker-bdd.sh`); model-вызовы в тестах — через mock `callModel` (без сети).
- Fail-open обязателен: внешние гейты/модель могут падать; гейт summary защищает от расходов на пустые сессии.

## Контекст

Нужен in-session «умный адвизор» для Claude Code: модель-пара (executor сам зовёт сильного адвизора) + постоянная память сессии, чтобы каждая консультация не пересобирала полный транскрипт. Требование: работает во всех сессиях плагина, не стакается с существующим внешним `out-session-advisor`.

## Источники

- Anthropic docs: `code.claude.com/docs/en/advisor.md` + `platform.claude.com/.../advisor-tool` (семантика нативного server-side tool).
- Разбор бинаря `claude.exe` 2.1.219 (минфицированный исходник): `ne.push({type:"advisor_20260301", name:"advisor", model:_})`, системный промпт «# Advisor Tool», гейты самого Claude Code.
- Порт нативной Session Memory: `AUI-AI-squad/ccjr-state-manager` (10-секционный `summary.md`, гейт 5K/5K+3tools, Mode A/B, file_edit, cache_control).
- GitHub: `memctx` (26★), `claude-session-handoff`, `session-bandit` — идеи handoff-рубрик.
- Нативные репо: `out-session-advisor` (внешний нооу, ConPTY/stream-json) — НЕ трогаем, изолировать.

## Технические находки (с замеренными цифрами нашего PoC)

### Нативный advisor — server-side tool, у нас клиентский аналог

- Нативно: executor зовёт `advisor()` с пустым input, сервер сам передаёт полный диалог. Мы client-side: MCP-тул без параметров + `buildSummaryPacket`.

### Rolling summary — порт ccjr/нативной Session Memory

- 10 секций (Session Title / Current State / Task spec / Files&Functions / Workflow / Errors / Codebase Docs / Learnings / Key Results / Worklog), формат из `prompts.ts`.
- Гейт: init ≥5K content-token; update ≥5K роста **И** ≥3 tool calls (или последний ход без тулов).
- Замерено вживую: живая модель (gpt-5.6-luna) создала summary из реальной сессии, содержимое корректно (совпало с ходом: commit `14ad05c`, SPECGEN004_109/695). `[VERIFIED: live-summ-*.md]`

### Консультация через summary+delta — до ~9K× меньше входа

- `buildSummaryPacket`: 90 674 557 raw → 9 972 chars (mode='summary') `[VERIFIED: live]`.
- 109 099 raw → 2 288 chars (mode='summary') `[VERIFIED: offline e2e]`.
- Полный digest крупных сессий: 0.1-0.3% raw; сборка 310-1159ms (async git spawn, после оптимизации git-части 1041→189ms) `[VERIFIED: bench]`.

### Два бага, пойманных живым прогоном (не офлайн)

1. `maybeUpdateSummary` брал всю дельту с line=0 → 46k событий → таймаут. Фикс: bounded `delta.slice(-40)`.
2. `verifyStructure` требовал дословно все 10 italic-описаний → модель их переписывает → блокировал. Фикс: требовать только `#`-заголовки.

### Skeptic balanced vs strict

- `balanced` в ~2× короче (999-1559 vs 1827-2436 симв) и не подаёт «грязный git» как повод блокировать read-only задачу. `[VERIFIED: skeptic-ab на 4 реальных сессиях]`

### Изоляция от out-session-advisor

- `out-session-advisor` — внешний адвизор-мониторинг чужих сессий (stream-json/ConPTY, git add -A guard, parallel lock). Наш `inner-advisor` — внутренний in-session (summary/<sid>.md, Stop/MCP). Пути, хуки, данные не пересекаются. `[GAP: реализовано, требует BDD-проверки AC-7]`

## Заимствования из «ролевых» конкурентов (принято, внесено в спеkey FR-9)

Ресёрч коллег по РОЛИ адвизора (вторая модель-судья над исполнителем): Google `mantis` (security review, стадийный конвейер), `fable-lead` (оркестратор судит сильного исполнителя, gotcha из реальных прогонов), `pr-agent`/`agent-orchestrator`/`claude-skill-phase-review`.

| Приём | Откуда | Как в нашей спеке |
|---|---|---|
| Split review: researcher→review→critic («нашёл → проверил → отсеял») | mantis | стадийность внутри консультации вместо 1-проходного совета |
| Snapshot-персистенс (immutable сама-дата, таг версии) | mantis | усилить `summary/<sid>.md` версией снапшота при экстракции |
| Read-only адвизор по инструментам (не законодательно, по факту) | fable-lead gotcha | **AC-9**: у тула MCP нет Write/Edit/state-Bash; только чтение |
| Lineage-разнообразие судьи (sol-judge над luna-исполнителем) | fable-lead §5 | уже luna→sol; зафиксировано как преимущество |
| Re-delegate при провале, а не ручное вмешательство | fable-lead §5 | «верни на доработку» в совете; адвизор НЕ правит сам (AC-9b) |

Жёсткая позиция владельца: **inner-advisor — строго READ-ONLY**. Он ничего не пишет и не исполняет; единственный писатель семантлюки `summary.md`/state — Stop-hook (`session-summary.mjs`), адвизор их только читает.

## Интеграция MINDLAS (детерминированная метрика → совет адвизора)

MINDLAS (Evolutionairy-AI/MINDLAS, Apache-2.0) — безмодельный reliability-инструмент 4 гейджей из event-ledger. Не конкурирует с нашим модельным адвизором: MINDLAS даёт «термометрию» (ROT/VERIFY/BLAST/LOOP), мы — смысловую интерпретацию. Интеграция: `mindlas scorecard --json` (структур.) → секция `## MINDLAS METRICS` в пакете консультации перед советом; адвизор (sol) интерпретирует: ROT↑→«нужен context repair», VERIFY↑→«гоняй verify gate», BLAST↑→«разбей patch», LOOP↑→«останови retry». Проверено оффлайн: `mindlas scorecard --demo context_rot_alert --json` парсится (rot 100/100, 1 alert); продакшн берёт `--latest` (реальная MINDLAS-сессия под hooks), демо — только тест. Fail-open: mindlas нет/таймаут/без JSON → секция пропускается. [VERIFIED: parse/demo offline]

## Открытые вопросы (GAP)

- `cache_control` breakpoint: реализован в `callModel`, но хиты на sub2api не замерены (суб2api может игнорировать user-side breakpoint). Нужна живая проверка.
- `ADVISOR_SUMMARY_FORCE` — только для тестов/демо; решить судьбу в проде (вероятно выпилить из shipped).
- Полный live «Stop-hook→summary→консультация» в обычной сессии (не `-p`) не завершён из-за короткой тестовой сессии; гейт остановил (правильно). Требует длинной сессии.