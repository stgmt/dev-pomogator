# Forbid Root Artifacts

Pre-commit хук, который держит корень репозитория чистым: в корень разрешено
коммитить только файлы из белого списка, а «мусор» (временные файлы, следы IDE,
устаревшие форматы) отсекается ещё до коммита. Whitelist настраивается через
`.root-artifacts.yaml` (режимы `extend` / `replace`); непонятные файлы
классифицируются через Claude Code CLI по подписке.

> **Механизм — git pre-commit (Python `check.py`), а НЕ автоматический хук Claude
> Code.** Инструмент едет в дереве плагина dev-pomogator, но включается
> **per-project вручную** (`setup.py` / `pre-commit install`), а не автоматом при
> установке dev-pomogator. Поэтому «блокирует у всех сразу после установки» — не про
> него.

## Ключевые идеи

- **Whitelist-гейт корня** — `check.py` блокирует любой файл/директорию в корне,
  которого нет в объединённом белом списке (`default-whitelist.yaml` +
  пользовательский `.root-artifacts.yaml`); режимы `extend` (добавить к дефолту) и
  `replace` (заменить дефолт), плюс `deny` / `ignore_patterns` / `allowed_directories`.
- **Auto-prune устаревших записей** — при коммите `check.py` вычищает из `allow:`
  записи на уже удалённые файлы, атомарно (temp-file + `os.replace`) и с сохранением
  заголовка-комментария байт-в-байт; opt-in через `auto_prune.enabled` (default off).
- **Классификация мусора** — `configure.py` не предлагает в whitelist trash-файлы:
  yaml-паттерны (`trash_patterns` + плагин-дефолты для VS legacy), а при
  `classifier.mode: hybrid|llm` — вызов `claude -p` по подписке с 24h-кэшем и
  graceful fallback при отсутствии CLI.

## Где лежит реализация

- **App-код**: `tools/forbid-root-artifacts/` — `check.py` (pre-commit гейт +
  auto-prune), `configure.py` (интерактивная настройка whitelist), `_classifier.py`
  (общий модуль классификации: layered config + LLM + кэш), `default-whitelist.yaml`
  (дефолтный whitelist + `trash_patterns_default`).
- **Wiring**: git pre-commit через `.pre-commit-config.yaml`
  (`entry: python .dev-pomogator/tools/forbid-root-artifacts/check.py`); установка —
  `setup.py` + `pre-commit install`. Настройка whitelist — slash-команда
  `/configure-root-artifacts` (`.claude/commands/configure-root-artifacts.md`).

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
