# План работ

## User Stories
- Как разработчик, я хочу чтобы установка MCP не создавала дубликаты, чтобы список инструментов был чистым в Cursor и Claude Code.
- Как тимлид, я хочу чтобы dev-pomogator корректно выбирал project/global конфиг, чтобы обновления не ломали настройки команды.

## Use Cases
- UC-1: Установка specs-workflow в проекте, где есть `.cursor/mcp.json` и глобальный `~/.cursor/mcp.json` → запись только в project.
- UC-2: Установка в проекте без `.cursor/mcp.json` → запись в глобальный `~/.cursor/mcp.json`.
- Edge cases: оба конфига существуют и содержат разные сервера; `mcp.json` поврежден; `mcpServers` отсутствует; Claude Code использует `.mcp.json` в корне; Windows пути.

## Requirements

### FR (Functional Requirements)
- FR-1: Скрипт выбора конфигурации использует project `.cursor/mcp.json`, если файл существует.
- FR-2: Для Claude Code скрипт ищет project `.mcp.json`, затем global `~/.mcp.json`, и поддерживает `~/.claude.json` как fallback.
- FR-3: При наличии project-конфига скрипт не пишет во второй (global) файл и не создает дубликаты.
- FR-4: Скрипт логирует выбранный конфиг и причину выбора (project/global/fallback).
- FR-5: Скрипт сохраняет посторонние поля в конфиге и использует backup/restore как сейчас.

### Acceptance Criteria (EARS)
- WHEN установка запускается AND существует project `.cursor/mcp.json` THEN setup SHALL писать только в project конфиг и SHALL NOT изменять `~/.cursor/mcp.json`.
- WHEN установка запускается AND project `.cursor/mcp.json` отсутствует THEN setup SHALL писать в `~/.cursor/mcp.json`.
- WHEN установка для Claude Code запускается AND существует project `.mcp.json` THEN setup SHALL писать только в project конфиг.
- WHEN установка для Claude Code запускается AND project `.mcp.json` отсутствует AND `~/.mcp.json` существует THEN setup SHALL писать в `~/.mcp.json`.
- IF конфиг поврежден AND backup существует THEN setup SHALL восстановить backup и продолжить установку.
- WHEN в конфиге есть prefixed-ключи (user-/cursor-/claude-) THEN setup SHALL считать сервер установленным и SHALL NOT добавлять дубликаты.

### NFR (Non-Functional Requirements)
- Performance: Чтение не более двух конфигов на платформу.
- Security: Не создает project-конфиг с секретами, если он отсутствует; использует уже существующие файлы.
- Reliability: Backup + atomic write остаются обязательными.
- Usability: Логи содержат путь выбранного конфига и причину.

### Assumptions
- Скрипт запускается из корня проекта (cwd = repo root) через postInstall.
- Claude Code использует `.mcp.json` (project root + home), `~/.claude.json` сохраняется как fallback для обратной совместимости.

## Implementation Plan
1. Зафиксировать текущую логику путей и логирования в `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`, `.dev-pomogator/tools/mcp-setup/setup-mcp.py`, `tests/e2e/mcp-setup.test.ts`, `extensions/specs-workflow/tools/mcp-setup/README.md`, `.dev-pomogator/tools/mcp-setup/README.md`.
2. Добавить резолвер пути конфигурации с учетом project-конфигов (`.cursor/mcp.json` и `.mcp.json`) и fallback на глобальные файлы (`~/.cursor/mcp.json`, `~/.mcp.json`, `~/.claude.json`).
3. Обновить установку так, чтобы запись происходила только в выбранный конфиг и не затрагивала альтернативные пути при наличии project-конфига.
4. Обновить e2e-тесты `tests/e2e/mcp-setup.test.ts` под новые пути и кейсы (project + global).
5. Обновить README для mcp-setup с приоритетами и путями конфигов.
6. Прогнать валидатор плана и убедиться в корректной структуре.

## Todos
- id: resolve-config-paths
  description: Добавить выбор project/global путей и fallback для Claude Code; files: edit extensions/specs-workflow/tools/mcp-setup/setup-mcp.py, tools/mcp-setup/setup-mcp.py; Requirements refs: FR-1, FR-2, FR-3, FR-4, FR-5, NFR-Reliability; Leverage: extensions/specs-workflow/tools/mcp-setup/setup-mcp.py
  dependencies: []
- id: update-mcp-setup-tests
  description: Обновить e2e тесты под новые пути и кейсы project-конфигов; files: edit tests/e2e/mcp-setup.test.ts; Requirements refs: FR-1, FR-2, FR-3, AC-1, AC-2, AC-3, AC-4; Leverage: tests/e2e/mcp-setup.test.ts
  dependencies: [resolve-config-paths]
- id: refresh-mcp-setup-docs
  description: Обновить документацию путей и приоритетов для Cursor/Claude Code; files: edit extensions/specs-workflow/tools/mcp-setup/README.md, tools/mcp-setup/README.md; Requirements refs: FR-4, NFR-Usability; Leverage: extensions/specs-workflow/tools/mcp-setup/README.md
  dependencies: [resolve-config-paths]

## Definition of Done (DoD)
- Установка MCP не создает дубликаты при наличии project и global конфигов.
- Для Claude Code корректно обрабатывается `.mcp.json` и fallback на `~/.claude.json`.
- Тесты и документация обновлены и согласованы.
- План прошел валидатор.

### Verification Plan
- Automated Tests:
  - `npx vitest run tests/e2e/mcp-setup.test.ts --reporter=verbose`
- Manual Verification:
  - Создать project `.cursor/mcp.json` и global `~/.cursor/mcp.json`, выполнить установку и проверить, что обновлен только project файл.
  - Создать project `.mcp.json` и global `~/.mcp.json`, выполнить установку для Claude Code и проверить отсутствие дублей.

## File Changes
| Path | Action | Reason |
|---|---|---|
| `.dev-pomogator/tools/plan-pomogator/mcp-dedupe.plan.md` | create | Зафиксировать план работ по устранению дублей MCP. |
| `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` | edit | Добавить выбор project/global конфигов и устранение дублей. |
| `.dev-pomogator/tools/mcp-setup/setup-mcp.py` | edit | Синхронизировать логику с расширением. |
| `tests/e2e/mcp-setup.test.ts` | edit | Обновить тесты под новые пути и кейсы. |
| `extensions/specs-workflow/tools/mcp-setup/README.md` | edit | Обновить пути и приоритеты конфигов. |
| `.dev-pomogator/tools/mcp-setup/README.md` | edit | Синхронизировать документацию. |
