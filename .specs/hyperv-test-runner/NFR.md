# Non-Functional Requirements (NFR)

## Performance

- **Revert + launch cycle**: `Restore-VMSnapshot` + `Start-VM` + ready signal ОБЯЗАН укладываться в **60 секунд** на baseline железе (4-core CPU, NVMe SSD, 16+ GB RAM). При превышении — fail с timeout error и diagnostic log.
- **Full test cycle** (revert → execute scenario → screenshot → analyze → revert) ОБЯЗАН укладываться в **5 минут** для типового сценария (10-15 команд + 3 screenshots).
- **VM boot time** от cold start (без revert, fresh `Start-VM`): ≤ 90 секунд до момента когда RDP/Enhanced Session принимают подключение.
- **Snapshot creation** (`Checkpoint-VM`): ≤ 30 секунд для VM с 6 GB RAM и 60 GB VHDX.
- **AI skill latency overhead** (parsing scenario YAML + dispatching commands): ≤ 2 секунды (без учёта самих команд внутри VM).

## Security

- **ISO file** (`Win11_Enterprise_Eval.iso`, ~5 GB) ОБЯЗАН быть в `.gitignore` — не коммитить большие бинарники в репо.
- **VHDX file** (`claude-test.vhdx`, ~25-40 GB) ОБЯЗАН быть в `.gitignore` и располагаться вне репозитория (`D:\HyperV\` или аналог).
- **Run artifacts** (`.dev-pomogator/hyperv-runs/`) ОБЯЗАНЫ быть в `.gitignore` — могут содержать screenshots с потенциально чувствительной информацией (paths, имена пользователей, env vars).
- **API keys** (`ANTHROPIC_API_KEY`) НЕ ОБЯЗАНЫ храниться в скриптах или сценариях — только через env var на хосте, передаются в VM через `-EnvVars` parameter в момент запуска сценария.
- **Secret detection**: catalog YAML файлы ОБЯЗАНЫ проходить grep на patterns (`API_KEY`, `TOKEN`, `SECRET`, `password`) перед commit — manual review достаточен на v0/v1 фазе, automated check на v2+.
- **Admin elevation**: PowerShell скрипты ОБЯЗАНЫ проверять `[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')` на старте и fail с clear message если не админ.
- **vTPM ownership**: `New-HgsGuardian` создаёт self-signed сертификат на хосте — он ОБЯЗАН быть назван `UntrustedGuardian` (стандартное имя для local VMs) и **не** подлежит удалению при cleanup VM (другие VMs могут зависеть).

## Reliability

- **Idempotent scripts**: повторный запуск любого `0X-*.ps1` скрипта НЕ ДОЛЖЕН ломать существующее состояние. `01-create-vm.ps1` ОБЯЗАН детектировать существующую VM и предлагать `-Force` для пересоздания.
- **Atomic save** для catalog YAML и run artifacts (правило `atomic-config-save`): write → temp file → atomic move, не прямой write. Иначе при крахе во время записи catalog потеряется.
- **Fail-fast on missing dependencies**: скрипты ОБЯЗАНЫ проверять наличие Hyper-V Module (`Get-Module Hyper-V -ListAvailable`), ISO файла (`Test-Path`), достаточно дискового места (`Get-PSDrive`) — fail с actionable error до начала работы.
- **Screenshot on failure**: если сценарий fail (assertion DENIED, exit code != 0, timeout) — AI agent ОБЯЗАН сделать финальный screenshot и положить в `report.md` для post-mortem.
- **Graceful revert on crash**: если test cycle прерван (Ctrl+C, exception в skill) — последняя операция перед exit ОБЯЗАНА быть `Restore-VMSnapshot baseline-clean` чтобы следующий запуск начинался с чистого baseline.
- **Heartbeat-based ready detection**: после `Start-VM` skill НЕ ДОЛЖЕН использовать `Start-Sleep -Seconds 30`. Должен polling: `Wait-VM -For Heartbeat` или `(Get-VMNetworkAdapter).IPAddresses` non-empty с timeout 90s.

## Usability

- **One-line commands**: каждый use case ОБЯЗАН быть запускаемым одной командой (`./04-revert-and-launch.ps1 -Snapshot baseline-clean`), не требовать копирования multi-line snippets.
- **README.md спеки** ОБЯЗАН содержать копипастабельный quick-start (5-7 строк) для UC-1 (initial setup) и UC-2 (daily use).
- **Skill triggers** на естественном языке (русский + английский) ОБЯЗАНЫ покрывать минимум: "протестируй в VM", "запусти hyperv test", "test in clean windows", "проверь на чистой винде", "run scenario X", "regression test", "regression в VM".
- **Error messages** скриптов ОБЯЗАНЫ включать suggested next action (например `Hyper-V Module not loaded. Run: Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All` вместо просто `Module not found`).
- **Roadmap visibility**: README ОБЯЗАН явно указывать текущую фазу эволюции (v0/v1/v2/v3/v4) и что осталось до следующей.
- **No silent skip**: если AI agent не может выполнить шаг сценария (отсутствует checkpoint, VM не стартует) — ОБЯЗАН явно отчитаться, не делать silent fall-through.
- **Documentation language**: README + RESEARCH на русском (соответствует репо), но FR/AC/code comments — на русском или английском, не смешивать в одном файле.
