# Spec-Test Sync — Спеки при тестах, BDD при багфиксах

## Правило

При создании плана агент ОБЯЗАН:

1. **Тесты → спеки**: Если File Changes содержит `tests/**` файлы — ОБЯЗАН включить соответствующие `.specs/` файлы или `.feature` файлы
2. **Багфикс → BDD**: Если File Changes Reason содержит fix/bug/баг/исправ/hotfix/regression — ОБЯЗАН включить `.feature` файл для регрессионного теста

## Антипаттерны

```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/auth.test.ts` | edit | Обновить тесты авторизации |
| `src/auth/login.ts` | edit | Исправить логику логина |
```
Тест есть, спеки нет — `.specs/auth/` устареет.

```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `src/parser.ts` | edit | Fix edge case в парсере |
```
Багфикс без `.feature` — баг вернётся без регрессионного теста.

## Правильно

```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/auth.test.ts` | edit | Обновить тесты авторизации |
| `src/auth/login.ts` | edit | Исправить логику логина |
| `.specs/auth/ACCEPTANCE_CRITERIA.md` | edit | Синхронизировать AC с тестами |
| `.specs/auth/auth.feature` | edit | Обновить BDD сценарии |
```

```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `src/parser.ts` | edit | Fix edge case в парсере |
| `tests/features/parser.feature` | edit | Регрессионный BDD сценарий |
| `tests/e2e/parser.test.ts` | edit | Тест для регрессии |
```

## Чеклист

- [ ] Если `tests/**` в File Changes → `.specs/` или `.feature` тоже в File Changes
- [ ] Если Reason содержит fix/bug/баг → `.feature` в File Changes
- [ ] AC в спеках синхронизированы с тестовыми assertions
- [ ] @featureN теги в .feature соответствуют тестам
