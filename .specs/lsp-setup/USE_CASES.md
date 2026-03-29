# Use Cases

## UC-1: Первичная установка LSP-расширения @feature1 @feature5

Пользователь устанавливает dev-pomogator с включённым расширением lsp-setup.

1. Инсталлер читает extension.json и определяет lsp-setup как выбранное расширение
2. Копируются tool-файлы в `.dev-pomogator/tools/lsp-setup/`
3. Копируется rule-файл в `.claude/rules/lsp-setup/`
4. postInstall hook запускает setup-скрипт
5. Setup-скрипт проверяет наличие рантаймов (node, python3, dotnet)
6. Setup-скрипт устанавливает LSP-серверы (npm install -g, dotnet tool install -g)
7. Setup-скрипт настраивает Claude Code plugins (Piebald-AI marketplace или fallback)
8. ENABLE_LSP_TOOL=1 инжектится в .claude/settings.json env
9. LSP-инструкции добавляются через rule-файл (не прямой edit CLAUDE.md)
10. Результат: Claude Code при следующем запуске видит LSP-серверы

## UC-2: Установка с недостающими рантаймами @feature5

Пользователь устанавливает lsp-setup, но у него нет Python или .NET SDK.

1. Setup-скрипт проверяет наличие node, python3, dotnet
2. python3 не найден → пропускает Pyright, логирует warning
3. dotnet не найден → пропускает csharp-ls, логирует warning
4. node найден → устанавливает vtsls и vscode-json-languageserver
5. Результат: частичная установка с явным отчётом что установлено, а что нет

## UC-3: Piebald-AI marketplace недоступен (fallback) @feature7

Пользователь устанавливает lsp-setup, но Piebald-AI marketplace недоступен (нет интернета, API down).

1. Setup-скрипт пытается `claude plugin marketplace add Piebald-AI/claude-code-lsps`
2. Команда завершается с ошибкой (timeout, network error)
3. Setup-скрипт переходит к fallback: создание локального маркетплейса
4. Создаётся `~/.claude-custom-lsp-plugins/` с plugin.json и .lsp.json файлами
5. Локальный маркетплейс подключается через `claude plugin marketplace add`
6. Плагины устанавливаются из локального маркетплейса
7. Результат: LSP работает без зависимости от внешних сервисов

## UC-4: Обновление расширения @feature1

Вышла новая версия lsp-setup с поддержкой дополнительного языка (Go).

1. Апдейтер обнаруживает новую версию extension.json
2. Tool-файлы обновляются в `.dev-pomogator/tools/lsp-setup/`
3. postUpdate hook запускает update-скрипт
4. Update-скрипт проверяет какие LSP-серверы уже установлены
5. Устанавливает только новые серверы (gopls для Go)
6. Обновляет конфигурацию плагинов
7. Результат: новый язык поддерживается без переустановки существующих

## UC-5: Верификация работоспособности LSP @feature2 @feature3 @feature4

Пользователь хочет проверить что LSP работает после установки.

1. Пользователь запускает verify-скрипт через tool или postInstall отчёт
2. Скрипт проверяет: бинари в PATH (vtsls, pyright-langserver, csharp-ls)
3. Скрипт проверяет: плагины enabled в `claude plugin list`
4. Скрипт проверяет: ENABLE_LSP_TOOL=1 в settings.json
5. Скрипт выводит таблицу: язык | сервер | бинарь | плагин | статус
6. Результат: пользователь видит что работает, а что нет

## UC-6: Использование LSP в повседневной работе @feature6

Разработчик работает с Claude Code после установки lsp-setup.

1. Claude Code загружает rule из `.claude/rules/lsp-setup/lsp-usage.md`
2. Rule инструктирует: goToDefinition вместо grep для символов, findReferences вместо grep для использований
3. При редактировании файла Claude Code получает LSP-диагностики автоматически
4. Claude Code исправляет type errors до перехода к следующему файлу
5. Результат: более быстрая и точная навигация по коду
