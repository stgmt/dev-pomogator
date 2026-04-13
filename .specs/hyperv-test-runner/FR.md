# Functional Requirements (FR)

## FR-1: Hyper-V VM Lifecycle Scripts @feature1

Система ОБЯЗАНА предоставлять набор PowerShell-скриптов для управления жизненным циклом Hyper-V VM `claude-test`: создание (`01-create-vm.ps1`), post-install внутри VM (`02-post-install.ps1`), checkpoint (`03-checkpoint.ps1`), revert+launch (`04-revert-and-launch.ps1`), cleanup (`05-cleanup.ps1`). Скрипты идемпотентны, проверяют admin elevation на старте, параметризованы (`-VMName`, `-VHDPath`, `-IsoPath`, `-Snapshot`).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-initial-vm-setup-human-one-time)

## FR-2: Snapshot Versioning @feature2

Система ОБЯЗАНА поддерживать множественные именованные checkpoints VM (минимум: `baseline-clean`). Скрипты `03-checkpoint.ps1` и `04-revert-and-launch.ps1` принимают `-Snapshot <name>` как параметр. Список checkpoints доступен через `Get-VMSnapshot -VMName claude-test`. Откат к снапшоту ОБЯЗАН восстанавливать предыдущее состояние полностью (память, диск, сеть).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-7](USE_CASES.md#uc-7-multi-baseline-regression-matrix)

## FR-3: GUI Access via VMConnect Enhanced Session Mode @feature3

Система ОБЯЗАНА предоставлять GUI-доступ к VM через VMConnect (`vmconnect.exe localhost claude-test`). Enhanced Session Mode ОБЯЗАН быть включён на хосте (`Set-VMHost -EnableEnhancedSessionMode $true`) — даёт clipboard sharing, drive redirection, поддержку multi-display. Скрипт `04-revert-and-launch.ps1` ОБЯЗАН открывать окно VMConnect автоматически.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-daily-revert-launch-human-or-ai-agent)

## FR-4: Native RDP Access via mstsc @feature4

