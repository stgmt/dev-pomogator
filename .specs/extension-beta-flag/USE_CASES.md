# Use Cases

## UC-1: Интерактивная установка — видимость beta @feature2

Пользователь запускает `install.ps1` (или `install.sh`). Видит checkbox список.

- Stable плагины показаны как `[x] auto-commit — Automatic git commits`
- Beta плагины показаны как `[ ] docker-optimization (BETA) — Docker build optimization`
- Beta по умолчанию unchecked
- Пользователь может включить beta вручную
- Результат: выбранные плагины устанавливаются

## UC-2: Non-interactive --all — beta исключены @feature3

CI/тесты запускают `node dist/index.js --claude --all`.

- Installer читает все extension.json
- Фильтрует: `stability !== 'beta'` для --all
- Beta плагины НЕ устанавливаются
- Результат: только stable плагины установлены

## UC-3: Non-interactive --all --include-beta @feature4

Пользователь хочет всё включая beta: `node dist/index.js --claude --all --include-beta`.

- Installer читает все extension.json
- `--include-beta` отменяет фильтрацию
- ВСЕ плагины устанавливаются (stable + beta)
- Результат: все плагины установлены

## UC-4: Разработчик помечает плагин как beta @feature1

Разработчик создаёт новый плагин или помечает существующий.

- Добавляет `"stability": "beta"` в extension.json
- Без поля или `"stability": "stable"` — плагин stable (backward compatible)
- Installer читает поле и применяет логику фильтрации

## UC-5: Updater и beta плагины @feature3

Автообновление проверяет установленные плагины.

- Если beta плагин был явно установлен — он обновляется
- Updater НЕ добавляет новые beta плагины автоматически
- Только уже установленные beta обновляются
