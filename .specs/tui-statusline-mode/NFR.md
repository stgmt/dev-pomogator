# Non-Functional Requirements (NFR)

## Performance

- CompactBar SHALL обновляться с той же частотой что полный TUI (500ms YAML polling interval)
- Toggle compact/full SHALL выполняться мгновенно (< 50ms, CSS class toggle без re-mount)
- Compact mode SHALL потреблять не больше CPU/RAM чем полный TUI (тот же polling loop)

## Security

- N/A — TUI работает локально, нет сетевых вызовов

## Reliability

- CompactBar SHALL корректно обрабатывать отсутствующий/повреждённый YAML (показать idle/waiting)
- Stop tests SHALL gracefully обрабатывать мёртвый PID (не крэшиться)
- TUI SHALL не крэшиться при terminal height < 5 строк (guard: minimum size check)

## Usability

- Compact mode SHALL быть визуально понятен без документации (иконки + цвета как в full TUI)
- Keybinding `M` для toggle SHALL быть виден в footer bindings
- Compact mode в Windows Terminal — чисто визуальный (пейн не ресайзится, пустое пространство ниже — known limitation)
