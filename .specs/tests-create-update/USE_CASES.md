# Use Cases

## UC-1: AI создаёт новый тест для extension

AI получает задачу написать тест для нового функционала.

- AI читает production код через Agent(Explore) — понимает что тестировать
- Skill направляет: выбери assertion по Assertion Selection Table, не pathExists-only
- AI создаёт .feature + .test.ts с integration approach
- AI проверяет compliance: 7 rules × PASS/FAIL
- Результат: тест с content validation assertions, не ложноположительный

## UC-2: AI обновляет тест после изменения кода

Production код изменился, нужно обновить тесты.

- AI находит связанные тесты и .feature файлы
- Skill направляет: проверь существующие assertions на 7 anti-patterns
- AI обновляет слабые assertions (pathExists → content check, toBeDefined → toBe)
- AI выдаёт compliance report с тем что исправил

## UC-3: AI создаёт тест для C# проекта

AI получает задачу написать Reqnroll step definitions.

- Skill направляет: HTTP response = status + body deserialization + field asserts
- Skill направляет: JSON = TryGetProperty, не GetProperty chain
- Skill направляет: cleanup = catch с logging, не catch {}
- AI выдаёт compliance report с C#-специфичными правилами
