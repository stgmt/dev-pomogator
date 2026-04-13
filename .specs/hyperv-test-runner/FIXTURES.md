# Fixtures

## Overview

Эта спека использует **смешанный набор фикстур**: статические файлы для BDD-тестов (которые проверяют наличие/структуру скриптов и каталога) и **runtime-фикстуры** для самого hyperv test runner (VM, snapshots, ISO). Runtime фикстуры **не создаются BDD сценариями** — они подготавливаются human-ом в Phase 1 (initial setup) и переиспользуются для всех последующих сценариев.

Существующая фикстура `tests/fixtures/typical-claude-user/` уже создана ранее (в рамках предыдущей итерации Sandbox approach) и **переиспользуется как target проект** для install/uninstall тестов внутри VM.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | typical-claude-user | static | `tests/fixtures/typical-claude-user/` | shared | already exists, не создаётся в этой спеке |
| F-2 | hyperv-vm-baseline | snapshot | Hyper-V `claude-test` VM, snapshot `baseline-clean` | global, runtime | human через `01-create-vm.ps1` + `02-post-install.ps1` + `03-checkpoint.ps1` |
| F-3 | win11-eval-iso | static (host file) | `D:\iso\Win11_Enterprise_Eval.iso` | global | human downloads from Microsoft Evaluation Center |
| F-4 | hv001-install-clean-yaml | static | `tests/hyperv-scenarios/HV001_install-clean.yaml` | per-scenario | создаётся в Phase 0 (BDD foundation) |
| F-5 | catalog-schema-json | static | `tests/hyperv-scenarios/schema.json` | global | создаётся в Phase 0 |
| F-6 | hyperv-skill-md | static | `.claude/skills/hyperv-test-runner/SKILL.md` | global | создаётся в Phase 4 (skill implementation) |
| F-7 | run-artifacts-dir | runtime (gitignored) | `.dev-pomogator/hyperv-runs/<ts>_<id>/` | per-run | создаётся skill-ом при каждом запуске сценария |
| F-8 | screenshots-helper | reuse | `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1` | global | already exists, переиспользуется без модификации |

## Fixture Details

### F-1: typical-claude-user

