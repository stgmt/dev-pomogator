# Manifest Test Coverage

## Правило

При добавлении нового rule/tool/hook в extension.json — проверить что ДИНАМИЧЕСКИЙ тест установщика покрывает его.

## Почему

Захардкоженные тесты (`should install plan-pomogator.md`) не ловят новые правила. Динамический тест `CORE003_RULES` читает extension.json и проверяет ВСЕ rules.

## Чеклист (при добавлении rule в extension)

- [ ] Rule добавлен в `extension.json` → `rules.claude[]`
- [ ] Динамический тест `CORE003_RULES` в `claude-installer.test.ts` покроет его автоматически
- [ ] Если rule требует специальной проверки содержимого — добавить отдельный тест

## Антипаттерн

```typescript
// ❌ Захардкоженный тест на каждый rule
it('should install proactive-investigation.md', async () => { ... });
it('should install plan-freshness.md', async () => { ... });
```

## Правильно

```typescript
// ✅ Динамический тест — читает manifests, проверяет все
it('CORE003_RULES: all manifest rules are installed', async () => {
  // iterate extension.json files → check all rules exist
});
```
