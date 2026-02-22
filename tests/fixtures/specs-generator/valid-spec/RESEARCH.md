# Research

## PowerShell Best Practices

### JSON Output

PowerShell поддерживает ConvertTo-Json для структурированного вывода.

```powershell
$result | ConvertTo-Json -Depth 10
```

### Exit Codes

- 0 - успех
- 1 - ошибка выполнения
- 2 - ошибка валидации входных данных

### Cross-Platform

PowerShell Core (pwsh) работает на Windows, Linux, macOS.

## Findings

- Все скрипты должны поддерживать -Format json/text
- Логирование в файл опционально
- Verbose режим для отладки

## Project Context & Constraints

> Skipped: Test fixture — no project rules to analyze
