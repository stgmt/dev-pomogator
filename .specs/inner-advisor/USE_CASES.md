# Use Cases

## UC-1: Сессия ведёт rolling summary (гейт + дельта)

Длинная сессия; на каждом Stop-hook проверяет гейт (контент-токены, tools) и при прохождении дельта (последние ≤40 событий) уходит на дешёвую модель, которая обновляет 10-секционный `summary.md` в `.dev-pomogator/advisor/`.

- Stop-hook считывает transcript, считает content-tokens, tool calls
- Гейт: init ≥5K / update ≥5K+3tools → если нет — skip (нет расходов)
- Дельта последних событий → gpt-5.6-luna → атомарная перезапись summary
- `verifyStructure` проверяет 10 заголовков; при потере — старая версия сохраняется
- Результат: summary переживает /compact и --resume

## UC-2: Агент сам консультируется через MCP-тул (self-invocation)

Агент вызвает `mcp__dev-pomogator-advisor__advisor` без параметров (модель решает сам). Консультация строится через `buildSummaryPacket`: если summary есть → summary + delta-хвост; иначе полный digest. Двухпроход: дешевая (luna) выжимка → сильная (sol) совет `balanced`.

- Агент видит тул и вызывает (nudge-промпт), без параметров
- Консультация из summary+delta / digest + repo-rules + self-check
- pass1: situation report; pass2: guidance 3-6 bullets
- Совет возвращается как tool_result; агент применяет

## UC-3: Fail-open и bounded-input при сбоях

Нет токена, таймаут, битый транскрипт, потеря структуры, недоступен lock — в любом случае адвизор не должен визеть и блокировать Stop/ход.

- Каждый компонент сик сингф identifier: `{}` / короткая ошибка
- Входы bounded: digest budget, delta ≤40, таймаут 30-45s
- Никаких бесконечных retry; стейт не портится атомарными записями

## UC-4: Плагинная регистрация в реальных сессиях (канонический установка)

Пользователь установил плагин через marketplace; тул и Stop-hook становятся доступны во всех его сессиях без ручных машинных путей.

- `hooks.json`/`.mcp.json`/plugin manifest: resolve от `CLAUDE_PLUGIN_ROOT`
- Новая сессия: MCP-тул доступен; длинный ход — Stop-hook обновляет summary
- Нет абсолютных путей `E:\repos\...` в shipped конфиге

## UC-5: Сосуществование с out-session-advisor

Внешний ноот (out-session-advisor) работает над сторонними сессиями; inner-advisor ведёт свою сессию. Оба активны без конфликтов.

- Пути разные: tools/advisor vs внешние; summary/<sid>.md vs чужие транскрипты
- Хуки разные: Stop/MCP (inner) vs подпроцессы внешнего запуска (out)
- Независимые конфиги; отсутствие shared-файлов/импортов