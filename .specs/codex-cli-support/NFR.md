# Non-Functional Requirements (NFR)

## Performance

- Установка и update path для `Codex` SHALL избегать лишних перезаписей неизменившихся project-level файлов.
- Managed dispatcher hooks SHALL оставаться lightweight; длительная работа должна выноситься в отдельные скрипты, фоновые процессы или `codex exec`/app automation.
- Генерация `.agents/skills/` и `.codex/*` SHALL выполняться без полного пересоздания unrelated project artifacts на каждом reinstall.

## Security

- Система SHALL NOT записывать `Codex`-специфичные настройки, hooks или skills в `~/.codex/*`.
- Система SHALL NOT изменять `~/.codex/auth.json`, credential store, login method или user-level security settings.
- Все merge/write операции по `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и `.agents/skills/*` SHALL проходить через explicit conflict handling, а не silent overwrite.
- Система SHALL учитывать trust model Codex и SHALL NOT представлять untrusted project как fully active managed Codex environment.

## Reliability

- `.codex/config.toml`, `.codex/hooks.json` и другие managed config files SHALL записываться атомарно.
- Reinstall и update для `Codex` SHALL быть idempotent: повторный запуск не должен создавать дубликаты hooks, skills, MCP entries или managed blocks.
- Если managed `Codex`-файл был изменён пользователем, система SHALL backup его перед overwrite и SHALL сохранять отчёт о backup/merge событии.
- Managed cleanup SHALL удалять только принадлежащие `dev-pomogator` Codex артефакты и SHALL сохранять unrelated user files.
- Hook materialization SHALL быть deterministic внутри managed слоя: не более одного managed dispatcher per event, чтобы concurrent execution matching hooks не создавало nondeterministic behavior.
- Hook commands SHALL резолвиться от project root или через явно стабильный path builder, а не через хрупкое предположение о текущем `cwd`.

## Usability

- Warning/merge сообщения SHALL явно называть конфликтующий файл, путь к backup и рекомендуемое следующее действие.
- Документация SHALL явно объяснять version floor для hooks (`0.114.0`, `0.116.0`, `0.117.0`, `0.120.0+`) и ограничения `PreToolUse`/`PostToolUse` до `Bash`.
- Support matrix SHALL явно показывать `supported`, `partial` и `excluded` extensions, а не только “входит/не входит”.
- Windows documentation SHALL отдельно описывать native-first strategy, WSL2 fallback и любые remaining version-gated caveats для hooks.
