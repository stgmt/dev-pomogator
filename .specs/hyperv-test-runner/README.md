# Hyperv Test Runner

**Disposable Hyper-V VM + AI agent skill + расширяемый каталог сценариев** для тестирования dev-pomogator на чистой Windows. Закрывает 4 базовых требования: версионность (snapshots), preinstalled софт (один setup → checkpoint), GUI (VMConnect Enhanced Session), RDP (mstsc через сеть). Двух-ролевая инфраструктура: human делает initial setup один раз, дальше **AI agent через skill** прогоняет тесты, визуально проверяет screenshots, расширяет catalog при появлении новых фич — освобождая human от рутины повторяющегося ручного тестирования.

## Ключевые идеи

1. **Hyper-V VM (`claude-test`) + multi-checkpoint** — единственный способ получить полный Win 11 GUI с возможностью отката к именованному baseline за ~10 секунд. Sandbox/контейнеры/готовый Dev VHD рассмотрены и отвергнуты в [RESEARCH.md](RESEARCH.md).
2. **5 lifecycle PowerShell скриптов** в `tools/hyperv-test-runner/` — `01-create-vm.ps1` (one-time), `02-post-install.ps1` (внутри VM), `03-checkpoint.ps1`, `04-revert-and-launch.ps1` (для каждого теста), `05-cleanup.ps1`. Идемпотентные, admin-elevation check, параметризованные.
3. **Test catalog как YAML файлы** в `tests/hyperv-scenarios/HV<NNN>_<slug>.yaml` с JSON Schema validation. Каждый сценарий — declarative: preconditions checkpoint → steps cmd → assertions (exit_code, file_exists, text_contains, screenshot_match) → post_test revert. Schema в [hyperv-test-runner_SCHEMA.md](hyperv-test-runner_SCHEMA.md).
4. **AI agent skill `hyperv-test-runner`** в `.claude/skills/` оркеструет полный цикл: load scenario → revert → start → execute steps inside VM → screenshot → analyze multimodally → revert → структурированный отчёт. Triggers на естественном языке (русский + английский).
5. **Visual verification** через переиспользование `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`. AI читает PNG, сравнивает с prose описанием в `assertion.expect`, формирует CONFIRMED/DENIED. Это закрывает gap "тесты PASS, но в UI что-то сломано".
6. **Catalog растёт вместе с продуктом** — при появлении новой spec в `.specs/<feature>/` AI agent читает её FR/FILE_CHANGES, генерирует draft `HV<NNN>_<feature>.yaml`, прогоняет, предлагает human-у на review. Долгосрочно: human только акцептует, не пишет тесты вручную.
7. **Run artifacts полностью логируются** в `.dev-pomogator/hyperv-runs/<timestamp>_<scenario-id>/` — копия сценария, command logs, screenshots, итоговый report.md. Gitignored. Post-mortem возможен через дни без воспроизведения.

## Roadmap

Эволюция от полностью ручного тестирования к полностью автоматизированному AI testing. Каждая фаза имеет явные **Entry criteria** (что должно быть готово чтобы её начать) и **Exit criteria** (что должно работать чтобы перейти к следующей).

### v0 — Manual setup + manual run (baseline)

> Текущая фаза до начала реализации этой спеки.

- **Entry**: Win 11 Pro host, Hyper-V Module installed
- **Что есть**: human создаёт VM руками через Hyper-V Manager UI, ставит Win 11 + Node + Claude Code руками, тестирует dev-pomogator install через копипаст команд, проверяет визуально, очищает руками
- **Боль**: занимает часы на каждую сессию тестирования, не воспроизводимо, легко забыть шаг
- **Exit**: появились скрипты `01-create-vm.ps1`..`03-checkpoint.ps1` → переход в v1

### v1 — Scripted VM lifecycle

- **Entry**: PowerShell скрипты Phase 1 TASKS реализованы и проходят BDD сценарии HVTR001..HVTR006
- **Что есть**: human запускает `01-create-vm.ps1` + interactive Win install (~25 мин) + `02-post-install.ps1` + `03-checkpoint.ps1` один раз. Дальше для каждого теста: `04-revert-and-launch.ps1` → ручной test inside VM → revert
- **Польза**: первичный setup ~50 мин один раз, далее каждый тест ~5 мин (revert + manual test). Воспроизводимо.
- **Exit**: появилось `tests/hyperv-scenarios/schema.json` + первый `HV001_install-clean.yaml` валидный → переход в v2

