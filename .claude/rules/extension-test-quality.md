# Extension Test Quality

## Правило

Тесты расширений dev-pomogator ДОЛЖНЫ быть aligned 1:1 с BDD feature сценариями и вызывать реальный production код.

## Naming Convention

- **describe**: `DOMAIN_CODE: Description` (например `CTXMENU001: Context Menu Setup`)
- **it**: `CODE_NN: description` (например `CTXMENU001_01: postinstall generates valid NSS`)
- **Feature Scenario**: `Scenario: CODE_NN description` (один-к-одному с it)
- **@featureN**: `// @featureN` перед it-блоком, `# @featureN` перед Scenario

## 1:1 Mapping

- Каждый `it()` ДОЛЖЕН иметь парный `Scenario` в .feature с тем же CODE_NN
- Каждый `Scenario` ДОЛЖЕН иметь парный `it()` в .test.ts
- Feature сценарий пишется ДО теста (Feature First)
- Specs-validator автоматически детектит рассинхрон

## Запрещено

- **Inline-копии production кода** — дублирование логики из extension tools в тесте. Если `generateNss()` изменится, а тест содержит копию — тест пройдёт (ложнопозитивный)
- **Тесты без feature-покрытия** — каждый it() обязан иметь парный Scenario
- **Feature без теста** — каждый Scenario обязан иметь парный it()

## Вызов реального кода

Два подхода в зависимости от типа кода:

### Import (для модулей с export)

```typescript
import { generateNss } from '../../extensions/context-menu/tools/context-menu/postinstall';

it('CTXMENU001_01: generates valid NSS content', () => {
  const nss = generateNss('/test/project');
  expect(nss).toContain('Claude Code (YOLO + TUI)');
});
```

### spawnSync (для CLI-скриптов)

```typescript
it('CTXMENU001_02: postinstall skips on non-Windows', () => {
  const result = spawnSync('npx', ['tsx', scriptPath], {
    encoding: 'utf-8',
    cwd: appPath(),
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Skipped');
});
```

## Import Guard Pattern

Если скрипт вызывает `main()` на верхнем уровне модуля, обернуть в guard для тестируемости:

```typescript
// Экспорт для тестов
export { myFunction, myHelper };

// Запуск только при прямом вызове
const isDirectRun = process.argv[1]?.endsWith('my-script.ts') ||
                    process.argv[1]?.endsWith('my-script.js');
if (isDirectRun) {
  main();
}
```

## Чеклист

- [ ] Тест имеет describe с DOMAIN_CODE
- [ ] Каждый it() имеет CODE_NN matching Scenario в .feature
- [ ] Нет inline-копий production кода
- [ ] Тест вызывает реальный код (import или spawnSync)
- [ ] @featureN теги расставлены в тесте и feature
- [ ] Feature написан ДО теста
