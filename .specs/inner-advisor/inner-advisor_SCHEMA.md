# Inner Advisor Schema

## Session Summary (`summary.md`)

```json
{
  "section_title": "string (10 fixed # headers)",
  "current_state": "string",
  "task_specification": "string",
  "files_and_functions": "string[] | string",
  "workflow": "string[]",
  "errors_and_corrections": "string[]",
  "codebase_docs": "string[]",
  "learnings": "string[]",
  "key_results": "string",
  "worklog": "string[]"
}
```

- `section_title`..`worklog`: 10 обязательных секций с `#`-якорями; italic `_описания_` — шаблонные carriers, сохраняются заголовки, содержимое обновляется моделью.
- Ограничения: секция ≤2K токенов, всего ≤12K; `verifyStructure` требует все 10 заголовков, при потере — перезапись отменяется.

## Session State (`state/<sid>.json`)

```json
{
  "initialized": "boolean",
  "content_tokens_at_last_extraction": "number",
  "api_tokens_at_last_extraction": "number",
  "last_extraction_line_count": "number",
  "last_extraction_timestamp": "number|null",
  "extraction_count": "number",
  "consecutive_failures": "number"
}
```

- `initialized`: прошёл ли init-гейт (≥5K контент-токенов).
- `last_extraction_line_count`: строка транскрипта до которой обработано — основа для delta.
- `consecutive_failures`: при ≥3 — alert/маркер (как ccjr), помогает диагностировать сбой модели.

## Config (`.dev-pomogator/advisor/config.json`)

```json
{
  "enabled": "boolean",
  "mode": "digest|fast|full",
  "skeptic": "balanced|strict",
  "sessionSummary": "boolean",
  "sessionSummaryForce": "boolean"
}
```

## Правила валидации

- Все 10 `#`-заголовков summary обязательны; структура проверяется `verifyStructure`.
- Гейт экстракции: init ≥5K; update ≥5K роста И (≥3 tool calls ИЛИ последний ход без тулов); `sessionSummaryForce` пропускает.
- Атомарность записи (temp+rename) и `wx`-lock по сессии обязательны.
- `buildSummaryPacket`: mode='summary' только когда summary существует и не равен пустому шаблону; иначе fallback digest.
- Конфиг fail-open: false/no config → выключено, никаких ошибок в сессии.