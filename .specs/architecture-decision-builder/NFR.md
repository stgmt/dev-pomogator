# Non-Functional Requirements (NFR)

## Performance

- HTML render одной оси < 200ms (pure template-literal, без template engine).
- Live-fetch версий кешируется 24h в `.architecture-cache.json` — повторный запуск не бьёт сеть.
- Axis enumeration на PRD до ~3000 строк завершается < 2s (regex-based detection, без LLM-вызовов в helper-скрипте).

## Security

- HTML self-contained: inline CSS, без внешних `<link>`. Единственная опциональная сетевая зависимость — mermaid CDN, gated флагом `--no-mermaid` с ASCII fallback.
- Нет `eval`, нет инъекции user-data в `<script>` контекст (контент экранируется при вставке в HTML).
- Escape-log пишется append-only (O_APPEND) в `.claude/logs/` — нет перезаписи существующих записей.

## Reliability

- Skill stateless между вызовами — состояние в QUEUE.json; повторный вызов восстанавливает из файла.
- INDEX compile идемпотентен (AUTOGEN-маркеры) — повторный вызов не дублирует и не теряет user-контент.
- Browser launch ENOENT-safe — сбой открытия не роняет workflow, возвращает fallback-путь.
- Cascading cap (depth 2) + cycle detection — нет бесконечного loop при взаимно-зависимых осях.

## Usability

- Рекомендация визуально выделена (recommended-card pinned top) независимо от рандомизированного порядка вариантов в grid.
- Цветовая кодировка ✅ (Good) / ◐ (Neutral) / ❌ (Bad) для скан-чтения.
- AskUserQuestion шорткат `[Беру рекомендацию]` — юзер выбирает рекомендованный вариант одним кликом.
- HTML открывается в браузере автоматически — markdown глазами читать не нужно.
