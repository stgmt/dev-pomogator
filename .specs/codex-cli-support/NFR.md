# Non-Functional Requirements (NFR)

## Performance

- Установка и update path для `Codex` SHALL избегать лишних перезаписей неизменившихся project-level файлов.
- `SessionStart` и `Stop` hooks SHALL оставаться lightweight; длительная работа должна выноситься в отдельные скрипты, фоновые процессы или `codex exec`/app automation.
- Генерация `.agents/skills/` и `.codex/*` SHALL выполняться без полного пересоздания unrelated project artifacts на каждом reinstall.

## Security

- Система SHALL NOT записывать `Codex`-специфичные настройки, hooks или skills в `~/.codex/*`.
- Система SHALL NOT изменять `~/.codex/auth.json`, credential store, login method или user-level security settings.
- Все merge/write операции по `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и `.agents/skills/*` SHALL проходить через explicit conflict handling, а не silent overwrite.

## Reliability

- `.codex/config.toml`, `.codex/hooks.json` и другие managed config files SHALL записываться атомарно.
- Reinstall и update для `Codex` SHALL быть idempotent: повторный запуск не должен создавать дубликаты hooks, skills, MCP entries или managed blocks.
- Если managed `Codex`-файл был изменён пользователем, система SHALL backup его перед overwrite и SHALL сохранять отчёт о backup/merge событии.
- Managed cleanup SHALL удалять только принадлежащие `dev-pomogator` Codex артефакты и SHALL сохранять unrelated user files.

## Usability

- Warning/merge сообщения SHALL явно называть конфликтующий файл, путь к backup и рекомендуемое следующее действие.
- Документация SHALL явно объяснять, что hooks в `Codex` пока experimental, требуют `Codex >= 0.114.0`, включаются через `features.codex_hooks=true` и ограничены `SessionStart` и `Stop`.
- Support matrix SHALL явно показывать, что все расширения кроме `test-statusline` входят в scope фичи, а для каждого lifecycle-расширения указан parity surface.
- Windows documentation SHALL отдельно описывать выбранный `bash/sh` bootstrap path для `codex`.

