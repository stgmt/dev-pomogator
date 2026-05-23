# Non-Functional Requirements (NFR)

## Performance

- Skill verify завершается за ≤30 секунд на типичной spec (≤20 файлов в FILE_CHANGES).
- Git log calls bounded: один call per FR-N с `--max-count=20`, не более 100 entries each.
- Параллельные verify на нескольких specs (внутри hook) сериализованы — каждый spec проверяется отдельным spawnSync, total ≤2×count(specs) seconds.

## Security

- verify.ts читает только в пределах repo root — path-traversal guard через `resolveWithinProject` pattern из `src/utils/path-safety.ts`.
- Никаких internet calls — все проверки локальные (filesystem + git).
- Никаких shell injection vectors — использовать `spawnSync` с args array (не `shell: true`); user-controlled input не передаётся в shell.
- Hook не записывает чувствительные данные в `permissionDecisionReason` — только finding categories и file paths.

## Reliability

- Fail-open на любой error в hook path — exception → log warning + permit, не блокирует ExitPlanMode.
- Skill exit 0 даже при findings — findings ≠ ошибка скрипта; non-zero только при unparseable args / IO errors.
- Все file reads через try/catch с graceful fallback.
- Graceful skip code-drift check если `.git/` отсутствует (Docker test env) — INFO finding, не crash.
- Lock atomicity: если skill writes shared state (cache) — через `flag: 'wx'` pattern per `atomic-update-lock` rule.

## Usability

- Human output format — colored через chalk (red ERROR / yellow WARNING / blue INFO), file:line clickable references.
- Finding messages actionable — каждый message указывает что менять в spec docs (не просто "drift detected").
- JSON output strict shape — парсимый через `JSON.parse`, no garbage prefixes/suffixes.
- Markdown output — валидная markdown table рендерится в GitHub без artifacts.
- Auto-trigger description содержит ≥10 trigger phrases EN+RU для надёжного match-а.