### v2 — AI skill orchestrates fixed catalog

- **Entry**: AI skill `.claude/skills/hyperv-test-runner/SKILL.md` создан, прошёл BDD HVTR007/008/015/016. Catalog содержит минимум 1 working сценарий (HV001).
- **Что есть**: human говорит "запусти HV001 в VM" → skill читает yaml → revert → запускает команды внутри VM → screenshot → analyze → revert → отчёт. Human только просматривает отчёт, не лезет в VM.
- **Польза**: каждый test cycle ~2-3 минуты без human attention (VM работает в фоне). Visual regressions ловятся автоматически через screenshot match.
- **Exit**: catalog содержит ≥ 5 сценариев (install, uninstall, update, regression, edge-case), все стабильно проходят → переход в v3

### v3 — AI auto-generates scenarios from new spec FR.md

- **Entry**: AI skill умеет читать `.specs/<feature>/FR.md` + `FILE_CHANGES.md` и генерировать draft `HV<NNN>_<feature>.yaml`. Human review workflow определён.
- **Что есть**: новая фича в dev-pomogator merge'нулась → human говорит "добавь сценарий для X" → AI читает spec + генерирует draft + прогоняет → human review-ит и принимает
- **Польза**: catalog растёт пропорционально продукту без отдельной задачи "обновить тесты". Тестовое покрытие новых фич гарантировано перед release.
- **Exit**: процесс работает на 2-3 примерах реальных new features, false-positive rate < 20% → переход в v4

### v4 — Multi-baseline regression matrix

- **Entry**: v3 стабилен. Существует ≥ 3 named baselines (`baseline-clean`, `with-dpv-1.4.0`, `with-dpv-1.4.1`) для regression detection.
- **Что есть**: AI skill умеет цикл: для scenario X прогнать против каждого baseline → собрать матрицу PASS/FAIL → highlight regression точки
- **Польза**: regression detection across versions автоматический. AI предлагает root cause при появлении новой FAIL ячейки.
- **Exit**: целевая endgame — далее только incremental improvements, не новые фазы.

**Текущая фаза**: **v2** (AI skill orchestrates fixed catalog). Реализация Phase 0..5 + Phase 7
завершена 2026-04-08. Phase 6 (live e2e на реальной VM) — в процессе (Win 11 ISO ~7.89 GB
качается через BITS background). После Phase 6 verify фаза станет **v2-verified** и можно
переходить к v3 development.

## Implementation Status (2026-04-08)

| Phase | Status | Details |
|---|---|---|
| Phase 0 — BDD Foundation (Red) | Completed | tests/e2e/hyperv-test-runner.test.ts — 35 individual it() блоков для 16 BDD сценариев HVTR001..HVTR016 |
| Phase 1 — Lifecycle Scripts (Green) | Completed | tools/hyperv-test-runner/ — lib/common.ps1, 5 lifecycle scripts, unattend/autounattend.xml + SetupComplete.cmd, README |
| Phase 2 — Test Catalog (Green) | Completed | tests/hyperv-scenarios/schema.json + HV001_install-clean.yaml |
| Phase 3 — AI Agent Skill (Green) | Completed | .claude/skills/hyperv-test-runner/ — SKILL.md с 3 trigger types (auto-discovered системой) + scripts/run-scenario.ps1 |
| Phase 4 — Run Artifacts + Gitignore | Completed | .gitignore comment line для HVTR012 BDD assertion |
| Phase 5 — Documentation Roadmap | Completed | README.md спеки уже содержит Roadmap (заполнено в Phase 3 spec authoring) |
| Phase 6 — Live E2E Verification | In progress | Win 11 25H2 English x64 ISO качается через BITS → C:\iso\Win11.iso |
| Phase 7 — Validate + Audit | Completed | validate-spec → 0 errors, audit-spec → 0 critical, 35/35 BDD GREEN |

**Файлов**: 14 created + 1 edited (.gitignore). Reused без изменений: extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1, tests/fixtures/typical-claude-user/, .claude/skills/dev-pomogator-uninstall/SKILL.md (как pattern reference).

