# Use Cases

## UC-1: Happy path — план не проходит Phase 2, deny содержит только релевантные промпты @feature1

Пользователь создаёт план для конкретной задачи, план не проходит Phase 2 валидацию (отсутствует Extracted Requirements), plan-gate выводит deny-сообщение с актуальными промптами текущей сессии для понимания контекста.

- Шаг 1: Пользователь начинает Claude Code сессию `session_id="abc-123"` и пишет «исследуй парсинг markdown в validate-plan.ts»
- Шаг 2: `prompt-capture.ts` (UserPromptSubmit hook) сохраняет промпт в `~/.dev-pomogator/.plan-prompts-abc-123.json`
- Шаг 3: Агент создаёт план но забывает секцию `### Extracted Requirements` под Context
- Шаг 4: Агент вызывает ExitPlanMode → `plan-gate.ts` (PreToolUse hook) валидирует план
- Шаг 5: Phase 2 валидация падает с ошибкой "Отсутствует подсекция ### Extracted Requirements"
- Шаг 6: `loadUserPrompts("abc-123")` читает `.plan-prompts-abc-123.json` и форматирует «Последние сообщения пользователя»
- Результат: Deny-сообщение содержит «1. «исследуй парсинг markdown в validate-plan.ts»» — единственный промпт текущей сессии, без чужого контекста

## UC-2: Background задача с task-notification — фильтрация системных псевдо-промптов @feature3

В сессии запущена background задача через Bash tool. Когда задача завершается, Claude Code инжектит в conversation `<task-notification>` сообщение как user message. Этот системный псевдо-промпт НЕ должен попадать в prompt cache.

- Шаг 1: Пользователь в активной сессии запускает background задачу `Bash(run_in_background: true)`
- Шаг 2: Background задача завершается, Claude Code генерирует user-message формата `<task-notification><task-id>x</task-id>...<status>completed</status></task-notification>`
- Шаг 3: `prompt-capture.ts` получает hook input с этим псевдо-промптом
- Шаг 4: Регекс `/^<task-notification\b/i` срабатывает, скрипт делает early return без записи
- Результат: Файл `.plan-prompts-{session_id}.json` НЕ содержит task-notification entry, deny-сообщение plan-gate показывает только реальные текстовые промпты пользователя

## UC-3: Параллельные сессии — изоляция кэшей @feature4

Две Claude Code сессии работают одновременно с разными `session_id` (разные проекты, разные терминалы). Каждая сессия должна иметь полностью изолированный prompt cache.

- Шаг 1: Сессия A с `session_id="aaa"` пишет промпт «refactor auth module»
- Шаг 2: Параллельная сессия B с `session_id="bbb"` пишет промпт «add Redis caching»
- Шаг 3: `prompt-capture.ts` создаёт два разных файла: `.plan-prompts-aaa.json` и `.plan-prompts-bbb.json`
- Шаг 4: В сессии B план не проходит Phase 2, plan-gate вызывает `loadUserPrompts("bbb")`
- Результат: Deny-сообщение сессии B содержит ТОЛЬКО «add Redis caching», без упоминания «refactor auth module» из сессии A

## UC-4: Legacy default.json — graceful degradation @feature4

У пользователя в `~/.dev-pomogator/` остался устаревший файл `.plan-prompts-default.json` от предыдущей версии prompt-capture (когда `conversation_id` field name был неправильный). Новая версия plan-gate НЕ должна читать этот legacy файл.

- Шаг 1: Пользователь обновляет dev-pomogator до версии с fix
- Шаг 2: В `~/.dev-pomogator/` остаётся старый `.plan-prompts-default.json` с накопленным мусором (5+ промптов из разных задач)
- Шаг 3: Пользователь создаёт новый план в новой сессии `session_id="new-session"`, план не проходит Phase 2
- Шаг 4: `loadUserPrompts("new-session")` ищет `.plan-prompts-new-session.json` — не находит (сессия только началась)
- Шаг 5: Функция возвращает пустую строку (нет fallback на most-recent файл, который раньше был source of bug)
- Результат: Deny-сообщение содержит пустую секцию «Последние сообщения пользователя» вместо мусора из legacy default.json. После 2 часов GC удалит legacy файл автоматически

## UC-5 (edge case): отсутствие session_id @feature2

Hook input не содержит `session_id` (теоретически возможно при ошибке Claude Code или старой версии). prompt-capture должен fail-safe не создавая default.json.

- Шаг 1: `prompt-capture.ts` получает hook input `{prompt: "user text"}` без `session_id`
- Шаг 2: Скрипт делает trim промпта и проверяет наличие `input.session_id`
- Шаг 3: `session_id` отсутствует → early return без записи в файл
- Результат: Никакой файл в `~/.dev-pomogator/` не создаётся, общий `default.json` НЕ возрождается, fail-open принцип сохранён (exit 0)

## UC-6 (defense in depth): plan-gate видит legacy mix данные @feature5

Даже если каким-то образом в файле `.plan-prompts-{id}.json` оказался mix реальных промптов и task-notification entries (legacy данные, баг в будущем capture-коде, ручное редактирование), plan-gate должен фильтровать task-notification на чтении.

- Шаг 1: Файл `.plan-prompts-mix.json` содержит entries `[{text: "<task-notification>...</task-notification>"}, {text: "real prompt 1"}, {text: "real prompt 2"}]`
- Шаг 2: plan-gate вызывает `formatPromptsFromFile` для этого файла
- Шаг 3: Функция фильтрует записи по regex `^<task-notification\b` оставляя только real prompts
- Результат: Deny-сообщение содержит «1. «real prompt 1» 2. «real prompt 2»» — task-notification entries полностью отфильтрованы
