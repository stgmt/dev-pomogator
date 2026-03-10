# Non-Functional Requirements (NFR)

## Performance

- NFR-P1: Pattern matching должен обрабатывать 100 failures за <500ms
- NFR-P2: Code snippet extraction: чтение файла за <100ms, кеширование прочитанных файлов
- NFR-P3: Test discovery timeout: 30s максимум, после — fallback
- NFR-P4: State persistence debounce: 0.5s (не чаще одной записи в 0.5s)
- NFR-P5: TUI polling interval: 500ms для YAML, не блокирует UI thread
- NFR-P6: Screenshot export: <2s для генерации SVG

## Security

- NFR-S1: Пути из YAML/patterns.yaml валидируются перед использованием (no path traversal)
- NFR-S2: subprocess вызовы для clickable paths используют список аргументов (не shell=True)
- NFR-S3: LLM API ключ хранится в env var, не хардкодится
- NFR-S4: User patterns file читается только из проектной директории (.dev-pomogator/)

## Reliability

- NFR-R1: Corrupted state file → fallback на defaults (no crash)
- NFR-R2: Invalid regex в user patterns → skip pattern, log warning (no crash)
- NFR-R3: Discovery command fail → warning message, continue without tree
- NFR-R4: Clipboard unavailable → save file only, no error
- NFR-R5: Stale PID lock file (crashed process) → cleanup и продолжение
- NFR-R6: File not found для code snippet → показать stack trace only
- NFR-R7: LLM API unavailable → skip pattern generation, use existing patterns

## Usability

- NFR-U1: Clickable paths: amber flash feedback 0.3s при клике
- NFR-U2: Keybinding launch: один shortcut для запуска TUI с тестами
- NFR-U3: Analysis tab: failure cards сортированы по severity (critical → low)
- NFR-U4: State restore: seamless восстановление без заметной задержки (<200ms)
- NFR-U5: Discovery tree: checkbox selection с bulk select/deselect
- NFR-U6: Screenshot notification: Toast с путём к SVG файлу
