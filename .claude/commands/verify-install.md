# /verify-install — Полная верификация установки dev-pomogator

## Описание

Полный workflow для проверки корректности установки dev-pomogator в чистый проект.
Проверяет ВСЕ артефакты: файлы, пути, хуки (локальные и глобальные), config, claude-mem, pre-commit.

## Параметры

- `TEST_DIR`: путь к тестовой директории (по умолчанию: `../test-install-pomogator` рядом с dev-pomogator)
- `SOURCE_DIR`: путь к репозиторию dev-pomogator (по умолчанию: текущий проект)
- `HOME_DIR`: домашняя директория пользователя (по умолчанию: `$HOME` / `%USERPROFILE%`)

## Workflow

### Шаг 1: Подготовка

1. `npm run build` в SOURCE_DIR — пересобрать dist/
2. Создать TEST_DIR
3. `git init` в TEST_DIR (инсталлер использует `findRepoRoot()`)
4. Создать `TEST_DIR/.cursor/` (маркер Cursor-проекта)

### Шаг 2: Установка

1. **Cursor + все плагины** (из TEST_DIR):
   ```bash
   node SOURCE_DIR/bin/cli.js --cursor --all
   ```

2. **Claude + все плагины** (из TEST_DIR):
   ```bash
   node SOURCE_DIR/bin/cli.js --claude --all
   ```

Примечание: `postInstall` хуки (python, MCP setup) могут упасть — это ожидаемо без Python/внешних зависимостей. Важна файловая структура.

### Шаг 3: Верификация — запусти 4 агентов параллельно

| Агент | Чеклист | Что проверяет |
|-------|---------|---------------|
| 1 | A: Структура файлов | Все файлы на месте, правильные директории |
| 2 | B: Содержимое и пути | Нет стейловых путей, контент не повреждён |
| 3 | C: Локальные hooks | `.claude/settings.json`, `.cursor/hooks/hooks.json` в проекте |
| 4 | D: Глобальные артефакты | Config, глобальные hooks, скрипты, claude-mem |
| 5 | E: PostInstall зависимости | deps-install.py, pyyaml, pre-commit, tsx |

### Шаг 4: Сводный отчёт

```markdown
## Итоговый отчёт установки dev-pomogator

### Summary
- Cursor install: OK/FAIL
- Claude install: OK/FAIL
- Локальные hooks: OK/FAIL
- Глобальные hooks: OK/FAIL
- Claude-mem: OK/FAIL
- Config: OK/FAIL
- PostInstall deps: OK/FAIL
- Критических проблем: N

### Детали по чеклистам
[A + B + C + D + E]

### Найденные проблемы
[описание + рекомендация]
```

### Шаг 5: Cleanup

Удалить TEST_DIR. НЕ удалять глобальные артефакты (они могут использоваться другими проектами).

---

## Чеклист A: Структура файлов

### A1. Корневой `tools/` НЕ существует
- `TEST_DIR/tools` — должен отсутствовать
- Если существует → **CRITICAL FAIL** (стейловый путь)

### A2. `.dev-pomogator/tools/` — 7 подпапок
Ожидаемые: `auto-commit`, `forbid-root-artifacts`, `plan-pomogator`, `specs-generator`, `specs-validator`, `steps-validator`, `mcp-setup`

### A3. Количество файлов в каждом tool (рекурсивно, без runtime-артефактов типа `__pycache__`, `logs/`)
| Tool | Min файлов | Ключевые файлы |
|------|-----------|----------------|
| `auto-commit` | 5 | `auto_commit_core.ts`, `auto_commit_llm.ts`, `auto_commit_prompt_guide.md`, `auto_commit_stop.ts`, `auto_commit_transcript.ts` |
| `forbid-root-artifacts` | 7 | `.root-artifacts.yaml.template`, `check.py`, `configure.py`, `default-whitelist.yaml`, `deps-install.py`, `requirements.txt`, `setup.py` |
| `plan-pomogator` | 6 | `README.md`, `mcp-dedupe.plan.md`, `requirements.md`, `template.md`, `validate-plan.ts`, `fixtures/valid.plan.md` |
| `specs-generator` | 20 | 5x `.ps1`, `README.md`, 14x `templates/*.template` |
| `specs-validator` | 6 | `completeness.ts`, `matcher.ts`, `reporter.ts`, `validate-specs.ts`, `parsers/feature-parser.ts`, `parsers/md-parser.ts` |
| `steps-validator` | 13 | `analyzer.ts`, `config.ts`, `detector.ts`, `logger.ts`, `reporter.ts`, `types.ts`, `validate-steps.ts`, 4x `parsers/*.ts`, 2x `docs/*.md` |
| `mcp-setup` | 3 | `README.md`, `mcp-config.json`, `setup-mcp.py` |

### A4. `.cursor/commands/` — 3 команды
- `configure-root-artifacts.md`
- `create-spec.md`
- `suggest-rules.md`

