# Research

## Контекст

dev-pomogator — extension/plugin система для Claude Code, которая устанавливается в чужие проекты, добавляя hooks, rules, commands, skills, MCP config, env vars и marker block в .gitignore. Каждый release потенциально влияет на установку. Тестирование на хост-машине разработчика бесполезно: там уже всё установлено, ручной uninstall + reinstall цикл медленный и ненадёжный, остаточные артефакты искажают результат.

Нужна **изолированная Windows-среда с предустановленным baseline** (Node.js, Claude Code, git), куда можно за секунды откатиться к чистому состоянию, прогнать установку dev-pomogator, проверить артефакты, и снова откатиться. Среда должна обслуживать **двух потребителей**: human для investigation/debug и AI agent для повторяемых автоматизированных сценариев.

## Источники

- [About Windows containers — Microsoft Learn (2025-11-28)](https://learn.microsoft.com/en-us/virtualization/windowscontainers/about/) — limitations контейнеров (no GUI, server core only)
- [Use local resources on Hyper-V with VMConnect — Microsoft Learn](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/learn-more/use-local-resources-on-hyper-v-virtual-machine-with-vmconnect) — Enhanced Session Mode = RDP via VMBus
- [Enable or Disable Hyper-V Enhanced Session Mode in Windows 11 — elevenforum](https://www.elevenforum.com/t/enable-or-disable-hyper-v-enhanced-session-mode-in-windows-11.26314/) — `Set-VMHost -EnableEnhancedSessionMode $true`
- [Hyper-V Quick Create gallery — 4sysops](https://4sysops.com/archives/hyper-v-quick-create-deploy-custom-vm-images/) — gallery image = stale 22H2, no auto vTPM
- [Windows 11 Enterprise — Microsoft Evaluation Center](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise) — 90-day eval, ISO ~5 GB, no product key
- [Windows 11 IoT Enterprise LTSC eval](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-iot-enterprise-ltsc) — без Copilot/AI bloat альтернатива
- [Windows Developer VM where are they now? — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2259075/windows-developer-vm-or-images-where-are-they-now) — preinstalled VHD removed Oct 2024
- [Step-by-Step: How to Create a Windows 11 VM on Hyper-V via PowerShell — MS Tech Community](https://techcommunity.microsoft.com/t5/educator-developer-blog/step-by-step-how-to-create-a-windows-11-vm-on-hyper-v-via/ba-p/3754100)
- [Windows Sandbox overview — Microsoft Learn (2026-03-29)](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/) — рассмотрено и отвергнуто (no persistence)

## Технические находки

### Win 11 Dev Environment VHD недоступен

С октября 2024 Microsoft прекратил публиковать готовые preinstalled VHD/VHDX образы Windows 11 Dev Environment для Hyper-V/VMware/VirtualBox/Parallels. Timeline возвращения нет. Это убивает самый удобный путь "скачал → импортировал → запустил с предустановленным VS Code и developer tools".

### Hyper-V Quick Create gallery — устарел

В Win 11 Pro Quick Create всё ещё содержит "Windows 11 dev environment" image, но он базируется на 22H2 (старый), размер ~19.64 GB, и **vTPM не настраивается автоматически**, а Win 11 без vTPM не загружается. Microsoft фичу не развивает.

### Win 11 Enterprise Evaluation ISO — единственный надёжный путь

Free 90-day evaluation, ISO ~5 GB, без product key, без MSA (через `oobe\bypassnro` trick на OOBE экране). После 90 дней — `Restore-VMSnapshot` к baseline возвращает свежие 90 дней. Альтернатива: Win 11 IoT Enterprise LTSC eval, без Copilot и bloat.

### Hyper-V Enhanced Session Mode = built-in RDP

`Set-VMHost -EnableEnhancedSessionMode $true` на хосте + Remote Desktop в guest = VMConnect использует RDP протокол через VMBus. Поддерживает clipboard, drive redirection, audio, multi-display. На Win 11 Pro **enabled by default**, но в guest нужно явно `Set-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0` + `Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'`.

Альтернативно: классический `mstsc.exe /v:<vm-ip>` через сеть VM (нужен IP, поддерживает `/multimon` для multi-display).

### vTPM mandatory для Win 11

Win 11 Setup проверяет TPM при boot. Без vTPM → "This PC can't run Windows 11". Решение в Hyper-V:

```powershell
$owner = New-HgsGuardian -Name 'UntrustedGuardian' -GenerateCertificates
$kp = New-HgsKeyProtector -Owner $owner -AllowUntrustedRoot
Set-VMKeyProtector -VMName $vmName -KeyProtector $kp.RawData
Enable-VMTPM -VMName $vmName
```

### Альтернативы рассмотрены и отвергнуты

| Вариант | Почему отвергнут |
|---|---|
| **Windows Sandbox** | No persistence — каждый запуск re-install Node + Claude Code (~3-5 мин), нет browser auth state, не подходит для повторяемых тестов |
| **Windows containers (Server Core)** | No GUI, no browser auth для Claude Code, image ~5 GB, нужен switch Docker Desktop из Linux в Windows mode, dev-pomogator hooks могут зависеть от not-headless context |
| **VirtualBox / VMware Player** | Лишний слой вне Hyper-V, медленнее на Windows host, дублирование функционала встроенного Hyper-V |
| **Microsoft Dev Box / Windows 365** | Платно (cloud subscription), overkill для local testing |
| **Tiny11 / Atlas OS** | Модифицированные сборки, поведение отличается от того что у real users |

### Test catalog format — прецеденты

Обзор форматов: GitHub Actions YAML steps, Cypress fixtures, Bats test files, Cucumber feature files. Для нашего случая (declarative test steps + assertions + screenshot match) подходит **YAML с минимальной schema**: id, name, preconditions.checkpoint, steps[].cmd, assertions[].type (один из exit_code, file_exists, text_contains, screenshot_match), post_test.revert.

### AI agent skill format — прецеденты в репе

`.claude/skills/dev-pomogator-uninstall/SKILL.md` — frontmatter (name, description, allowed-tools) + 5-step algorithm с safety checks → scope selection → CLI-first → manual fallback → verification. Это эталон для нового skill `hyperv-test-runner`.

`.claude/skills/debug-screenshot/SKILL.md` — описание workflow Hypothesis → Capture → Analyze → Report. Это паттерн для visual verification step в hyperv skill.

## Где лежит реализация (после implementation)

- **PowerShell lifecycle scripts**: `tools/hyperv-test-runner/01-create-vm.ps1`, `02-post-install.ps1` (запускается ВНУТРИ VM), `03-checkpoint.ps1`, `04-revert-and-launch.ps1`, `05-cleanup.ps1`
- **Test catalog**: `tests/hyperv-scenarios/*.yaml` (по сценарию на файл, naming `HV<NNN>_<slug>.yaml`)
- **Catalog schema**: `tests/hyperv-scenarios/schema.json` (JSON Schema для валидации YAML)
- **AI skill**: `.claude/skills/hyperv-test-runner/SKILL.md` + helper script `.claude/skills/hyperv-test-runner/scripts/run-scenario.ps1`
- **Fixture target project**: `tests/fixtures/typical-claude-user/` (уже существует)
- **Run artifacts** (gitignored): `.dev-pomogator/hyperv-runs/<timestamp>/` содержит подпапки logs, screenshots, и файл scenario.yaml
- **Wiring** в CLAUDE.md (Rules table) + extension manifest (если оформляется как extension)

## Выводы

1. Hyper-V VM + checkpoints — единственный вариант который закрывает все 4 требования (версионность + preinstall + GUI + RDP) из современных Windows tooling.
2. Готовых VHD от Microsoft нет → setup через Win 11 Enterprise Eval ISO + PowerShell скрипты с обязательной vTPM настройкой.
3. AI agent skill оркестрирует existing PowerShell helpers + visual verification через debug-screenshot pattern, а не пишет всё с нуля.
4. Test catalog как YAML файлы — single source of truth для human (пишет руками) и AI (читает + расширяет).
5. Roadmap эволюции должен быть явным в README, чтобы не путать MVP с finite goal: v0 manual → v1 scripted → v2 AI orchestrates → v3 AI generates scenarios from new specs.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| `screenshot-driven-verification` | `.claude/rules/pomogator/screenshot-driven-verification.md` | КАЖДЫЙ скриншот реально анализировать с CONFIRMED/DENIED | "screenshot", "verify visually" | FR-7 (visual verify), AC-7 |
| `post-edit-verification` | `.claude/rules/pomogator/post-edit-verification.md` | После КАЖДОГО изменения: build + tests + screenshot если UI | code changes | FR-8 (run reporting) |
| `no-blocking-on-tests` | `.claude/rules/pomogator/no-blocking-on-tests.md` | Не блокировать сессию ожиданием — `run_in_background` | долгие операции | FR-9 (async execution) |
| `atomic-config-save` | `.claude/rules/atomic-config-save.md` | Конфиги через temp + atomic move | yaml/json save | NFR-Reliability |
| `integration-tests-first` | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными (real spawn) | test creation | NFR-Reliability |
| `plan-pomogator` | `.claude/rules/plan-pomogator/plan-pomogator.md` | 9-секционный формат планов | spec creation | meta |
| `extension-manifest-integrity` | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth для апдейтера | если оформляется как ext | FR-1 (lifecycle scripts) |
| `proactive-investigation` | `.claude/rules/plan-pomogator/proactive-investigation.md` | Не спрашивать разрешение исследовать, делать сразу с evidence | AI skill behavior | FR-6 (skill algorithm) |
| `tui-debug-verification` | `.claude/rules/pomogator/tui-debug-verification.md` | Screenshot второго монитора + cross-verify YAML | TUI/statusline changes | FR-7 (visual verify) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| `debug-screenshot` skill | `.claude/skills/debug-screenshot/SKILL.md` | PowerShell `screenshot.ps1` для capture monitor → PNG в `.dev-pomogator/screenshots/` | **Reuse direct** в FR-7 — не писать собственный screenshot helper |
| `dev-pomogator-uninstall` skill | `.claude/skills/dev-pomogator-uninstall/SKILL.md` | Эталон AI skill format: frontmatter + multi-step algorithm + safety checks | **Reuse pattern** в FR-6 (skill structure) |
| `typical-claude-user` fixture | `tests/fixtures/typical-claude-user/` (8 файлов, создана ранее) | Готовый Node project + .claude artifacts (settings, hooks, commands, rules) для копирования в VM | **Reuse direct** в UC-3, UC-5 — это target проект для install testing |
| `tests/fixtures/` структура | `tests/fixtures/specs-generator/`, `tests/fixtures/steps-validator/`, и др. | Convention для test fixtures | Pattern reference для catalog placement |
| `extensions/specs-workflow/tools/specs-generator/` | `scaffold-spec.ts`, `validate-spec.ts`, `audit-spec.ts` | Spec workflow tooling | Используется этой спекой для own validation |
| `tools/sandbox-test-runner/` (legacy) | `dev-pomogator-test.wsb`, `bootstrap/setup.ps1` | Sandbox-based альтернатива (отвергнута) | **OUT OF SCOPE** — оставить как deprecated или удалить отдельной задачей |

### Architectural Constraints Summary

- **Windows-only**: vся фича работает только на Windows host с Hyper-V Pro/Enterprise/Education edition. Не для macOS/Linux разработчиков. Это фундаментальное ограничение от выбора Hyper-V — упомянуть в README.
- **Admin elevation required**: New-VM, Set-VMKeyProtector, Enable-VMTPM, Start-VM, Restore-VMSnapshot — все требуют admin. Скрипты ОБЯЗАНЫ проверять elevation на старте и fail-fast если не админ.
- **Atomic save** для catalog YAML и run artifacts (правило `atomic-config-save`): writeFile → temp → move, не прямой write.
- **Reuse существующих helpers**: `debug-screenshot/scripts/screenshot.ps1` для всех visual capture (правило DRY + post-edit-verification).
- **AI skill format** должен следовать эталону `dev-pomogator-uninstall`: frontmatter с allowed-tools, описание триггеров, пошаговый алгоритм с safety checks.
- **No-blocking** для долгих операций (boot VM, ISO download, Windows install) — `run_in_background` в Bash tool, не блокировать Claude Code session.
- **Run artifacts gitignored**: `.dev-pomogator/hyperv-runs/` добавить в `.gitignore`, иначе screenshots замусорят историю.
- **Не дублировать функционал**: уже есть `tests/fixtures/typical-claude-user/` — переиспользовать как целевой проект, не создавать второй.