Система ОБЯЗАНА поддерживать классический RDP через `mstsc.exe /v:<vm-ip>` для случаев когда нужен full-screen multi-monitor. Внутри VM `02-post-install.ps1` ОБЯЗАН включать Remote Desktop (`fDenyTSConnections=0`) и Firewall rule (`Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'`). Скрипт `04-revert-and-launch.ps1` ОБЯЗАН печатать IP VM после старта для копипаста в `mstsc`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-6](USE_CASES.md#uc-6-human-investigates-failure-manual-override)

## FR-5: Test Fixture Mounting in VM @feature5

Система ОБЯЗАНА предоставлять механизм передачи `tests/fixtures/typical-claude-user/` в VM. Минимум — drag-and-drop через VMConnect Enhanced Session (host → guest). Опционально — host drive `\\tsclient\<letter>` доступен внутри VM. AI agent ОБЯЗАН копировать fixture в `C:\test-project\` внутри VM перед каждым сценарием.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ai-agent-runs-scenario-from-catalog-full-automation)

## FR-6: AI Agent Skill `hyperv-test-runner` @feature6

Система ОБЯЗАНА предоставлять Claude Code skill в `.claude/skills/hyperv-test-runner/SKILL.md` с frontmatter (`name`, `description`, `allowed-tools`) и пошаговым алгоритмом: load scenario → revert checkpoint → start VM → wait ready → execute steps → capture screenshot → analyze → revert → report. Skill ОБЯЗАН содержать триггеры на естественном языке ("протестируй в VM", "запусти hyperv test", "test in clean windows", "проверь на чистой винде"). `allowed-tools` ОБЯЗАН включать минимум: Bash, Read, Edit, Write, Glob, Grep.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ai-agent-runs-scenario-from-catalog-full-automation)

## FR-7: Visual Verification via Screenshots @feature7

Система ОБЯЗАНА поддерживать визуальную проверку GUI/TUI/statusline состояния через screenshots окна VM. Skill `hyperv-test-runner` ОБЯЗАН переиспользовать `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1` для capture, читать PNG через multimodal Read, сравнивать с ожидаемым state из сценария, и формировать вывод в формате `Вижу: ... | Ожидал: ... | Result: CONFIRMED/DENIED`. Screenshots ОБЯЗАНЫ сохраняться в `.dev-pomogator/hyperv-runs/<timestamp>/screenshots/`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-ai-visual-verification-of-gui-state)

## FR-8: Test Scenario Catalog @feature8

Система ОБЯЗАНА предоставлять test catalog как набор YAML-файлов в `tests/hyperv-scenarios/HV<NNN>_<slug>.yaml`. Каждый файл следует schema из `hyperv-test-runner_SCHEMA.md`: `id`, `name`, `description`, `preconditions.checkpoint`, `steps[].cmd`, `assertions[]` (типы: `exit_code`, `file_exists`, `file_absent`, `text_contains`, `screenshot_match`), `post_test.revert`. Catalog ОБЯЗАН содержать минимум 1 reference сценарий `HV001_install-clean.yaml`. JSON Schema валидация через `tests/hyperv-scenarios/schema.json`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ai-agent-runs-scenario-from-catalog-full-automation)

## FR-9: Run Artifacts Logging @feature9

Каждый запуск сценария AI agent-ом ОБЯЗАН создавать директорию `.dev-pomogator/hyperv-runs/<YYYY-MM-DD_HHmmss>_<scenario-id>/` с файлами: `scenario.yaml` (копия выполненного), `commands.log` (stdout/stderr каждой команды), `screenshots/*.png`, `report.md` (CONFIRMED/DENIED summary). Директория `.dev-pomogator/hyperv-runs/` ОБЯЗАНА быть в `.gitignore` репозитория.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ai-agent-runs-scenario-from-catalog-full-automation), [UC-4](USE_CASES.md#uc-4-ai-visual-verification-of-gui-state)

## FR-10: Catalog Extension Workflow @feature10

Skill ОБЯЗАН поддерживать команду расширения каталога: при появлении новой spec в `.specs/<feature>/` AI agent читает её `FR.md`, `FILE_CHANGES.md`, `<feature>.feature` и **генерирует draft** `tests/hyperv-scenarios/HV<NNN+1>_<feature>.yaml` с `preconditions`, `steps`, `assertions` выведенными из FR. Draft ОБЯЗАН быть прогнан против VM до commit. Human review-ит и принимает/отклоняет. Существующие catalog файлы НЕ модифицируются автоматически.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-5](USE_CASES.md#uc-5-ai-extends-test-catalog-after-new-feature)

## FR-11: Documentation Includes Evolution Roadmap @feature11

`README.md` спеки ОБЯЗАН содержать секцию `## Roadmap` с явными фазами эволюции: v0 (manual setup + manual run), v1 (PowerShell scripts automate VM lifecycle), v2 (AI skill orchestrates fixed catalog), v3 (AI auto-generates scenarios from new spec FR.md), v4 (multi-baseline regression matrix). Каждая фаза ОБЯЗАНА указывать критерии "входа" (что должно существовать чтобы эта фаза работала) и "выхода" (что должно работать чтобы перейти к следующей).

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** N/A — документация

## FR-12: VM Cleanup @feature12

Скрипт `05-cleanup.ps1` ОБЯЗАН поддерживать полную очистку: `Stop-VM` → удаление всех snapshots (`Get-VMSnapshot | Remove-VMSnapshot`) → `Remove-VM` → опционально `Remove-Item *.vhdx` (через `-RemoveVHDX` параметр, default=false для безопасности). Скрипт ОБЯЗАН требовать `-Confirm` или `-Force` для предотвращения случайного удаления.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-8](USE_CASES.md#uc-8-cleanup-human-rare)
