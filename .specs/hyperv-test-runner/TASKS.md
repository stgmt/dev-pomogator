# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red → Green → Refactor.
> Phase 0 = создать BDD сценарии (Red), затем Phase 1+ реализация по группам FR (Green), затем Phase 7 рефакторинг.
> Каждая implementation задача ссылается на @featureN сценарий.

## Phase -1: Infrastructure Prerequisites (one-time, human)

> Подготовка ISO и проверка хоста ПЕРЕД любым кодом.

- [ ] Скачать **Win 11 Enterprise Evaluation ISO** с https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise (~5 GB) — сохранить в `D:\iso\Win11_Enterprise_Eval.iso`
  _Verified: [Microsoft Evaluation Center](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise) — 90-day eval, no product key required_
- [ ] Проверить что Hyper-V Module установлен: `Get-Module Hyper-V -ListAvailable` → должен вернуть version
- [ ] Проверить что Hyper-V Platform feature включён: `Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All` (требует admin) → State=Enabled
- [ ] Проверить Enhanced Session Mode: `Get-VMHost | fl EnableEnhancedSessionMode` → True
- [ ] Создать папку для VHDX: `New-Item -ItemType Directory -Path D:\HyperV -Force`
- [ ] Проверить дисковое место: ≥ 60 GB free на target диске

## Phase 0: BDD Foundation (Red) — ✅ COMPLETED 2026-04-08

> Создать BDD сценарии и убедиться что они FAIL — реализации ещё нет.
> **TEST_DATA_NONE** (см. DESIGN.md "BDD Test Infrastructure") — hooks/fixtures runtime не нужны, все сценарии статические.

- [x] Создать `.specs/hyperv-test-runner/hyperv-test-runner.feature` с 16 BDD сценариями (HVTR001-016) -- @feature1..@feature12
  _Source: эта спека, заполнено в Phase 2 Requirements + Design_
- [x] Создать `tests/e2e/hyperv-test-runner.test.ts` — Vitest файл с 35 individual `it()` блоками, маппинг к HVTR001-016, использует `appPath()`, `fs-extra`, `yaml`, `spawnSync` для PowerShell AST. PowerShell AST checks (HVTR003/004/014) skip на non-Windows.
- [x] Verify: первый запуск показал 13 passed (которые проверяют файлы спеки), 22 failed (Red baseline для implementation файлов которых ещё нет)

## Phase 1: Lifecycle Scripts (Green) — ✅ COMPLETED 2026-04-08

> Реализация PowerShell скриптов управления VM. После этой фазы human может вручную создавать/использовать VM.

