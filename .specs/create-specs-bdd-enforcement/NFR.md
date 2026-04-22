# Non-Functional Requirements (NFR)

## Performance

- `analyze-features.ts` multi-folder recursive scan ≤ 2s на 1000 `.feature` files (glob pattern optimized, respect `.gitignore` если доступно)
- Performance cap: 10000 files max; при превышении — warning + truncate result (не fail-hard)
- `bdd-framework-detector.ts` детект ≤ 100ms per target test-project (простой grep по ключевым файлам: .csproj / package.json / requirements.txt / pyproject.toml)
- State machine ConfirmStop pre-check ≤ 50ms (single-file read DESIGN.md + 2 regex)

## Security

- N/A для операций чтения FS (сканирование и детекция)
- `bdd-framework-detector.ts` НЕ выполняет install commands — только формирует строку команды для TASKS.md. Реальный `dotnet add package`/`npm install`/`pip install` делает разработчик вручную
- Не логировать содержимое `.csproj`/`package.json` в stdout целиком — только grep-строки с маркером

## Reliability

- State machine idempotent: повторный `ConfirmStop` на уже confirmed фазе не ломает `.progress.json` — возвращает текущее состояние без изменений
- Graceful fallback для старых `.progress.json` файлов (без полей `bddInfraClassificationComplete` / `bddFrameworkSelected`): поля читаются как `undefined` и интерпретируются как `false`/`null` без ошибки; при сохранении новые поля добавляются
- Detector fail-open: если target test-проект не содержит узнаваемых маркеров — возвращает `{ framework: null, suggestedFrameworks: [...] }` вместо throw. Agent получает actionable suggestion, а не stacktrace

## Usability

- Error messages actionable: вместо generic «validation failed» — указать путь к DESIGN.md, регекс который не matched, и предложенную команду (`Run spec-status.ts -Path {dir}`)
- Blocker message для ConfirmStop Requirements цитирует соответствующий раздел `specs-management.md` (Phase 2 Step 6)
- Detector evidence — человекочитаемые строки типа `"grep <PackageReference Include=\"Reqnroll\"> in Cleverence.Server.Tests.csproj:line_14"` (путь + строка + snippet)
- TASKS.md Phase 0 bootstrap block включает actual install command (не placeholder), чтобы разработчик мог копипастить в терминал
