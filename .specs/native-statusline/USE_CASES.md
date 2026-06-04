# Use Cases

Домен: NATIVE Claude Code statusLine (ccstatusline). Каждый UC связан с одной/несколькими User Stories.

## UC-1: Авто-установка при первой сессии после install (happy path) — US1 @feature1

**Actor:** Новый пользователь dev-pomogator.
**Precondition:** `~/.claude/settings.json` без поля `statusLine`; плагин включён; `DEV_POMOGATOR_STATUSLINE` не задан.

- Пользователь делает `/plugin install dev-pomogator@stgmt` + reload/restart.
- Стартует новая сессия → срабатывает native-statusline SessionStart-хук.
- Reconciler видит пустой слот → пишет `statusLine.command = "npx -y ccstatusline@latest"` (atomic).
- Хук возвращает `systemMessage`: строка подключена, появится со следующей сессии.
- **Результат:** В settings.json есть наш statusLine; на следующей сессии строка видна.

## UC-2: Сохранение чужого кастомного statusLine — US2 @feature2

**Actor:** Пользователь со своей строкой.
**Precondition:** settings.json содержит `statusLine.command` без нашего ownership-маркера.

- Сессия стартует → хук → reconciler классифицирует слот как `keep-user`.
- Записи нет.
- **Результат:** Чужая строка сохранена байт-в-байт.

## UC-3: Немедленное применение через doctor — US3 @feature3

**Actor:** Пользователь, не желающий ждать следующую сессию.
**Precondition:** settings.json без statusLine.

- Пользователь запускает `/pomogator-doctor`.
- Check «statusLine отсутствует» → предлагает fix-action.
- Пользователь применяет → тот же writer пишет в settings.json немедленно.
- **Результат:** statusLine записан в текущей сессии (по явному действию).

## UC-4: Полное отключение авто-записи — US4 @feature4

**Actor:** Пользователь, не желающий записи в глобальный конфиг.
**Precondition:** `DEV_POMOGATOR_STATUSLINE=off`; settings.json без statusLine.

- Сессия стартует → хук читает env=off → выходит без записи.
- **Результат:** settings.json не тронут.

## UC-5 (edge): Повторный запуск — идемпотентность — US5 @feature5

**Precondition:** statusLine уже стоит (наш маркер).

- Хук запускается повторно → reconciler `noop` → записи нет.
- **Результат:** Файл не изменён (mtime прежний), нет disk churn, нет лишнего `systemMessage`.

## UC-6 (edge): Битый settings.json — fail-open — US5

**Precondition:** settings.json содержит невалидный JSON.

- Хук пытается распарсить → ошибка ловится → лог в stderr, `exit 0`, мутации settings нет.
- **Результат:** Сессия не заблокирована; конфиг не повреждён.

## UC-7 (edge): Отсутствует ~/.claude/settings.json — US1

**Precondition:** Файла settings.json нет вовсе.

- Хук читает «пусто» → создаёт settings.json с одним полем `statusLine` (atomic) при default-on.
- **Результат:** Валидный settings.json создан только с нашим statusLine; ничего чужого не затёрто.
