# Design

## Реализуемые требования

- [FR-1: Hyper-V VM Lifecycle Scripts](FR.md#fr-1-hyper-v-vm-lifecycle-scripts)
- [FR-2: Snapshot Versioning](FR.md#fr-2-snapshot-versioning)
- [FR-3: GUI Access via VMConnect Enhanced Session Mode](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode)
- [FR-4: Native RDP Access via mstsc](FR.md#fr-4-native-rdp-access-via-mstsc)
- [FR-5: Test Fixture Mounting in VM](FR.md#fr-5-test-fixture-mounting-in-vm)
- [FR-6: AI Agent Skill `hyperv-test-runner`](FR.md#fr-6-ai-agent-skill-hyperv-test-runner)
- [FR-7: Visual Verification via Screenshots](FR.md#fr-7-visual-verification-via-screenshots)
- [FR-8: Test Scenario Catalog](FR.md#fr-8-test-scenario-catalog)
- [FR-9: Run Artifacts Logging](FR.md#fr-9-run-artifacts-logging)
- [FR-10: Catalog Extension Workflow](FR.md#fr-10-catalog-extension-workflow)
- [FR-11: Documentation Includes Evolution Roadmap](FR.md#fr-11-documentation-includes-evolution-roadmap)
- [FR-12: VM Cleanup](FR.md#fr-12-vm-cleanup)

## Архитектура (5 слоёв)

```
┌──────────────────────────────────────────────────────────┐
│  Layer 5 — AI Agent Skill                                │
│  .claude/skills/hyperv-test-runner/SKILL.md              │
│  (orchestration, triggers, multi-step algorithm)         │
└──────────────────────────────────────────────────────────┘
                          │ reads
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 4 — Test Catalog                                  │
│  tests/hyperv-scenarios/HV<NNN>_<slug>.yaml              │
│  tests/hyperv-scenarios/schema.json                      │
└──────────────────────────────────────────────────────────┘
                          │ executes via
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 3 — PowerShell Lifecycle Scripts                  │
│  tools/hyperv-test-runner/01-create-vm.ps1               │
│  tools/hyperv-test-runner/02-post-install.ps1            │
│  tools/hyperv-test-runner/03-checkpoint.ps1              │
│  tools/hyperv-test-runner/04-revert-and-launch.ps1       │
│  tools/hyperv-test-runner/05-cleanup.ps1                 │
└──────────────────────────────────────────────────────────┘
                          │ controls
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 2 — Hyper-V VM (claude-test)                      │
│  Win 11 Enterprise Eval + Node + Claude Code + git       │
│  Snapshots: baseline-clean, with-dpv-X.Y.Z, ...          │
└──────────────────────────────────────────────────────────┘
                          │ tests against
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 1 — Test Fixture                                  │
│  tests/fixtures/typical-claude-user/  (already exists)   │
│  copied into VM as C:\test-project                       │
└──────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────┐
         │  Cross-cutting:                     │
         │  - Visual verification              │
         │    (extensions/debug-screenshot/)   │
         │  - Run artifacts                    │
         │    (.dev-pomogator/hyperv-runs/)    │
         └─────────────────────────────────────┘
```

## Компоненты

- **`tools/hyperv-test-runner/01-create-vm.ps1`** — создание VM с правильной конфигурацией (Generation 2, vTPM, Secure Boot, dynamic memory, ISO mounted, boot order). Idempotent через `-Force`. Admin elevation check на старте.
- **`tools/hyperv-test-runner/02-post-install.ps1`** — запускается ВНУТРИ VM после установки Windows. Enable RDP + firewall, winget install Node.js LTS + Git, npm install Claude Code, опциональный browser auth.
- **`tools/hyperv-test-runner/03-checkpoint.ps1`** — `Checkpoint-VM -Name <vm> -SnapshotName <snap>`. Параметризован, проверяет существование VM и отсутствие snapshot с таким именем (или `-Force`).
- **`tools/hyperv-test-runner/04-revert-and-launch.ps1`** — `Restore-VMSnapshot` + `Start-VM` + `Wait-VM -For Heartbeat` + печать IP + `vmconnect.exe localhost <vm>`.
- **`tools/hyperv-test-runner/05-cleanup.ps1`** — полное удаление VM. Требует `-Confirm` или `-Force`. Опционально `-RemoveVHDX`.
- **`tools/hyperv-test-runner/lib/common.ps1`** — shared helpers: `Test-IsAdmin`, `Assert-HyperVAvailable`, `Wait-VMReady`, `Get-VMIPAddress`. Импортируется во все 0X скрипты.
- **`tests/hyperv-scenarios/schema.json`** — JSON Schema (Draft-07) для валидации YAML сценариев.
- **`tests/hyperv-scenarios/HV001_install-clean.yaml`** — reference сценарий: copy fixture → install dev-pomogator → assert managed files → assert gitignore marker → revert.
- **`.claude/skills/hyperv-test-runner/SKILL.md`** — AI skill orchestration с triggers и multi-step algorithm.
- **`.claude/skills/hyperv-test-runner/scripts/run-scenario.ps1`** — helper для skill: parse YAML scenario → execute steps inside VM → capture output → return structured result.
- **`extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`** — **REUSE** для всех visual capture, не дублировать.

## Где лежит реализация

- **Hyper-V scripts**: `tools/hyperv-test-runner/`
- **Test catalog**: `tests/hyperv-scenarios/`
- **AI skill**: `.claude/skills/hyperv-test-runner/`
- **Fixture target**: `tests/fixtures/typical-claude-user/` (уже существует, не модифицировать)
- **Run artifacts** (gitignored): `.dev-pomogator/hyperv-runs/`
- **Visual verify reuse**: `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`
- **Wiring**: `.gitignore` (добавить hyperv-runs + ISO/VHDX paths), `CLAUDE.md` Rules table (если skill становится always-apply)

## Алгоритм AI skill (full automation)

```
Input: scenario_id (например HV001) или natural language trigger
Output: report.md в .dev-pomogator/hyperv-runs/<ts>_<id>/

1. Resolve scenario:
   1a. Если scenario_id передан → load tests/hyperv-scenarios/<id>_*.yaml
   1b. Иначе AskUserQuestion из списка доступных файлов
   1c. Validate YAML против schema.json — fail если invalid

2. Prepare run dir:
   2a. ts = Get-Date -Format 'yyyy-MM-dd_HHmmss'
   2b. run_dir = .dev-pomogator/hyperv-runs/<ts>_<scenario_id>/
   2c. mkdir run_dir/screenshots
   2d. cp scenario.yaml → run_dir/scenario.yaml

3. Pre-flight checks:
   3a. Test-IsAdmin (skill spawns elevated PS process if not)
   3b. Assert-HyperVAvailable
   3c. Assert checkpoint exists: Get-VMSnapshot -VMName claude-test -Name <pre.checkpoint>

4. Revert + launch:
   4a. Restore-VMSnapshot -VMSnapshot $snap
   4b. Start-VM -Name claude-test
   4c. Wait-VMReady (poll heartbeat + IP, timeout 90s)
   4d. vmconnect.exe localhost claude-test (background)

5. Copy fixture into VM:
   5a. Use Copy-VMFile -VMName claude-test -SourcePath tests/fixtures/typical-claude-user -DestinationPath C:\test-project -CreateFullPath -FileSource Host
   5b. Альтернатива: PSSession + Copy-Item -ToSession

6. Execute steps:
   For each step in scenario.steps:
      6a. Invoke-Command -VMName claude-test -ScriptBlock (parsed step.cmd as ScriptBlock)
      6b. Capture stdout/stderr/exit_code → append run_dir/commands.log
      6c. Если step.screenshot=true → call screenshot.ps1, save to run_dir/screenshots/step-<N>.png

7. Evaluate assertions:
   For each assertion in scenario.assertions:
      7a. exit_code: проверить step's exit_code
      7b. file_exists / file_absent: Invoke-Command Test-Path
      7c. text_contains: Invoke-Command Get-Content + match
      7d. screenshot_match: Read PNG → compare with expected description → CONFIRMED/DENIED

8. Cleanup:
   8a. Restore-VMSnapshot baseline-clean (всегда, даже при exception)
   8b. Generate run_dir/report.md с CONFIRMED/DENIED summary

9. Report to human:
   9a. Print run_dir absolute path
   9b. Print summary table
   9c. If any DENIED → highlight + suggested next action
```

## API (PowerShell parameters)

### `01-create-vm.ps1`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `-VMName` | string | `claude-test` | Имя VM |
| `-VHDPath` | string | `D:\HyperV\claude-test.vhdx` | Путь к VHDX |
| `-IsoPath` | string | required | Win 11 Eval ISO |
| `-MemoryGB` | int | 6 | Startup memory |
| `-CPUCount` | int | 4 | vCPU |
| `-DiskGB` | int | 60 | VHDX size |
| `-Force` | switch | false | Recreate если уже существует |

### `04-revert-and-launch.ps1`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `-VMName` | string | `claude-test` | Имя VM |
| `-Snapshot` | string | `baseline-clean` | Имя checkpoint |
| `-NoVMConnect` | switch | false | Не открывать VMConnect окно |
| `-Timeout` | int | 90 | Timeout heartbeat в секундах |

### `run-scenario.ps1` (skill helper)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `-ScenarioPath` | string | required | Путь к YAML файлу |
| `-RunDir` | string | required | Output dir для артефактов |
| `-VMName` | string | `claude-test` | Целевая VM |

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_NONE

**Evidence:** Эта спека описывает **infrastructure для testing**, не сама создаёт test data в БД/API. BDD сценарии этой спеки (`.feature` файл) тестируют **статически**: что lifecycle скрипты существуют и валидны, что catalog schema корректна, что reference scenario парсится, что skill метаданные правильные, что README содержит roadmap. Никакие BDD сценарии этой спеки **не создают** реальные VMs, snapshots или fixtures runtime — это слишком долго и требует admin/ISO/Win install. Реальное E2E тестирование выполняется через сами hyperv scenarios (которые есть продукт спеки), не через BDD.

**Verdict:** Hooks/fixtures для BDD не требуются. Все .feature сценарии используют только статические Glob/Read проверки файлов и валидацию schema. Heavy infrastructure (VM creation, snapshot operations, скриншоты) тестируется вручную в Phase 1+ TASKS.md, не в BDD.

## Конструктивные решения и trade-offs

| Решение | Альтернатива | Причина выбора |
|---|---|---|
| Hyper-V VM, не Windows Sandbox | Sandbox (5-сек boot, no persistence) | Sandbox не поддерживает preinstalled software и checkpoints — нарушает FR-2 |
| Hyper-V, не Windows containers | Server Core контейнер | Контейнеры не имеют GUI и browser auth для Claude Code — нарушает FR-3, FR-7 |
| Win 11 Enterprise Eval ISO, не Quick Create gallery | Quick Create gallery image | Gallery image устарел (22H2) и не настраивает vTPM автоматически |
| YAML catalog, не JSON | JSON | Human-friendly multi-line строки команд, comments support |
| 5 lifecycle scripts, не один монолит | Один большой `manage-vm.ps1` | Каждый скрипт делает одну вещь, легче idempotent + testable |
| Reuse `screenshot.ps1`, не своя реализация | Собственный screenshot helper | DRY, post-edit-verification rule, единый формат имён файлов |
| Run artifacts в `.dev-pomogator/`, не `tests/` | `tests/hyperv-runs/` | `.dev-pomogator/` уже gitignored, не засоряет тесты |
| Skill инициируется явно, не auto-trigger на каждый stop | Hook PostToolUse runs scenario | VM cycle ~5 минут — слишком дорого делать на каждый change. Только по explicit request |
