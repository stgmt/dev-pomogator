# User Stories

- Как разработчик, я хочу чтобы AI агент (Claude) при создании/обновлении тестов НЕ ДОПУСКАЛ 7 анти-паттернов (source scan, pathExists-only, weak assertions, response status only, silent skip, helper dup, unsafe JSON), чтобы тесты ловили реальные баги.
- Как разработчик, я хочу видеть compliance report после каждого создания/обновления теста — таблица 7 rules × PASS/FAIL с line references, чтобы сразу видеть слабые места.
- Как разработчик, я хочу чтобы skill работал для TypeScript/vitest И C#/xUnit/FluentAssertions, чтобы покрыть оба моих проекта.
