# Use Cases

## UC-1: Свежий отчёт insights доступен @feature1 @feature3 @feature4 @feature5 @feature6 @feature7

Разработчик запускает suggest-rules в Claude Code. Файл `~/.claude/usage-data/report.html` существует, end_date в пределах 3 дней от текущей даты.

- Phase -0.5 активируется после Phase -1 (Memory Context)
- Система читает report.html и извлекает friction categories, CLAUDE.md suggestions, big wins, usage patterns, project areas
- Для каждой извлечённой находки создаётся pre-candidate с оценкой релевантности (HIGH/MEDIUM/LOW) относительно контекста сессии
- Система выводит unified mode display с тремя источниками данных
- Pre-candidates передаются в Phase 1.5 (Abstraction) для обработки вместе с session findings
- В Phase 3 insights-кандидаты отображаются с маркером источника `📊 insights`

## UC-2: Устаревший отчёт insights (>3 дней) @feature2

Разработчик запускает suggest-rules в Claude Code. Файл report.html существует, но end_date старше 3 дней от текущей даты.

- Phase -0.5 активируется и читает файл
- Система определяет end_date из строки subtitle и вычисляет разницу с текущей датой
- Файл помечается как stale: `📊 Insights: устарел ({end_date}, {N}d ago) ⚠️`
- Данные всё равно извлекаются и используются
- ВСЕ insights-кандидаты из этого отчёта помечаются маркером `⚠️ stale`
- В Phase 3 источник отображается как `📊 insights ⚠️`

## UC-3: Отчёт insights отсутствует @feature2

Разработчик запускает suggest-rules в Claude Code. Файл `~/.claude/usage-data/report.html` не существует или Read возвращает ошибку.

- Phase -0.5 пытается прочитать файл
- Система получает ошибку чтения (file not found)
- Выводится сообщение: `📊 Insights: недоступен (отчёт не найден)` с советом запустить `/insights`
- `insights_mode` устанавливается в `"unavailable"`
- Выполнение продолжается к Phase 0 без задержки
- Unified mode display показывает insights как недоступные

## UC-4: Запуск в Cursor @feature10

Разработчик запускает suggest-rules в Cursor (платформа определяется по наличию Cursor-специфичного окружения или по версии команды).

- Phase -0.5 полностью пропускается без какого-либо вывода
- Никакие сообщения об insights не отображаются
- Unified mode display не содержит строки insights
- Команда работает идентично предыдущей версии без Phase -0.5

## UC-5: Insights-находка совпадает с session-находкой @feature9

Разработчик запускает suggest-rules. И в insights-отчёте, и в текущей сессии обнаружена одна и та же проблема (например, friction category "неправильное именование файлов" и ошибка именования в текущей сессии).

- Phase -0.5 создаёт pre-candidate из insights
- Phase 1 создаёт находку из сессии
- В Phase 1.5 при абстрагировании система обнаруживает пересечение
- Находки объединяются: session = primary source, insights = дополнительное evidence ("также наблюдалось кросс-сессионно")
- В Phase 3 объединённый кандидат показывает комбинированный источник `📍 turn #N + 📊`
- Score кандидата не удваивается, но evidence усиливается