- **Type:** static fixture (8 файлов: package.json, README.md, .gitignore, src/index.ts, .claude/settings.json, .claude/commands/lint.md, .claude/commands/test.md, .claude/rules/no-mocks.md)
- **Format:** Mixed (JSON, TypeScript, Markdown)
- **Setup:** Уже существует на диске, не пересоздаётся. Skill копирует в VM как `C:\test-project\` через `Copy-VMFile` или PSSession.
- **Teardown:** В VM — не нужно (revert checkpoint удалит). На хосте — никогда не удаляется.
- **Dependencies:** none
- **Used by:** все @feature5, @feature8, @feature10 сценарии (как target install)
- **Assumptions:** репозиторий dev-pomogator checked out, путь известен скриптам

### F-2: hyperv-vm-baseline

- **Type:** runtime snapshot (Hyper-V Checkpoint)
- **Format:** VHDX delta + memory snapshot
- **Setup:** Manual через 5-step процесс (см. UC-1):
  1. `01-create-vm.ps1` создаёт VM с vTPM
  2. Interactive Win 11 install (~25 мин)
  3. `02-post-install.ps1` внутри VM устанавливает Node + Git + Claude Code + enables RDP
  4. `03-checkpoint.ps1 -Snapshot baseline-clean`
- **Teardown:** `Remove-VMSnapshot` или полностью через `05-cleanup.ps1`
- **Dependencies:** F-3 (ISO file), Hyper-V Module installed, admin elevation
- **Used by:** все runtime сценарии (preconditions.checkpoint = baseline-clean)
- **Assumptions:** хост Win 11 Pro/Enterprise/Education, ≥ 16 GB RAM, Hyper-V включён, виртуализация в BIOS

### F-3: win11-eval-iso

- **Type:** static binary file
- **Format:** ISO 9660 (~5 GB)
- **Setup:** Human скачивает с https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise (требует регистрации)
- **Teardown:** Никогда — переиспользуется при пересоздании VM
- **Dependencies:** none
- **Used by:** F-2 setup (`01-create-vm.ps1` mounts as DVD)
- **Assumptions:** ISO в `.gitignore`, не коммитить

### F-4: hv001-install-clean-yaml

- **Type:** static YAML file
- **Format:** YAML, validated against F-5 schema
- **Setup:** Создаётся в Phase 0 (BDD Foundation) как reference example
- **Teardown:** Никогда (часть кодовой базы)
- **Dependencies:** F-5 (schema for validation)
- **Used by:** @feature8 BDD scenarios (HVTR011), runtime когда AI agent выполняет HV001
- **Assumptions:** schema.json существует и валиден

### F-5: catalog-schema-json

- **Type:** static JSON Schema (Draft-07)
- **Format:** JSON Schema
- **Setup:** Создаётся в Phase 0 как single source of truth для catalog validation
- **Teardown:** Никогда
- **Dependencies:** none
- **Used by:** валидация всех F-4 файлов и будущих HV*.yaml
- **Assumptions:** JSON Schema validator доступен (ajv для Node, или json-schema модуль для Python)

### F-6: hyperv-skill-md

- **Type:** static Markdown с YAML frontmatter
- **Format:** Markdown
- **Setup:** Создаётся в Phase 4 (skill implementation)
- **Teardown:** Никогда
- **Dependencies:** F-8 (screenshot helper для reference в алгоритме)
- **Used by:** @feature6, @feature7, @feature10 BDD scenarios (HVTR007, HVTR008, HVTR015, HVTR016)
- **Assumptions:** Claude Code ≥ 2.0 (skill format support)

### F-7: run-artifacts-dir

- **Type:** runtime directory (per-run)
- **Format:** Directory structure: `scenario.yaml`, `commands.log`, `screenshots/*.png`, `vm-logs/*`, `report.md`
- **Setup:** Skill создаёт при каждом запуске сценария
- **Teardown:** Никогда автоматически — human чистит вручную (или внешний log retention)
- **Dependencies:** `.dev-pomogator/` существует и в `.gitignore`
- **Used by:** все runtime сценарии
- **Assumptions:** диск имеет место (~50-100 MB на run при многих screenshots)

### F-8: screenshots-helper

- **Type:** reused script (NO modification in this spec)
- **Format:** PowerShell .ps1
- **Setup:** Уже существует, не создаётся
- **Teardown:** Не управляется этой спекой
- **Dependencies:** Windows host (System.Drawing assembly)
- **Used by:** F-6 skill, @feature7 visual verification
- **Assumptions:** debug-screenshot extension установлен

## Dependencies Graph

```
F-3 (ISO)
  └─► F-2 (VM baseline)
        └─► (runtime) AI skill execution

F-1 (typical-claude-user) ──────┐
                                 ├─► (runtime) AI skill execution → F-7 (run artifacts)
F-2 (VM baseline) ──────────────┤
                                 │
F-4 (HV001 yaml) ────────────────┤
  └─► F-5 (schema)               │
                                 │
F-6 (skill md) ──────────────────┤
  └─► F-8 (screenshot helper)  ──┘
```

F-3 и F-2 — это **тяжёлые runtime фикстуры**, не задействованы в BDD тестах.
F-1, F-4, F-5, F-6, F-8 — статические файлы, проверяются BDD статически.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | HVTR001 lifecycle scripts exist | none (static file checks) | none |
| @feature1 | HVTR002 admin check | none | none |
| @feature1 | HVTR003 PowerShell parse | none | none |
| @feature2 | HVTR004 snapshot param | none | none |
| @feature3 | HVTR005 vmconnect call | none | none |
| @feature4 | HVTR006 RDP enabled | none | none |
| @feature6 | HVTR007 skill metadata | F-6 | none |
| @feature6 | HVTR008 skill triggers | F-6 | none |
| @feature8 | HVTR009 catalog dir | F-4, F-5 | none |
| @feature8 | HVTR010 schema valid JSON | F-5 | none |
| @feature8 | HVTR011 HV001 validates | F-4, F-5 | none |
| @feature9 | HVTR012 .gitignore entry | none (file content check) | none |
| @feature11 | HVTR013 README roadmap | none | none |
| @feature12 | HVTR014 cleanup confirm | none | none |
| @feature7 | HVTR015 reuse screenshot | F-6, F-8 | none |
| @feature10 | HVTR016 catalog extension docs | F-6 | none |

**Все BDD сценарии покрыты статическими fixtures.** Runtime фикстуры (F-2 VM, F-3 ISO, F-7 artifacts) тестируются вручную в Phase 1+ TASKS.md, не в BDD.

## Notes

- **Cleanup order для VM**: snapshots → VM → VHDX → ISO (опционально). ISO почти никогда не удаляется (переиспользуется).
- **Каскадные зависимости**: F-2 целиком зависит от F-3. Если ISO потерян → пересоздать F-2 невозможно без download.
- **Storage budget**: F-2 ~25-40 GB, F-3 ~5 GB, F-7 ~50 MB × N runs. Рекомендация для disk planning: 60 GB free на disk хоста.
- **Не путать с тестовой инфраструктурой dev-pomogator**: F-1 (`tests/fixtures/typical-claude-user/`) — это **target**, а не fixture для **BDD-тестов этой спеки**. Это одновременно output ранее созданной структуры и input для runtime сценариев hyperv test runner.