### A5. `.claude/commands/` — 3 команды
- `configure-root-artifacts.md`
- `create-spec.md`
- `suggest-rules.md`

### A6. `.cursor/rules/pomogator/` — 5 rules
- `plan-pomogator.mdc`
- `specs-management.mdc`
- `no-mocks-fallbacks.mdc`
- `research-workflow.mdc`
- `specs-validation.mdc`

### A7. `.claude/rules/pomogator/` — 5 rules
- `plan-pomogator.md`
- `specs-management.md`
- `no-mocks-fallbacks.md`
- `research-workflow.md`
- `specs-validation.md`

### A8. Pre-commit hook
- `.pre-commit-config.yaml` существует и содержит `forbid-root-artifacts`
- `.git/hooks/pre-commit` существует и исполняемый

---

## Чеклист B: Содержимое и пути

### B1. Нет стейловых путей в commands и rules
Поиск bare `tools/` (без `.dev-pomogator/` перед ним) в:
- `TEST_DIR/.cursor/commands/`
- `TEST_DIR/.claude/commands/`
- `TEST_DIR/.cursor/rules/`
- `TEST_DIR/.claude/rules/`

Допустимые исключения: `extensions/*/tools/`, `toolFiles` в описании формата.
**НЕ** искать внутри `.dev-pomogator/tools/` — tool-файлы могут использовать относительные пути.

