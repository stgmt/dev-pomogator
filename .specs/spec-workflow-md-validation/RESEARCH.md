# Research

## Objective

Исследовать форматы файлов, паттерны тегов и edge cases для валидатора спецификаций.

## Analysis

### 1. Формат @featureN тегов

**Regex паттерн:** `@feature(\d+)`

**Места использования:**
- MD файлы: в конце заголовка `## FR-1: Title @feature1`
- .feature файлы: в комментарии перед Scenario `# @feature1`
- .test.ts файлы: в комментарии `// @feature1`
- TASKS.md: в конце строки `- [x] Task @feature1`

### 2. Структура MD заголовков

**FR.md:**
```regex
^## FR-(\d+):\s*(.+?)\s*(@feature\d+)?$
```

**ACCEPTANCE_CRITERIA.md:**
```regex
^## AC-(\d+)\s*\(FR-(\d+)\):\s*(.+?)\s*(@feature\d+)?$
```

**USE_CASES.md:**
```regex
^## UC-(\d+):\s*(.+?)\s*(@feature\d+)?$
```

### 3. Структура .feature файлов

```gherkin
# @feature1
Scenario: Name
  Given ...
  When ...
  Then ...
```

**Regex для тега:**
```regex
^\s*#\s*(@feature\d+)
```

**Regex для Scenario:**
```regex
^\s*Scenario:\s*(.+)$
```

### 4. Edge Cases

| Case | Handling |
|------|----------|
| Множественные @featureN в одной строке | Извлекать все, связывать с одним источником |
| @featureN без номера | Игнорировать |
| Дубликаты @featureN в разных местах | Первое вхождение в MD, первое в .feature |
| Пустой .feature файл | Все MD теги → NOT_COVERED |
| Пустые MD файлы | Все .feature теги → ORPHAN |
| Вложенные директории в .specs/ | Не поддерживаются, только прямые поддиректории |

### 5. Список обязательных файлов

Полная фича должна содержать ровно 13 файлов:

```typescript
const REQUIRED_MD_FILES = [
  'ACCEPTANCE_CRITERIA.md',
  'CHANGELOG.md',
  'DESIGN.md',
  'FILE_CHANGES.md',
  'FR.md',
  'NFR.md',
  'README.md',
  'REQUIREMENTS.md',
  'RESEARCH.md',
  'TASKS.md',
  'USE_CASES.md',
  'USER_STORIES.md'
];
// + хотя бы один *.feature файл
```

### 6. Формат validation-report.md

```markdown
# Specs Validation Report

Feature: {spec-name}
Generated: {ISO timestamp}

## Coverage Summary

| @featureN | FR.md | .feature | Status |
|-----------|-------|----------|--------|
| @feature1 | FR-1  | Scenario: Name | COVERED |

Total: X tags, Y covered, Z uncovered, W orphan

## NOT_COVERED

### @featureN
- Source: {file}:{line}
- Missing: No Scenario with # @featureN
- Action: Add # @featureN before corresponding Scenario

## ORPHAN

### @featureN
- Source: {file}:{line}
- Missing: No FR/AC/UC with @featureN
- Action: Add @featureN to requirement

## COVERED

- @featureN: FR-N ↔ Scenario: Name
```

### 7. Формат stdout предупреждений

```
[specs-validator] ⚠️ NOT_COVERED: @feature2 в FR.md:15 не имеет Scenario
[specs-validator] ⚠️ ORPHAN: @feature99 в spec.feature:25 не имеет требования
```

### 8. Обработка ошибок

| Error | Handling |
|-------|----------|
| JSON parse error | Log, exit 0 |
| File not found | Skip file, continue |
| Permission denied | Log, skip file |
| Invalid UTF-8 | Log, skip file |
| Regex timeout | Use simple string matching fallback |

## Conclusions

1. Использовать regex для парсинга, с fallback на простой поиск
2. Один @featureN может быть в нескольких MD файлах (FR, AC, UC) - это нормально
3. Порядок обработки: FR.md → ACCEPTANCE_CRITERIA.md → USE_CASES.md
4. Отчёт генерируется только для полных фич
5. Stdout предупреждения на русском языке
