# Правило: Синхронизация Спеков через @featureN

## Структура полной фичи

Фича считается ПОЛНОЙ если содержит ВСЕ 13 обязательных файлов (FIXTURES.md и `*_SCHEMA.md` scaffold тоже создаёт, но для полноты они опциональны):
- 12 MD файлов: ACCEPTANCE_CRITERIA, CHANGELOG, DESIGN, FILE_CHANGES, FR, NFR, README, REQUIREMENTS, RESEARCH, TASKS, USE_CASES, USER_STORIES
- 1 .feature файл с BDD сценариями

## Теги @featureN

При работе со спеками ВСЕГДА используй теги @featureN для кросс-ссылок:

1. **В MD файлах (FR.md, ACCEPTANCE_CRITERIA.md, USE_CASES.md)**:
   ```markdown
   ## FR-1: Авторизация пользователя @feature1
   ## AC-1 (FR-1): Успешный логин @feature1
   ```

2. **В .feature файлах**:
   ```gherkin
   @feature1
   Scenario: User can login with valid credentials
   ```

3. **В тестах**:
   ```typescript
   // @feature1
   describe('Authentication', () => { ... });
   ```

4. **В TASKS.md**:
   ```markdown
   - [x] Реализовать авторизацию @feature1
   ```

## Workflow создания фичи

1. Создай структуру через `scaffold-spec.ts`
2. Заполни USER_STORIES.md → добавляй @featureN к каждой story
3. Пиши FR.md → копируй @featureN из story
4. Пиши .feature файл → ставь НАСТОЯЩИЙ Gherkin-тег `@featureN` строкой над Scenario (НЕ комментарий `# @featureN` — парсер графа его не видит: сценарий UNTAGGED, рёбра tested-by не строятся)
5. Пиши тесты → добавляй // @featureN перед describe/it

## Автоматическая валидация

Хук UserPromptSubmit автоматически:
1. Находит `.specs/` папку
2. Проверяет полноту каждой поддиректории (13 файлов)
3. Для полных фич валидирует кросс-ссылки @featureN
4. Генерирует `.specs/{feature}/validation-report.md`
5. Показывает предупреждения в начале промпта

> **Important:** хук читает `.specs/` файлы напрямую через `tools/specs-validator/validate-specs.ts` — этот reference-файл является документацией FOR Claude, не data dependency для hook кода. Перенос rule-файла в references/ не влияет на работу hook.

## Типы проблем

| Проблема | Описание | Действие |
|----------|----------|----------|
| NOT_COVERED | FR/AC/UC с @featureN но без сценария | Добавь реальный тег `@featureN` строкой над Scenario в .feature |
| ORPHAN | @featureN в .feature без FR/AC | Добавь @featureN в MD файл |
| NO_TEST | @featureN без теста | Добавь // @featureN в тест |
| INCOMPLETE | Фича не имеет всех 13 файлов | Дозаполни недостающие файлы |

## Отключение валидации

Создай файл `.specs-validator.yaml` в корне проекта:

```yaml
enabled: false
```
