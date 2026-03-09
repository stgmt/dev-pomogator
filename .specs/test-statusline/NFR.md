# Non-Functional Requirements (NFR)

## Performance

### NFR-P1: Statusline Script Execution Time

Statusline скрипт должен завершаться за < 100ms. Claude Code debounces обновления на 300ms — скрипт не должен быть узким местом.

- Не использовать внешние парсеры (yq, python) — только grep/sed/cut
- Не запускать процессы кроме jq (для JSON stdin) и grep (для YAML)
- Fallback на grep-based JSON парсинг если jq недоступен

### NFR-P2: Atomic Write Performance

Атомарная запись YAML (temp + rename) должна быть < 10ms. Не использовать fsync для performance.

## Security

### NFR-S1: No Secrets in Status Files

YAML status files не должны содержать секреты, токены, или sensitive данные. Только числовые метрики и имена test suites.

### NFR-S2: Status File Path Validation

Пути status files должны быть resolved внутри project root. Не допускать path traversal через session_id.

> _Leverage:_ `.claude/rules/no-unvalidated-manifest-paths.md`

## Reliability

### NFR-R1: Fail-Open Hooks

Все hooks (SessionStart) должны exit 0 при любой ошибке. Сбой hook'а не должен блокировать сессию Claude Code.

### NFR-R2: Fail-Silent Statusline

Statusline скрипт при любой ошибке (missing file, corrupted YAML, missing jq) должен выводить пустую строку, не stderr.

### NFR-R3: Stale Data Tolerance

Statusline должен корректно отображать данные даже если YAML не обновлялся длительное время. Не показывать "running" если файл старше 10 минут без обновления.

## Usability

### NFR-U1: Zero Configuration

Расширение работает из коробки после установки через dev-pomogator. Пользователь не должен вручную настраивать paths, session IDs, или форматы.

### NFR-U2: Cross-Platform Compatibility

Statusline скрипт и test runner wrapper должны работать на macOS (zsh/bash), Linux (bash), Windows (Git Bash).

### NFR-U3: Non-Intrusive

Расширение не заменяет существующий statusline пользователя. Предоставляет скрипт для интеграции (sourcing из пользовательского statusline script или через ccstatusline custom command).
