# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1**: UI обновление (от чтения YAML до отрисовки) < 100ms при polling интервале 500ms
- **NFR-P2**: Поддержка до 1000 тестов в дереве без видимой деградации рендеринга
- **NFR-P3**: YAML polling не блокирует UI thread (async/worker-based)
- **NFR-P4**: Log viewer обрабатывает файлы до 100MB без OOM (streaming/tail, не загрузка целиком)

## Security

- **NFR-S1**: Нет сетевых запросов — только чтение локальных YAML/log файлов
- **NFR-S2**: Пути из конфигурации валидируются (нет path traversal)
- **NFR-S3**: PID файлы создаются с user-only permissions

## Reliability

- **NFR-R1**: Fail-open — если Python недоступен или TUI crash, тесты продолжают работать без прерывания
- **NFR-R2**: YAML atomic writes (temp file + rename) для предотвращения чтения частично записанных файлов
- **NFR-R3**: Singleton instance — только один TUI процесс на session (lock file)
- **NFR-R4**: Graceful degradation — если YAML повреждён или не соответствует canonical v2 schema, TUI тихо отклоняет payload без падения UI
- **NFR-R5**: Hook handlers всегда exit 0, ошибки в stderr

## Usability

- **NFR-U1**: Keyboard-driven навигация: 1-4 вкладки, q quit, f filter, r run
- **NFR-U2**: Работает в любом terminal emulator поддерживающем 256 colors (Windows Terminal, iTerm2, Gnome Terminal, Kitty)
- **NFR-U3**: Status icons видимы в шрифтах без Nerd Font (fallback на ASCII: P/F/S/R/.)
- **NFR-U4**: Запуск одной командой: `python -m tui --status-file <path>`
