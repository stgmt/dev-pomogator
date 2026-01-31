# Use Cases

## UC-1: Scaffold New Spec

**Actor:** Developer

**Preconditions:**
- Проект инициализирован
- PowerShell доступен

**Main Flow:**
1. Разработчик запускает scaffold-spec.ps1 с именем фичи
2. Система создаёт папку .specs/{name}/
3. Система копирует 13 шаблонов
4. Система выводит результат в JSON

**Postconditions:**
- Создана папка со всеми файлами

## UC-2: Validate Existing Spec

**Actor:** Developer

**Preconditions:**
- Папка .specs/{name}/ существует

**Main Flow:**
1. Разработчик запускает validate-spec.ps1
2. Система проверяет наличие файлов
3. Система проверяет форматы
4. Система выводит результат

**Postconditions:**
- Выведен отчёт валидации