### B2. Commands → `.dev-pomogator/tools/`
Прочитать каждый command-файл, проверить:
| Файл | Должен содержать |
|------|-----------------|
| `.cursor/commands/create-spec.md` | `.dev-pomogator/tools/specs-generator/` или `.dev-pomogator\tools\specs-generator\` |
| `.cursor/commands/configure-root-artifacts.md` | `.dev-pomogator/tools/forbid-root-artifacts/` |
| `.claude/commands/create-spec.md` | `.dev-pomogator/tools/specs-generator/` |
| `.claude/commands/configure-root-artifacts.md` | `.dev-pomogator/tools/forbid-root-artifacts/` |

### B3. Rules → `.dev-pomogator/tools/`
| Файл | Должен содержать |
|------|-----------------|
| `.cursor/rules/pomogator/plan-pomogator.mdc` | `.dev-pomogator/tools/plan-pomogator/` |
| `.cursor/rules/pomogator/specs-management.mdc` | `.dev-pomogator/tools/specs-generator/` |
| `.claude/rules/pomogator/plan-pomogator.md` | `.dev-pomogator/tools/plan-pomogator/` |
| `.claude/rules/pomogator/specs-management.md` | `.dev-pomogator/tools/specs-generator/` |

### B4. Tool-файлы не повреждены (выборочная проверка)
| Файл | Проверка |
|------|---------|
| `.dev-pomogator/tools/plan-pomogator/validate-plan.ts` | содержит `import` |
| `.dev-pomogator/tools/specs-generator/scaffold-spec.ps1` | содержит `param` или `function` |
| `.dev-pomogator/tools/auto-commit/auto_commit_core.ts` | содержит `import` или `export` |
| `.dev-pomogator/tools/specs-validator/validate-specs.ts` | содержит `import` |
| `.dev-pomogator/tools/steps-validator/validate-steps.ts` | содержит `import` |
| `.dev-pomogator/tools/forbid-root-artifacts/check.py` | содержит `import` или `def ` |

---

## Чеклист C: Локальные hooks (в проекте)

### C1. `.claude/settings.json` — Claude Code hooks
- Файл существует
- Содержит `hooks.Stop` массив
- auto-commit Stop hook: команда содержит `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts`
- Нет bare `tools/` путей без `.dev-pomogator/` префикса

### C2. `.cursor/hooks/hooks.json` — Cursor hooks (локальные)
- Файл может не существовать (Cursor hooks могут быть только глобальными)
- Если существует — проверить:
  - Hooks содержат `.dev-pomogator/tools/` пути
  - Нет bare `tools/` без `.dev-pomogator/`
  - Формат `{ "version": 1, "hooks": { ... } }`

### C3. Hook команды — правильные пути
Во ВСЕХ hook-файлах (C1 + C2):
- Каждая команда, ссылающаяся на tools, использует `.dev-pomogator/tools/`
- Если пути абсолютные — они тоже содержат `.dev-pomogator/tools/`
- Нет `tools/auto-commit/` без `.dev-pomogator/` перед ним

### C4. `.claude/settings.json` — нет дубликатов hooks
- Каждый hook-тип (Stop, etc.) не содержит дублирующихся команд

### C5. Pre-commit hook содержимое
- `.pre-commit-config.yaml` содержит repo/hook для `forbid-root-artifacts`
- Путь в конфиге: `.dev-pomogator/tools/forbid-root-artifacts/check.py` (или эквивалент)

---

## Чеклист D: Глобальные артефакты

### D1. Config: `HOME_DIR/.dev-pomogator/config.json`
- Файл существует
- `installedExtensions` содержит все 5: `auto-commit`, `forbid-root-artifacts`, `plan-pomogator`, `specs-workflow`, `suggest-rules`
- Каждое расширение имеет `projectPaths` с TEST_DIR
- `platforms` содержит установленные платформы

### D2. Config — пути в managed files
- Если поле `managed` присутствует:
  - Все tool-пути начинаются с `.dev-pomogator/tools/`
  - Нет bare `tools/` без `.dev-pomogator/`
  - Хеши (SHA-256) присутствуют
- Если `managed` отсутствует → **WARNING** (апдейтер не сможет трекать изменения)

### D3. Глобальные скрипты: `HOME_DIR/.dev-pomogator/scripts/`
- `check-update.js` существует и не пустой (bundled updater)
- `cursor-summarize.ts` существует (claude-mem wrapper для Cursor)
- `specs-validator/` директория с файлами (validate-specs.ts, completeness.ts, etc.)
- `steps-validator/` директория с файлами (validate-steps.ts, etc.)

### D4. Глобальные Cursor hooks: `HOME_DIR/.cursor/hooks/hooks.json`
- Файл существует
- Содержит `hooks` объект с ключами типа `beforeSubmitPrompt`, `stop`, etc.
- Hook команды содержат пути к:
  - `worker-service.cjs` (claude-mem)
  - `cursor-summarize.ts`
  - `validate-specs.ts`
  - `validate-steps.ts`
  - `check-update.js`
- Нет bare `tools/` без `.dev-pomogator/` в путях
- Нет дубликатов команд

### D5. Глобальные Claude hooks: `HOME_DIR/.claude/settings.json`
- Файл существует
- Содержит `hooks.Stop` с auto-update hook:
  - Команда содержит `check-update.js --claude` (или аналог)
  - Путь к скрипту — абсолютный путь к `HOME_DIR/.dev-pomogator/scripts/check-update.js`
- Нет bare `tools/` путей

### D6. Claude-mem — установка
- `HOME_DIR/.claude/plugins/marketplaces/thedotmack/` директория существует (или `claude-mem` подпапка)
- Если claude-mem для Cursor:
  - `HOME_DIR/.cursor/hooks/hooks.json` содержит `worker-service.cjs` в командах
  - Worker-service файл существует по указанному пути
- Если claude-mem для Claude Code:
  - Плагин установлен (проверить через `claude plugin list` если доступно, иначе по файлам)

### D7. Нет стейловых глобальных артефактов
- `HOME_DIR/.dev-pomogator/scripts/` НЕ содержит файлов со стейловыми путями `tools/` (без `.dev-pomogator/`)
- Глобальные hooks НЕ ссылаются на `tools/` без `.dev-pomogator/`

### D8. Нет `.user-overrides/` в корне TEST_DIR
- `TEST_DIR/.user-overrides` НЕ должна существовать
- `TEST_DIR/.dev-pomogator/.user-overrides/` может существовать (создаётся апдейтером при необходимости)

---

## Чеклист E: PostInstall зависимости

### E1. deps-install.py существует и валиден
- `TEST_DIR/.dev-pomogator/tools/forbid-root-artifacts/deps-install.py` существует
- Содержит `ensure_pyyaml` и `ensure_pre_commit`
- Не импортирует `yaml` (использует только stdlib)

### E2. deps-install.py выполняется без ошибок
- `python3 TEST_DIR/.dev-pomogator/tools/forbid-root-artifacts/deps-install.py` → exit code 0
- Вывод содержит `pyyaml` и `pre-commit`

### E3. Python зависимости доступны
- `python3 -c "import yaml"` — exit code 0 (pyyaml установлен)
- `python3 -m pre_commit --version` — exit code 0 (pre-commit установлен)

### E4. tsx доступен локально (если auto-commit установлен)
- `TEST_DIR/node_modules/.bin/tsx` существует ИЛИ `npx tsx --version` резолвит из локального node_modules
- Если tsx не найден → **WARN** (auto-commit Stop hook будет тормозить при первом вызове)

### E5. postInstall chain в манифесте forbid-root-artifacts
- Прочитать `extensions/forbid-root-artifacts/extension.json`
- `postInstall.command` содержит `deps-install.py && ` перед `configure.py`
- `toolFiles` содержит `deps-install.py`

---

## Формат отчёта агента

Каждый агент возвращает результат строго в формате:

```markdown
## Чеклист {A|B|C|D}: {Название}

| # | Проверка | Результат | Детали |
|---|----------|-----------|--------|
| X1 | Описание проверки | OK / FAIL / WARN / N/A | Подробности |

### Критические проблемы (если есть)
- [описание проблемы]

### Предупреждения (если есть)
- [описание предупреждения]
```

Уровни результатов:
- **OK** — проверка пройдена
- **FAIL** — критическая проблема, установка некорректна
- **WARN** — не критично, но требует внимания
- **N/A** — проверка неприменима (напр. файл не создаётся на данной платформе)
