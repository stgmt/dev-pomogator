# Acceptance Criteria (EARS)

## AC-1 (FR-1): AI Test Analyst @feature1

**Требование:** [FR-1](FR.md#fr-1-ai-test-analyst-feature1)

WHEN тесты завершаются с failures AND Analysis tab активен THEN TUI SHALL отобразить structured failure cards с matched pattern id, hint, code snippet и location для каждого failure.

WHEN failures > 20 THEN TUI SHALL показать первые 20 failure cards с кнопкой "Show all ({total})".

## AC-1a (FR-1a): Pattern Matching @feature1

**Требование:** [FR-1a](FR.md#fr-1a-pattern-matching-feature1)

WHEN PatternMatcher получает error_type="TimeoutError" AND error_message="Operation timed out after 30s" THEN PatternMatcher SHALL вернуть pattern с id="timeout" AND hint, используя regex match.

WHEN PatternMatcher получает error с keywords "database" AND "sql" THEN PatternMatcher SHALL вернуть pattern с id="database_error", используя keyword ALL match.

WHEN error не матчится ни одним паттерном THEN PatternMatcher SHALL вернуть null AND failure SHALL отображаться как "Unknown" с raw error.

## AC-1b (FR-1b): Code Snippet Extraction @feature1

**Требование:** [FR-1b](FR.md#fr-1b-code-snippet-extraction-feature1)

WHEN failure содержит stack trace с file="auth.test.ts" AND line=42 THEN CodeReader SHALL вернуть строки 39-45 с маркером `→` на строке 42.

IF файл не найден в дереве проекта THEN CodeReader SHALL вернуть null AND failure card SHALL показать только stack trace.

## AC-1c (FR-1c): Structured Failure Reports (V3) @feature1

**Требование:** [FR-1c](FR.md#fr-1c-structured-failure-reports-v3-feature1)

WHEN failure card генерируется THEN report SHALL содержать все v3 поля: location (crash_point, call_tree), bdd_steps (context, failed), log_context (lines, content), matched_pattern (id, hint).

## AC-1d (FR-1d): LLM Pattern Generation @feature1

**Требование:** [FR-1d](FR.md#fr-1d-llm-pattern-generation-feature1)

WHEN PatternGenerator вызывается с новыми уникальными ошибками THEN generator SHALL отправить запрос в aipomogator.ru API AND вернуть GeneratedPattern[] с id, match/keywords, severity.

IF API недоступен THEN generator SHALL вернуть пустой список AND NOT прерывать runtime анализ.

## AC-2 (FR-2): Clickable File Paths @feature2

**Требование:** [FR-2](FR.md#fr-2-clickable-file-paths-feature2)

WHEN Logs tab отображает строку содержащую путь к файлу (Windows или Unix формат) THEN путь SHALL быть рендерен как кликабельный виджет с CSS hover.

WHEN пользователь кликает по пути THEN TUI SHALL открыть файл в file explorer (`explorer /select,` на Windows) AND показать amber flash 0.3s.

IF путь не существует на диске THEN клик SHALL быть no-op (без crash).

## AC-3 (FR-3): Test Discovery @feature3

**Требование:** [FR-3](FR.md#fr-3-test-discovery-feature3)

WHEN TUI запускается AND discovery поддерживается для текущего фреймворка THEN TUI SHALL выполнить framework-specific discovery command AND показать tree с checkbox в Tests tab.

WHEN пользователь отмечает тесты и запускает THEN TUI SHALL передать только выбранные тесты через framework filter (--grep для vitest, -k для pytest).

IF discovery command timeout (>30s) THEN TUI SHALL показать warning AND продолжить без tree (fallback на run all).

## AC-4 (FR-4): State Persistence @feature4

**Требование:** [FR-4](FR.md#fr-4-state-persistence-feature4)

WHEN пользователь переключает таб или изменяет фильтр THEN TUI SHALL записать state в `.tui-state.{session}.yaml` с debounce 0.5s.

WHEN TUI запускается AND state file существует THEN TUI SHALL восстановить last tab, filter text и expanded nodes.

IF state file повреждён THEN TUI SHALL использовать default state AND NOT показывать error.

## AC-5 (FR-5): Configurable Error Patterns @feature5

**Требование:** [FR-5](FR.md#fr-5-configurable-error-patterns-feature5)

WHEN TUI запускается THEN PatternMatcher SHALL загрузить built-in patterns.yaml AND user override `.dev-pomogator/patterns.yaml` (если существует), с приоритетом user patterns.

WHEN user pattern содержит invalid regex THEN PatternMatcher SHALL skip этот pattern AND log warning.

WHEN два паттерна имеют одинаковый id THEN user pattern SHALL заменить built-in.

## AC-6 (FR-6): Auto-Run & Keybinding Launch @feature6

**Требование:** [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6)

WHEN пользователь нажимает зарегистрированную комбинацию клавиш THEN Claude Code SHALL запустить launcher.ts AND launcher SHALL spawn TUI detached.

WHEN TUI запускается с `--run` flag THEN TUI SHALL автоматически начать запуск тестов.

IF TUI уже запущен (PID lock) THEN launcher SHALL NOT запускать второй экземпляр.

## AC-7 (FR-7): Screenshot/SVG Export @feature7

**Требование:** [FR-7](FR.md#fr-7-screenshotsvg-export-feature7)

WHEN пользователь нажимает keybinding для screenshot THEN TUI SHALL вызвать `export_screenshot()` AND сохранить SVG в `logs/screenshots/tui-screenshot-{timestamp}.svg`.

WHEN SVG сохранён THEN TUI SHALL скопировать путь в clipboard AND показать notification.

IF clipboard недоступен THEN TUI SHALL только сохранить файл AND показать notification без упоминания clipboard.
