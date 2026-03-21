# Simplify Extended — спеки и тесты

При выполнении `/simplify` (или любого code review) проверяй не только код, но и спеки и тесты если они есть в изменённых файлах.

## Spec-файлы (`.specs/**/*.md`, `.specs/**/*.feature`, `tests/features/**/*.feature`)

Проверяй:

1. **Нечёткие требования** — "should", "may", "might", "можно", "желательно" вместо "SHALL" / "MUST" в FR.md и ACCEPTANCE_CRITERIA.md
2. **Неиспользованный reuse** — DESIGN.md не ссылается на существующие утилиты/паттерны проекта

Остальные spec-проверки (терминология, @featureN, FR decomposition) уже покрыты в `specs-management.md` и `specs-validation.md`.

## Test-файлы (`tests/**/*.test.ts`, `tests/**/*.ts`)

Проверяй:

1. **Дублирование setup** — одинаковый beforeEach/beforeAll код в разных тестах → кандидат на helper
2. **Захардкоженные данные** — магические строки/числа вместо констант или fixtures
3. **Отсутствие edge cases** — только happy path без проверки ошибок
4. **Несоответствие naming** — имя describe/it не совпадает с .feature сценарием
5. **Неиспользованные helpers** — импортированные но не вызванные функции из helpers.ts

## Systemic vs One-Off Classification

При обнаружении проблем в спеках/тестах РАЗЛИЧАЙ:

### One-off (фиксить в output)
- Опечатка, неправильная ссылка, пропущенная секция в конкретном файле

### Systemic (фиксить в алгоритме)
Если проблема повторяется или является структурной:
- Пропущенная категория задач → fix `TASKS.md.template`
- Непропагированный scope → fix `specs-management.md` / audit check
- Устаревшие конфиги → fix verification step в инструкциях
- Дублирование блоков → fix AI-инструкция в `specs-management.md`

**Действие при systemic issue:**
1. Исправить текущий output (если urgent)
2. Пометить `💡 Systemic: {описание}` — кандидат на fix в `specs-generator-core.mjs` / `specs-management.md` / templates
3. Предложить `/suggest-rules` для фиксации

## Ограничения

- Консервативно: исправляй только явные проблемы
- Не дублируй validate-spec.sh / audit-spec.sh — они проверяют структуру, ты проверяешь содержание
- Идемпотентно: повторный вызов не должен менять уже исправленное
