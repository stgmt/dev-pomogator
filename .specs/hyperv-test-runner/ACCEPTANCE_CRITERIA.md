# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts)

WHEN human запускает `tools/hyperv-test-runner/01-create-vm.ps1` от admin с параметрами `-VMName claude-test -IsoPath D:\iso\Win11_Enterprise_Eval.iso` THEN система SHALL создать Generation 2 VM с 6 GB startup memory, 4 vCPU, 60 GB VHDX, vTPM enabled, Secure Boot on, ISO mounted as first boot device, и SHALL завершиться exit code 0 с печатью "VM created: claude-test".

IF VM с таким именем уже существует AND `-Force` НЕ передан THEN система SHALL fail-fast с сообщением "VM 'claude-test' already exists. Use -Force to recreate." и НЕ изменять существующую VM.

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-snapshot-versioning)

WHEN human запускает `03-checkpoint.ps1 -Snapshot baseline-clean` AND VM `claude-test` существует AND VM в состоянии `Running` или `Off` THEN система SHALL создать checkpoint с указанным именем и SHALL вернуть exit 0 с подтверждением "Checkpoint created: baseline-clean".

WHEN AI agent запускает `04-revert-and-launch.ps1 -Snapshot baseline-clean` THEN система SHALL вызвать `Restore-VMSnapshot` с указанным snapshot AND SHALL стартовать VM AND SHALL дождаться heartbeat ready signal AND SHALL завершиться exit 0 в течение 60 секунд.

IF указанный snapshot не существует THEN система SHALL fail с сообщением "Snapshot 'baseline-clean' not found. Available: <list of existing snapshots>" и exit non-zero.

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode)

WHEN скрипт `04-revert-and-launch.ps1` завершается успешно THEN система SHALL открыть окно `vmconnect.exe localhost claude-test` AND окно SHALL показывать desktop VM в течение 10 секунд AND Enhanced Session Mode SHALL быть active (clipboard sharing работает, drive redirection доступен).

IF Enhanced Session Mode disabled на хосте THEN система SHALL detect через `Get-VMHost | Select EnableEnhancedSessionMode` AND SHALL warn human-у с командой исправления `Set-VMHost -EnableEnhancedSessionMode $true`.

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-native-rdp-access-via-mstsc)

WHEN скрипт `02-post-install.ps1` запущен внутри VM от admin THEN система SHALL установить `HKLM:\System\CurrentControlSet\Control\Terminal Server\fDenyTSConnections = 0` AND SHALL включить firewall rule `Remote Desktop` AND SHALL вернуть exit 0.

WHEN скрипт `04-revert-and-launch.ps1` завершается AND VM получила IP адрес THEN система SHALL напечатать строку `RDP: mstsc /v:<ip>` для копипаста.

WHEN human запускает `mstsc /v:<vm-ip>` THEN VM SHALL принять подключение и показать desktop в полноэкранном режиме с поддержкой `/multimon`.

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-test-fixture-mounting-in-vm)

