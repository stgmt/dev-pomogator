# Use Cases

## UC-1: AI-анализ провалившихся тестов @feature1

Разработчик видит в Analysis tab не просто группировку ошибок, а полноценный AI-анализ с code snippets и рекомендациями.

1. Тесты завершаются с failures
2. Analysis tab получает список failures из YAML v2
3. PatternMatcher сопоставляет каждую ошибку с паттернами из `patterns.yaml`
4. CodeReader извлекает code snippet (+-3 строки от error line)
5. Для каждого failure формируется v3 report: location, bdd_steps, log_context, matched_pattern
6. TUI отображает structured failure cards с hint по исправлению

**Edge cases:**
- Ошибка не матчится ни одним паттерном — показываем "Unknown" с raw error
- Файл не найден для code snippet — показываем только stack trace
- Много failures (100+) — пагинация, показ первых 20 с кнопкой "Show all"

## UC-2: Кликабельные пути в логах @feature2

Разработчик кликает по пути к файлу в логе — открывается файл в file explorer.

1. Logs tab получает строку лога
2. Regex детектор находит пути к файлам (Windows `D:\path\file.ts:42` и Unix `/path/file.ts:42`)
3. Путь рендерится как кликабельный виджет с CSS hover
4. По клику — `subprocess.Popen(["explorer", "/select,", path])` (Windows) или `xdg-open` (Linux)
5. Визуальный feedback: amber flash 0.3s

**Edge cases:**
- Путь не существует на диске — клик ничего не делает (no crash)
- Путь содержит пробелы — корректное экранирование
- Несколько путей в одной строке — все кликабельны

## UC-3: Test discovery до запуска @feature3

Разработчик видит список всех тестов до запуска и выбирает конкретные для запуска.

1. При открытии TUI (или по кнопке) запускается discovery
2. Discovery вызывает framework-specific команду (`vitest --list`, `jest --listTests`, `pytest --collect-only`, `dotnet test --list-tests`)
3. Парсит output в tree nodes (suite → test)
4. Tests tab показывает tree с checkbox рядом с каждым тестом
5. Разработчик отмечает нужные тесты
6. Запуск — только отмеченные тесты через framework filter

**Edge cases:**
- Discovery timeout (>30s) — показать warning, продолжить без tree
- Framework не поддерживает list — fallback на запуск всех тестов
- Пустой output — "No tests found" message

## UC-4: Сохранение состояния TUI между сессиями @feature4

Разработчик закрывает TUI и открывает заново — все настройки на месте.

1. При каждом действии (переключение таба, фильтр, expand/collapse) TUI обновляет state в памяти
2. Debounce (0.5s) собирает batch изменений
3. State записывается в `.dev-pomogator/.test-status/.tui-state.{session}.yaml`
4. При запуске TUI читает state file и восстанавливает: last tab, filter text, expanded nodes, scroll positions
5. Если state file не существует — defaults

**Edge cases:**
- Corrupted state file — fallback на defaults, silent reset
- State file от другой версии TUI — миграция или defaults
- Параллельные сессии — каждая со своим state file (session prefix)

## UC-5: Настраиваемые паттерны ошибок @feature5

Разработчик добавляет свои паттерны для проектного error matching.

1. TUI при запуске загружает built-in `patterns.yaml` из расширения
2. Ищет user override файл `.dev-pomogator/patterns.yaml` в проекте
3. User patterns мержатся с built-in (user has priority)
4. PatternMatcher использует объединённый список: regex match → keyword ALL match → first wins
5. В Analysis tab matched patterns показывают id + hint

**Edge cases:**
- Invalid regex в user YAML — skip pattern, log warning
- Дублирующий id — user override перезаписывает built-in
- Пустой patterns.yaml — fallback на built-in only

## UC-6: Запуск TUI по комбинации клавиш с auto-run @feature6

Разработчик нажимает комбинацию клавиш в Claude Code — TUI открывается с авто-запуском тестов.

1. Keybinding зарегистрирован в `~/.claude/keybindings.json`
2. При нажатии Claude Code запускает launcher.ts
3. Launcher детектирует Python, проверяет Textual
4. Spawns TUI detached с `--run` flag (auto-start tests)
5. Опционально `--filter "pattern"` для запуска подмножества
6. TUI стартует в Monitoring tab, показывает прогресс
7. Single instance protection — если TUI уже запущен, фокус переключается на него

**Edge cases:**
- Python не установлен — показать сообщение "Python 3.9+ required"
- Textual не установлен — предложить авто-установку
- Порт занят / lock file от crashed процесса — cleanup stale lock

## UC-7: Экспорт скриншота TUI в SVG @feature7

Разработчик экспортирует текущее состояние TUI для шаринга.

1. Нажимает keybinding в TUI (например `s` или специальная кнопка)
2. `export_screenshot()` (Textual built-in) генерирует SVG
3. SVG сохраняется в `logs/screenshots/tui-screenshot-{timestamp}.svg`
4. Путь к SVG копируется в clipboard (Windows: Set-Clipboard, macOS: pbcopy, Linux: xclip)
5. Notification: "Screenshot saved & path copied!"

**Edge cases:**
- Clipboard недоступен — только сохранить файл, без копирования
- Директория logs/screenshots/ не существует — создать автоматически
- Очень длинный вывод — SVG может быть большим (>5MB), без ограничений
