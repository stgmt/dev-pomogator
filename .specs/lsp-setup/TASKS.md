# Tasks

## Phase 0: BDD Foundation

### Task 0.1: Create BDD feature file @feature1 @feature2 @feature5 @feature7
- [ ] Создать `tests/features/plugins/lsp-setup/LSP001_lsp-setup.feature`
- [ ] Скопировать сценарии из `.specs/lsp-setup/lsp-setup.feature`
- [ ] Адаптировать Background и Given шаги под существующие паттерны из `CORE003_claude-installer.feature`

### Task 0.2: Create E2E test scaffold @feature1
- [ ] Создать `tests/e2e/lsp-setup.test.ts` с describe `LSP001: LSP Setup Extension`
- [ ] Добавить it-блоки с CODE_NN matching .feature сценариев (LSP001_01 - LSP001_09)
- [ ] Импортировать helpers из `tests/e2e/helpers.ts` (runInstaller, appPath, etc.)

---

## Phase 1: Extension Manifest & Rule @feature1 @feature6

### Task 1.1: Create extension.json
- [ ] Создать `extensions/lsp-setup/extension.json`
- [ ] _Config: см. DESIGN.md секция "extension.json Structure"_
- [ ] Включить: tools, toolFiles, ruleFiles, envRequirements (ENABLE_LSP_TOOL), postInstall, postUpdate
- refs: [FR-1](FR.md), [FR-6](FR.md)

### Task 1.2: Create LSP usage rule
- [ ] Создать `extensions/lsp-setup/claude/rules/lsp-usage.md`
- [ ] Содержание: goToDefinition > grep, findReferences > grep, hover для типов, дождаться диагностик после edit
- [ ] Добавить строку в CLAUDE.md таблицу Rules
- refs: [FR-5](FR.md)

### Verify Phase 1
- [ ] Сценарии LSP001_01, LSP001_02, LSP001_03 переходят из Red в Green

---

## Phase 2: Setup Script Core @feature2 @feature3 @feature4 @feature5

### Task 2.1: Create setup-lsp.ts — runtime detection
- [ ] Создать `extensions/lsp-setup/tools/lsp-setup/setup-lsp.ts`
- [ ] Реализовать `checkRuntime('node')` — проверка наличия и версии (>= 16), fail-fast если отсутствует
- [ ] Реализовать `checkRuntime('dotnet')` — проверка наличия и версии (>= 10), skip если отсутствует
- [ ] Cross-platform: `which` (Unix) / `where` (Windows)
- refs: [FR-3](FR.md)

### Task 2.2: Create setup-lsp.ts — LSP server installation
- [ ] Реализовать LSP_SERVERS registry (массив LspServer объектов)
- [ ] _Config: см. DESIGN.md секция "LSP Server Registry"_
- [ ] Для каждого сервера: check binary in PATH → if missing, run installCmd → verify
- [ ] Idempotent: пропускать уже установленные (`vtsls: already installed`)
- [ ] Partial install: ошибка одного сервера не останавливает установку остальных
- refs: [FR-2](FR.md), [FR-8](FR.md)

### Task 2.3: Create setup-lsp.ts — verification report
- [ ] После всех установок вывести таблицу: Language | Server | Binary | Status
- [ ] Status: `installed` | `already installed` | `skipped: {reason}` | `failed: {error}`
- [ ] Итого: `N/M LSP servers installed`
- refs: [FR-7](FR.md)

### Verify Phase 2
- [ ] Сценарии LSP001_04, LSP001_05, LSP001_07 переходят из Red в Green

---

## Phase 3: Plugin Installation & Fallback @feature7

### Task 3.1: Create bundled local plugins
- [ ] Создать 4 директории плагинов в `extensions/lsp-setup/tools/lsp-setup/plugins/`
- [ ] Для каждого (vtsls-lsp, json-lsp, pyright-lsp, csharp-lsp): `.claude-plugin/plugin.json` + `.lsp.json`
- [ ] _Config: см. DESIGN.md секция "Архитектура > Компоненты"_
- [ ] Создать `marketplace.json` для локального маркетплейса
- refs: [FR-4](FR.md)

### Task 3.2: Implement plugin installation in setup-lsp.ts
- [ ] Попытка: `claude plugin marketplace add Piebald-AI/claude-code-lsps` + install plugins
- [ ] Timeout: 30 секунд на marketplace add
- [ ] При ошибке: fallback на локальный маркетплейс из `.dev-pomogator/tools/lsp-setup/plugins/`
- [ ] `claude plugin marketplace add` из локального пути + `claude plugin install` для каждого
- refs: [FR-4](FR.md)

### Verify Phase 3
- [ ] Сценарий LSP001_06 переходит из Red в Green

---

## Phase 4: Update & Verification @feature1

### Task 4.1: Implement --update mode
- [ ] Добавить `--update` flag в setup-lsp.ts
- [ ] При --update: только проверять новые серверы и доустанавливать недостающие
- [ ] Не переустанавливать существующие
- refs: [FR-9](FR.md)

### Task 4.2: Create verify-lsp.ts
- [ ] Создать standalone скрипт `extensions/lsp-setup/tools/lsp-setup/verify-lsp.ts`
- [ ] Проверять: бинари в PATH, ENABLE_LSP_TOOL в settings.json, rule файл
- [ ] Выводить итоговую таблицу
- refs: [FR-7](FR.md)

### Verify Phase 4
- [ ] Сценарии LSP001_08, LSP001_09 переходят из Red в Green

---

## Phase 5: Refactor & Final Verification

### Task 5.1: Final integration test
- [ ] Запустить все тесты: `/run-tests lsp-setup`
- [ ] Все 9 BDD сценариев GREEN
- [ ] E2E тест-план выполнен
- [ ] Проверить что CORE003_RULES динамический тест покрывает lsp-usage.md

### Task 5.2: Code review
- [ ] `/simplify` для review качества кода
- [ ] Проверить extension-manifest-integrity (toolFiles покрывает все файлы)
- [ ] Проверить updater-sync-tools-hooks (апдейтер сможет обновить все артефакты)
