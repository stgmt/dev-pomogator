# Use Cases

## UC-1: Блокировка записи в файл будущей фазы @feature1

**Актор:** Claude Code (AI-агент)
**Предусловие:** Scaffold `.specs/my-feature/` создан, `.progress.json` существует, текущая фаза = Discovery, STOP #1 не подтверждён.

**Основной сценарий (Happy Path):**
1. Claude вызывает Write для `.specs/my-feature/FR.md`
2. PreToolUse hook читает stdin с `tool_input.file_path`
3. Hook извлекает feature slug и filename из пути
4. Hook читает `.specs/my-feature/.progress.json`
5. Hook определяет: FR.md принадлежит фазе Requirements
6. Hook проверяет: Discovery.stopConfirmed = false
7. Hook возвращает JSON с `permissionDecision: "deny"` и exit code 2
8. Claude получает сообщение: "БЛОКИРОВКА: STOP #1 (Discovery) не подтверждён"

**Альтернативный (A1) — файл текущей фазы:**
1. Claude вызывает Write для `.specs/my-feature/USER_STORIES.md`
2. Hook определяет: USER_STORIES.md → Discovery (текущая)
3. Hook выходит с exit code 0 (разрешает)

**Альтернативный (A2) — файл предыдущей фазы:**
1. Текущая фаза = Requirements (STOP #1 подтверждён)
2. Claude вызывает Write для USER_STORIES.md (Discovery)
3. Hook: все фазы до Discovery confirmed → разрешает

---

## UC-2: Разблокировка фазы после подтверждения STOP @feature1

**Актор:** Пользователь + Claude
**Предусловие:** Discovery файлы заполнены, STOP #1 не подтверждён.

**Основной сценарий:**
1. Claude показывает результаты Discovery и спрашивает подтверждение
2. Пользователь подтверждает
3. Claude запускает `spec-status.ps1 -ConfirmStop Discovery`
4. `.progress.json` обновляется: `Discovery.stopConfirmed = true`
5. Claude записывает FR.md — hook разрешает

---

## UC-3: Файл вне `.specs/` (pass-through) @feature1

**Актор:** Claude Code
**Предусловие:** Claude редактирует файл не в `.specs/`.

**Основной сценарий:**
1. Claude вызывает Write для `src/index.ts`
2. Hook: путь не содержит `.specs/` → exit(0) немедленно

---

## UC-4: Отсутствие `.progress.json` (fail-open) @feature1

**Актор:** Claude Code
**Предусловие:** `.specs/manual-spec/` без `.progress.json`.

**Основной сценарий:**
1. Claude вызывает Write для `.specs/manual-spec/FR.md`
2. Hook: `.progress.json` не найден → exit(0) (fail-open)

---

## UC-5: Инжекция статуса фазы в промпт @feature2

**Актор:** UserPromptSubmit hook (validate-specs.ts)
**Предусловие:** Спека в фазе Discovery.

**Основной сценарий:**
1. Пользователь отправляет промпт
2. validate-specs.ts читает `.progress.json`
3. Выводит статус: фаза, разрешённые/запрещённые файлы
4. Claude видит контекст перед обработкой

---

## UC-6: Обнаружение partial implementation @feature3

**Актор:** audit-spec.ps1
**Предусловие:** FR-5 содержит "НЕ РЕАЛИЗОВАНО", Task 4.1 помечен [x].

**Основной сценарий:**
1. audit-spec.ps1 сканирует FR.md на маркеры partial implementation
2. Находит FR-5 с маркером
3. Cross-ref с TASKS.md — task для FR-5 помечен [x]
4. ERROR: `PARTIAL_IMPL: FR-5 "НЕ РЕАЛИЗОВАНО" but task [x]`

---

## UC-7: Обнаружение FR split inconsistency @feature4

**Актор:** audit-spec.ps1
**Предусловие:** FR-4 decomposed (FR-4a), FR-5 аналогичен но без decomposition.

**Основной сценарий:**
1. audit-spec.ps1 извлекает все FR ID
2. Обнаруживает FR-4 → FR-4a (sub-variant)
3. FR-5 без sub-variant → INFO: `FR_SPLIT_CONSISTENCY`

---

## UC-8: Ошибка чтения `.progress.json` (fail-open) @feature1

**Актор:** PreToolUse hook
**Предусловие:** `.progress.json` повреждён.

**Основной сценарий:**
1. Hook читает `.progress.json` → JSON.parse throws
2. catch блок → exit(0) (fail-open)
3. Ошибка в stderr для диагностики
