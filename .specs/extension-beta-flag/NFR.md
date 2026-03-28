# Non-Functional Requirements (NFR)

## Performance

- N/A — поле `stability` читается из уже загруженного JSON, overhead нулевой.

## Security

- N/A

## Reliability

- Backward compatible: отсутствие `stability` = stable. Существующие manifests работают без изменений.

## Usability

- Beta пометка видна сразу в checkbox списке — пользователь принимает осознанное решение.
- `--include-beta` — explicit opt-in, не скрытый флаг.