**Тесты**: запуск через test_runner_wrapper.cjs с DEVPOM_ALLOW_HOST_TESTS=1 и TEST_SKIP_DISCOVERY=1 → **35 passed (35)** на Windows host, 13 из 16 BDD сценариев GREEN в Docker (PowerShell AST parsing checks автоматически skip на Linux).

## Quick Start

### One-time host setup (~50 мин)

```powershell
# 1. Скачать Win 11 ISO. Опции:
#    a) Win 11 Enterprise Eval (требует регистрации формой):
#       https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise
#    b) Win 11 Pro consumer через Fido (без формы, прямо с MS API):
#       Invoke-WebRequest 'https://raw.githubusercontent.com/pbatard/Fido/master/Fido.ps1' -OutFile C:\Temp\Fido.ps1
#       powershell -ExecutionPolicy Bypass -File C:\Temp\Fido.ps1 -Win 11 -Lang English -Ed Pro -Arch x64
#    Сохранить в C:\iso\Win11.iso (или другом месте с >=10 GB free)

# 2. От admin PowerShell:
.\tools\hyperv-test-runner\01-create-vm.ps1 -IsoPath C:\iso\Win11.iso -VHDPath C:\HyperV\claude-test.vhdx

# 3. Установить Win 11 интерактивно в VMConnect окне (~25 мин), пройти OOBE через 'oobe\bypassnro'

# 4. Внутри VM (PowerShell admin):
.\tools\hyperv-test-runner\02-post-install.ps1

# 5. На хосте (admin):
.\tools\hyperv-test-runner\03-checkpoint.ps1 -Snapshot baseline-clean
```

### Daily use (~10 секунд)

```powershell
# Каждый тест начинается с:
.\tools\hyperv-test-runner\04-revert-and-launch.ps1 -Snapshot baseline-clean
# → откатывает VM к baseline + стартует + открывает VMConnect окно
```

### AI skill (после v2)

```
human: "запусти HV001 в чистой винде"
→ Claude активирует skill hyperv-test-runner
→ skill читает tests/hyperv-scenarios/HV001_install-clean.yaml
→ выполняет полный цикл, отчитывается с CONFIRMED/DENIED
```

## Где лежит реализация

- **Lifecycle scripts**: `tools/hyperv-test-runner/`
- **Test catalog**: `tests/hyperv-scenarios/`
- **AI skill**: `.claude/skills/hyperv-test-runner/`
- **Target fixture**: `tests/fixtures/typical-claude-user/` (already exists)
- **Run artifacts** (gitignored): `.dev-pomogator/hyperv-runs/`
- **Screenshot helper reuse**: `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — human + AI agent + совместные роли
- [USE_CASES.md](USE_CASES.md) — 8 UC от initial setup до catalog extension
- [RESEARCH.md](RESEARCH.md) — Hyper-V findings, dead Dev VHD, vTPM gotcha, Project Context
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR↔AC↔@featureN
- [FR.md](FR.md) — 12 functional requirements
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 12 AC в EARS формате
- [DESIGN.md](DESIGN.md) — 5-layer архитектура, BDD Test Infra classification, алгоритм skill
- [hyperv-test-runner_SCHEMA.md](hyperv-test-runner_SCHEMA.md) — JSON Schema test scenario yaml
- [FIXTURES.md](FIXTURES.md) — 8 fixtures inventory + dependencies graph
- [TASKS.md](TASKS.md) — TDD-ordered phases с @featureN cross-refs
- [FILE_CHANGES.md](FILE_CHANGES.md) — все файлы спеки + implementation
- [hyperv-test-runner.feature](hyperv-test-runner.feature) — 16 BDD сценариев HVTR001..HVTR016
- [CHANGELOG.md](CHANGELOG.md) — Keep-a-Changelog entries

## Связанные спеки

- [`.specs/personal-pomogator/`](../personal-pomogator/) — определяет managed gitignore marker block механизм. `.dev-pomogator/hyperv-runs/` будет добавлено через тот же подход.
- Sandbox-based альтернатива в `tools/sandbox-test-runner/` — отвергнута, оставлена для reference. Удаление отдельной задачей.