- [x] Создать `tools/hyperv-test-runner/lib/common.ps1` — shared helpers: `Test-IsAdmin`, `Assert-Admin` (fail-fast, не auto-relaunch), `Assert-HyperVAvailable`, `Wait-VMReady` (heartbeat poll + IPv4 acquisition), `Get-VMIPAddress` -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts), [NFR-Reliability](NFR.md#reliability)_
- [x] Создать `tools/hyperv-test-runner/01-create-vm.ps1` — `New-VM` Generation 2 + vTPM (`New-HgsGuardian` + `Set-VMKeyProtector` + `Enable-VMTPM`) + Secure Boot + ISO mount + secondary unattend ISO (через `oscdimg.exe` если доступен) + boot order + dynamic memory + idempotency через `-Force` -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts), [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)_
- [x] Создать `tools/hyperv-test-runner/02-post-install.ps1` — RDP enable (registry + firewall), winget Node + Git, npm Claude Code (запускается ВНУТРИ VM через SetupComplete.cmd hook), создаёт sentinel `C:\post-install-complete.flag` -- @feature4
  _Requirements: [FR-4](FR.md#fr-4-native-rdp-access-via-mstsc), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)_
- [x] Создать `tools/hyperv-test-runner/03-checkpoint.ps1` — `Checkpoint-VM -Name <vm> -SnapshotName <snap>` параметризованный, idempotency через `-Force` overwrite, verify через `Get-VMSnapshot` -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-snapshot-versioning), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)_
- [x] Создать `tools/hyperv-test-runner/04-revert-and-launch.ps1` — `Restore-VMSnapshot` + `Start-VM` + `Wait-VMReady` + auto-fix `EnableEnhancedSessionMode` + IP print + опциональный `-NoVMConnect` для AI-driven runs + `vmconnect.exe` -- @feature2 @feature3
  _Requirements: [FR-2](FR.md#fr-2-snapshot-versioning), [FR-3](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)_
- [x] Создать `tools/hyperv-test-runner/05-cleanup.ps1` — safety gate `if (-not ($Confirm -or $Force))` → throw, `Stop-VM` → snapshots remove → `Remove-VM` → опционально `-RemoveVHDX` -- @feature12
  _Requirements: [FR-12](FR.md#fr-12-vm-cleanup), [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)_
- [x] Создать `tools/hyperv-test-runner/unattend/autounattend.xml` — Win 11 silent install template (windowsPE/specialize/oobeSystem passes), skip MSA, local admin user `claude`, AutoLogon, hostname `claude-test`, RunSynchronousCommand для копирования 02-post-install.ps1 в `C:\hyperv-test-runner\` + SetupComplete.cmd в `C:\Windows\Setup\Scripts\` -- @feature1
- [x] Создать `tools/hyperv-test-runner/unattend/SetupComplete.cmd` — first-boot hook вызывает `02-post-install.ps1` с logging в `C:\post-install.log` -- @feature1
- [x] Создать `tools/hyperv-test-runner/README.md` — overview, prerequisites, quick-start UC-1/UC-2, troubleshooting table -- @feature11
- [x] Verify: BDD сценарии HVTR001..HVTR006, HVTR014 переходят из Red в Green

## Phase 2: Test Catalog (Green) — ✅ COMPLETED 2026-04-08

> Schema + reference scenario для AI agent.

- [x] Создать `tests/hyperv-scenarios/schema.json` — JSON Schema Draft-07 с required fields, regex pattern для id (HV plus three digits), kebab-case для name, `oneOf` discriminator на assertion.type, strict `additionalProperties: false` -- @feature8
  _Requirements: [FR-8](FR.md#fr-8-test-scenario-catalog), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)_
  _Source: [hyperv-test-runner_SCHEMA.md](hyperv-test-runner_SCHEMA.md) — поля верхнего уровня, preconditions, steps, assertions, post_test_
- [x] Создать `tests/hyperv-scenarios/HV001_install-clean.yaml` — reference сценарий: 3 steps (copy fixture, init git, install dev-pomogator) + 6 assertions (exit_code, 2 file_exists, 2 text_contains для managed marker, 1 screenshot_match) + post_test revert -- @feature8
  _Requirements: [FR-8](FR.md#fr-8-test-scenario-catalog)_
- [x] Verify: BDD сценарии HVTR009, HVTR010, HVTR011 переходят из Red в Green

## Phase 3: AI Agent Skill (Green) — ✅ COMPLETED 2026-04-08

> Skill для оркестрации полного цикла. Это **главный delivery** для long-term цели "освободить human от рутины".

- [x] Создать `.claude/skills/hyperv-test-runner/SKILL.md` с frontmatter (4 поля: name, description с **3 trigger groups** на русском+английском, allowed-tools) и пошаговым алгоритмом для каждого триггера. **Auto-discovered системой Claude Code** (виден в available skills list). -- @feature6
  _Requirements: [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)_
  _Reuse pattern: `.claude/skills/dev-pomogator-uninstall/SKILL.md` (frontmatter + multi-step algorithm)_
- [x] Описать в SKILL.md секцию **Trigger 3: Extend Catalog** — как читать `.specs/<feature>/FR.md`, FILE_CHANGES.md, .feature, генерировать draft `tests/hyperv-scenarios/HV<NNN>_<feature>.yaml`, validate, optionally run, AskUserQuestion для commit -- @feature10
  _Requirements: [FR-10](FR.md#fr-10-catalog-extension-workflow), [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)_
- [x] Описать в SKILL.md visual verification workflow (Step 1.5) — reference на `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`, формат `Вижу: ... | Ожидал: ... | Result: CONFIRMED|DENIED` -- @feature7
  _Requirements: [FR-7](FR.md#fr-7-visual-verification-via-screenshots), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)_
- [x] Создать `.claude/skills/hyperv-test-runner/scripts/run-scenario.ps1` — helper: source common.ps1, parse YAML через `powershell-yaml`, mini-validator с cross-field rules, revert через 04-revert-and-launch, fixture copy через PSSession + Copy-Item -ToSession, step execution через `Invoke-Command -VMName` + `Start-Job`/`Wait-Job` для timeout, screenshot via reuse `screenshot.ps1`, assertion evaluation, exception-safe finally revert, JSON-line stdout protocol, `report.md` generation, exit codes 0/1/2, `-Validate` switch -- @feature6 @feature9
  _Requirements: [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner), [FR-9](FR.md#fr-9-run-artifacts-logging)_
- [x] Verify: BDD сценарии HVTR007, HVTR008, HVTR015, HVTR016 переходят из Red в Green

## Phase 4: Run Artifacts + Gitignore (Green) — ✅ COMPLETED 2026-04-08

- [x] Добавлена explicit comment line `# hyperv-test-runner artifacts: .dev-pomogator/hyperv-runs/` в `.gitignore` (functional behavior уже покрыт line 34 `.dev-pomogator/`, comment line нужен для прохождения BDD HVTR012 literal regex assertion) -- @feature9
  _Requirements: [FR-9](FR.md#fr-9-run-artifacts-logging), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)_
- [ ] (Optional) Добавить `*.iso` и `*.vhdx` в `.gitignore` Temp files section (NFR-Security защита) — deferred, низкий риск
  _Requirements: [NFR-Security](NFR.md#security)_
- [x] Verify: BDD сценарий HVTR012 переходит из Red в Green

## Phase 5: Documentation Roadmap (Green) — ✅ COMPLETED 2026-04-08

- [x] README.md спеки уже содержит секцию `## Roadmap` с 5 фазами (v0..v4), каждая с Entry/Exit criteria — заполнено в Phase 3 spec authoring, Phase 5 implementation = verify only -- @feature11
  _Requirements: [FR-11](FR.md#fr-11-documentation-includes-evolution-roadmap), [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)_
- [x] README.md спеки содержит quick-start копипастабельные команды для UC-1 и UC-2 — заполнено в Phase 3 spec authoring -- @feature11
  _Requirements: [NFR-Usability](NFR.md#usability)_
- [x] Verify: BDD сценарий HVTR013 переходит из Red в Green

## Phase 6: Live End-to-End Verification (Manual, human + AI) — 🟡 IN PROGRESS

> Проверка что всё работает на реальной VM. Это НЕ покрыто BDD (тяжело), но обязательно перед declaring spec done.
>
> **Status (2026-04-08)**: Win 11 25H2 English x64 ISO (~7.89 GB) активно качается через BITS background download от Fido-generated Microsoft direct URL → `C:\iso\Win11.iso`. D: drive имел только 8.3 GB free, переключились на C: с 280 GB free. Используется Win 11 Pro consumer SKU вместо Enterprise Eval (Fido не имеет Enterprise; через unattend.xml MSA enforcement обходится в обоих SKU).

- [ ] **In progress**: BITS download Win 11 25H2 ISO → `C:\iso\Win11.iso` (JobId `dca40b5e-7a82-4499-bec5-f37117e24db0`)
- [ ] **Pending**: запустить `01-create-vm.ps1 -IsoPath C:\iso\Win11.iso -VHDPath C:\HyperV\claude-test.vhdx` от admin → проверить что VM создаётся за < 60s
- [ ] **Pending (auto via unattend)**: Win 11 silent install через unattend.xml (~25 мин)
- [ ] **Pending (auto via SetupComplete.cmd)**: 02-post-install.ps1 внутри VM → Node, Git, Claude Code установлены, RDP включён, sentinel `C:\post-install-complete.flag` создан
- [ ] **Pending (manual human)**: Открыть VMConnect, запустить `claude` внутри VM, browser OAuth для Claude Code auth
- [ ] **Pending (AI skill Trigger 2)**: human говорит "сохрани state машины как baseline" → AI вызывает `03-checkpoint.ps1 -Snapshot baseline-clean` → verify
- [ ] **Pending (AI skill Trigger 1)**: human говорит "запусти HV001" → AI выполняет full cycle (revert → execute steps → screenshot → analyze → revert → report)
- [ ] **Pending verify**: Run artifacts появляются в `.dev-pomogator/hyperv-runs/<ts>_HV001/` с scenario.yaml, commands.log, screenshots/, report.md
- [ ] **Pending (optional)**: Human подключается через `mstsc /v:<vm-ip>` → проверяет что RDP подключение работает в multi-monitor режиме

## Phase 7: Refactor & Polish — ✅ COMPLETED 2026-04-08 (validate + audit)

- [x] Прогнать `npx tsx .dev-pomogator/tools/specs-generator/validate-spec.ts -Path .specs/hyperv-test-runner` — **0 errors, 0 warnings, 0 unfilled placeholders, 16/16 valid_files**
- [x] Прогнать `npx tsx .dev-pomogator/tools/specs-generator/audit-spec.ts -Path .specs/hyperv-test-runner -Format json` — **0 ERRORS, 0 INCONSISTENCY, 0 RUDIMENTS, 0 FANTASIES**, 24 INFO findings (feature tag propagation polish — не блокер)
- [x] Все 35 BDD it() блоков GREEN на Windows host (включая PowerShell AST parsing checks которые actually parse все 6 .ps1 scripts)
- [ ] (Deferred) Запустить `/simplify` для review кода/спеки/тестов
- [ ] (Deferred) Обновить CLAUDE.md Rules table если skill становится always-apply (skill manual-trigger — не нужно)
- [ ] (Deferred) Обновить README с актуальной фазой roadmap после Phase 6 verification (v2 → v2-verified)
- [ ] (Out of scope) Удалить устаревший `tools/sandbox-test-runner/` — отдельный коммит с подтверждением human-а