WHEN human или AI agent копирует папку `tests/fixtures/typical-claude-user/` через clipboard/drag-drop из VMConnect Enhanced Session AND VM has Enhanced Session active THEN VM SHALL получить полную копию папки в `C:\test-project\` с сохранением структуры (`.claude/`, `package.json`, `src/`, etc.).

IF AI agent выполняет сценарий который требует fixture THEN agent SHALL гарантировать копию fixture в VM ДО первой команды сценария.

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner)

WHEN human говорит "протестируй в VM" или "запусти hyperv test" или "проверь на чистой винде" THEN Claude Code SHALL активировать skill `hyperv-test-runner` AND skill SHALL прочитать `.claude/skills/hyperv-test-runner/SKILL.md` AND SHALL начать алгоритм load-revert-launch-execute-screenshot-analyze-revert-report.

WHEN skill активирован AND нет указания конкретного сценария THEN skill SHALL предложить human-у выбор из доступных файлов в `tests/hyperv-scenarios/` через AskUserQuestion.

IF SKILL.md frontmatter не содержит обязательные поля (`name`, `description`, `allowed-tools`) THEN skill SHALL fail на старте с сообщением "Skill metadata invalid".

## AC-7 (FR-7) @feature7

**Требование:** [FR-7](FR.md#fr-7-visual-verification-via-screenshots)

WHEN скрипт сценария содержит assertion `screenshot_match: <expected-description>` THEN AI agent SHALL вызвать `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1 -Label <scenario-id>-<step-N>` AND SHALL прочитать сохранённый PNG через Read AND SHALL сравнить визуальное содержимое с expected description AND SHALL вернуть `Result: CONFIRMED` или `Result: DENIED — <reason>`.

WHEN screenshot capture fails (нет окна VMConnect, screen blank) THEN agent SHALL пометить assertion как DENIED с причиной "Screenshot capture failed: <error>" и продолжить выполнение сценария.

## AC-8 (FR-8) @feature8

**Требование:** [FR-8](FR.md#fr-8-test-scenario-catalog)

WHEN human или AI agent создаёт файл `tests/hyperv-scenarios/HV<NNN>_<slug>.yaml` THEN файл SHALL валидироваться против JSON Schema из `tests/hyperv-scenarios/schema.json` AND SHALL содержать обязательные поля: `id`, `name`, `description`, `preconditions.checkpoint`, `steps[]`, `assertions[]`, `post_test.revert`.

IF файл нарушает schema THEN валидатор SHALL fail с указанием конкретного поля и ожидаемого типа.

WHEN catalog содержит сценарий `HV001_install-clean.yaml` THEN он SHALL быть reference example который покрывает: copy fixture, install dev-pomogator, assert managed files exist, assert .gitignore marker block добавлен, revert.

## AC-9 (FR-9) @feature9

**Требование:** [FR-9](FR.md#fr-9-run-artifacts-logging)

WHEN AI agent запускает сценарий THEN agent SHALL создать директорию `.dev-pomogator/hyperv-runs/<YYYY-MM-DD_HHmmss>_<scenario-id>/` AND SHALL положить туда `scenario.yaml` (копию), `commands.log` (stdout/stderr каждого step), `screenshots/<step-N>.png` для каждого screenshot assertion, и `report.md` с итоговым CONFIRMED/DENIED summary.

WHEN сценарий завершён THEN agent SHALL напечатать абсолютный путь к директории артефактов в финальном отчёте.

WHEN существующий `.gitignore` НЕ содержит `.dev-pomogator/hyperv-runs/` THEN установщик/post-install шаг SHALL добавить его (через managed marker block).

## AC-10 (FR-10) @feature10

**Требование:** [FR-10](FR.md#fr-10-catalog-extension-workflow)

WHEN human говорит "добавь сценарий для <feature> в hyperv catalog" THEN AI agent SHALL прочитать `.specs/<feature>/FR.md`, `.specs/<feature>/FILE_CHANGES.md`, `.specs/<feature>/<feature>.feature` AND SHALL сгенерировать draft `tests/hyperv-scenarios/HV<next-num>_<feature>.yaml` с steps выведенными из FR и assertions из FILE_CHANGES.

WHEN draft создан THEN agent SHALL прогнать его против VM (UC-3) AND SHALL показать human-у результаты + предложить commit или редактирование.

IF существующий catalog файл с тем же id или slug уже существует THEN agent SHALL fail с предложением выбрать другой номер или использовать `--force` для overwrite (НЕ default).

## AC-11 (FR-11) @feature11

**Требование:** [FR-11](FR.md#fr-11-documentation-includes-evolution-roadmap)

WHEN human открывает `.specs/hyperv-test-runner/README.md` THEN README SHALL содержать секцию `## Roadmap` с минимум 5 фазами (v0..v4), каждая фаза SHALL иметь подсекции "Entry criteria" и "Exit criteria", AND README SHALL явно указывать текущую active фазу.

## AC-12 (FR-12) @feature12

**Требование:** [FR-12](FR.md#fr-12-vm-cleanup)

WHEN human запускает `05-cleanup.ps1` БЕЗ `-Confirm` или `-Force` THEN система SHALL fail с сообщением "Destructive operation. Pass -Confirm or -Force to proceed." AND НЕ изменять состояние VM.

WHEN human запускает `05-cleanup.ps1 -Confirm` THEN система SHALL вызвать `Stop-VM` → `Get-VMSnapshot | Remove-VMSnapshot` → `Remove-VM` AND SHALL вернуть exit 0 с печатью "VM 'claude-test' removed".

IF `-RemoveVHDX` передан THEN система SHALL также удалить VHDX файл с диска ПОСЛЕ Remove-VM.
