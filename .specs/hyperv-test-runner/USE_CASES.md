# Use Cases

## UC-1: Initial VM Setup (human, one-time)

Human developer впервые готовит окружение для последующих автоматизированных тестов.

- Скачивает Win 11 Enterprise Evaluation ISO (~5 GB) с Microsoft Evaluation Center и кладёт в `D:\iso\`
- Запускает `tools/hyperv-test-runner/01-create-vm.ps1` от админа — создаётся VM с vTPM, Secure Boot, ISO mounted, dynamic memory 2-8 GB, 4 vCPU, 60 GB VHDX
- Открывается VMConnect — interactive Windows install (~25 мин), local account через `oobe\bypassnro` trick
- В VM запускает `02-post-install.ps1` — enable RDP, winget install Node + Git, npm install Claude Code, опциональный browser auth
- На хосте: `03-checkpoint.ps1 -Snapshot baseline-clean`
- **Результат**: VM `claude-test` с checkpoint `baseline-clean`, готова к использованию

## UC-2: Daily revert + launch (human OR AI agent)

Перед тестом откат к чистому baseline.

- Запускается `tools/hyperv-test-runner/04-revert-and-launch.ps1 -Snapshot baseline-clean`
- Скрипт: `Restore-VMSnapshot` → `Start-VM` → `vmconnect.exe localhost claude-test`
- Через ~10 секунд VM готова, fixture можно копировать через clipboard / shared drive
- **Результат**: чистая VM с предустановленным baseline, окно VMConnect открыто

## UC-3: AI agent runs scenario from catalog (full automation)

AI agent получает запрос "протестируй install dev-pomogator на чистой винде" и оркестрирует полный цикл.

- Skill `hyperv-test-runner` activates по триггеру
- Agent читает `tests/hyperv-scenarios/HV001_install-clean.yaml`
- Agent: `04-revert-and-launch.ps1 -Snapshot baseline-clean`
- Agent ждёт ready signal (poll heartbeat / IP появился)
- Agent выполняет команды сценария внутри VM через `Invoke-Command -VMName` или PSSession
- Agent делает screenshot окна VM через `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`
- Agent читает screenshot multimodally, сравнивает с ожидаемым state из сценария
- Agent отчитывается human-у: CONFIRMED / DENIED + текстовое описание + ссылки на screenshots/logs
- Agent revert checkpoint
- **Результат**: human получает structured отчёт без необходимости трогать VM руками

## UC-4: AI visual verification of GUI state

Test passing по exit code, но визуально что-то не так (например statusline пустая).

- Скрипт сценария завершился `exit 0`, но в assertion есть `screenshot_match: statusline_visible`
- Agent делает screenshot
- Agent читает: "Вижу: пустую строку statusline. Ожидал: текст 'typical-claude-user'. Result: DENIED"
- Agent ставит test как FAIL даже при `exit 0`, кладёт screenshot в `.dev-pomogator/hyperv-runs/<ts>/screenshots/`
- **Результат**: визуальные регрессии не пропускаются

## UC-5: AI extends test catalog after new feature

В dev-pomogator merge'нулась новая фича `.specs/foo-bar/`, нужно добавить её в hyperv test catalog.

- Human говорит: "добавь сценарий для foo-bar в hyperv catalog"
- Agent читает `.specs/foo-bar/FR.md`, `.specs/foo-bar/FILE_CHANGES.md`, `.specs/foo-bar/foo-bar.feature`
- Agent генерирует draft `tests/hyperv-scenarios/HV<NNN>_foo-bar.yaml` с preconditions/steps/assertions, выведенными из FR
- Agent запускает draft против VM (UC-3)
- Agent показывает human-у результат + предлагает commit catalog file
- **Результат**: catalog растёт пропорционально продукту, human только review-ит

## UC-6: Human investigates failure (manual override)

Сценарий failed, agent дал отчёт, но root cause не очевиден.

- Human запускает `04-revert-and-launch.ps1 -Snapshot baseline-clean`
- Открывается VMConnect, human вручную воспроизводит шаги из failing scenario
- Human может подключиться через `mstsc /v:<vm-ip> /multimon` для full-screen multi-monitor, видит детали GUI
- Human фиксит баг в dev-pomogator, обновляет сценарий или ассерты
- **Результат**: full GUI control когда автоматизация недостаточна

## UC-7: Multi-baseline regression matrix

Тестирование одной фичи против разных версий dev-pomogator.

- Human создал несколько checkpoints: `with-dpv-1.4.0`, `with-dpv-1.4.1`, `with-dpv-1.4.2`
- Agent читает scenario `HV050_uninstall-no-leftovers.yaml`
- Agent в цикле: для каждого checkpoint → revert → run scenario → assert → revert
- Agent отчитывается матрицей: `1.4.0 PASS, 1.4.1 PASS, 1.4.2 FAIL` + screenshot 1.4.2
- **Результат**: regression detection across versions

## UC-8: Cleanup (human, rare)

Полностью убрать VM (например для пересоздания baseline после major Win update).

- Human: `tools/hyperv-test-runner/05-cleanup.ps1 -RemoveVHDX`
- Скрипт: `Stop-VM` → `Get-VMSnapshot | Remove-VMSnapshot` → `Remove-VM` → опционально `Remove-Item *.vhdx`
- **Результат**: чистый хост, можно начать с UC-1 заново
