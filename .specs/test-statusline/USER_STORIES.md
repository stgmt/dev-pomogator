# User Stories

## US-1: Видеть прогресс тестов в statusline @feature1

Как разработчик, использующий Claude Code, я хочу видеть прогресс запущенных тестов в statusline (проценты, иконки статусов), чтобы не прерывать работу для ручной проверки состояния тестов.

## US-2: Автоматический мониторинг тест-процессов @feature2

Как разработчик, я хочу чтобы daemon автоматически обнаруживал запущенные тест-процессы и отслеживал их прогресс, чтобы не настраивать мониторинг вручную для каждого запуска.

## US-3: Изоляция параллельных сессий @feature3

Как разработчик, работающий в нескольких сессиях Claude Code одновременно, я хочу чтобы каждая сессия показывала статус только своих тестов, чтобы данные из разных проектов/сессий не смешивались.

## US-4: Автоматическая очистка ресурсов @feature4

Как разработчик, я хочу чтобы daemon и файлы статуса автоматически очищались при завершении сессии, чтобы не накапливались stale файлы и zombie-процессы.

## US-5: Установка через dev-pomogator @feature5

Как пользователь dev-pomogator, я хочу чтобы test-statusline устанавливался как стандартное расширение через инсталлер, чтобы всё работало из коробки без ручной конфигурации.

### User Story 6: Честный результат запуска тестов из canonical plugin (Priority: P1) @feature9

**Требование:** [FR-12]

Как разработчик, запускающий тесты через `/run-tests` в canonical Claude plugin installation, я хочу чтобы CJS shim либо запускал выбранный тестовый процесс и возвращал его реальный код, либо явно завершался ошибкой, чтобы отсутствующий executable, loader или Windows UNC-ограничение не создавали fake-green.

**Why:** A false zero exit status lets the mandatory test guard manufacture a passing result when no test process has started.

**Independent Test:** Execute the installed CJS shim with `--framework dotnet --` and a child that exits 7, then with a nonexistent executable; the first returns 7 and the second returns non-zero with stderr.

**Acceptance Scenarios:**

Given a canonical plugin installation with the CJS shim
When the shim receives a wrapper framework argument and an executable child after `--`
Then it executes the child and returns its actual exit status

Given a Windows WSL UNC workspace and a nonexistent child executable
When the shim starts the requested test command
Then it writes a diagnostic and returns non-zero without passing UNC as child cwd.
