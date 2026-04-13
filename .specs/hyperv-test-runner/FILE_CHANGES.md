# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md), [TASKS.md](TASKS.md), [DESIGN.md](DESIGN.md).

## Spec files (already created — этой итерацией)

| Path | Action | Reason |
|------|--------|--------|
| `.specs/hyperv-test-runner/USER_STORIES.md` | create | Discovery — human + AI agent roles |
| `.specs/hyperv-test-runner/USE_CASES.md` | create | Discovery — 8 UC от initial setup до catalog extension |
| `.specs/hyperv-test-runner/RESEARCH.md` | create | Discovery + Project Context — Hyper-V findings, dead Dev VHD, vTPM gotcha |
| `.specs/hyperv-test-runner/REQUIREMENTS.md` | create | Phase 2 — traceability matrix FR↔AC↔@featureN |
| `.specs/hyperv-test-runner/FR.md` | create | Phase 2 — 12 functional requirements |
| `.specs/hyperv-test-runner/NFR.md` | create | Phase 2 — Performance/Security/Reliability/Usability |
| `.specs/hyperv-test-runner/ACCEPTANCE_CRITERIA.md` | create | Phase 2 — 12 AC в EARS формате |
| `.specs/hyperv-test-runner/DESIGN.md` | create | Phase 2 — 5-layer архитектура, BDD Test Infra (TEST_DATA_NONE), компоненты, алгоритм skill |
| `.specs/hyperv-test-runner/hyperv-test-runner.feature` | create | Phase 2 — 16 BDD сценариев HVTR001..HVTR016 со @featureN тегами |
| `.specs/hyperv-test-runner/hyperv-test-runner_SCHEMA.md` | create | Phase 2 — JSON Schema test scenario yaml format |
| `.specs/hyperv-test-runner/FIXTURES.md` | create | Phase 2 — 8 fixtures inventory + dependencies graph |
| `.specs/hyperv-test-runner/TASKS.md` | create | Phase 3 — TDD-ordered phases с @featureN cross-refs |
| `.specs/hyperv-test-runner/FILE_CHANGES.md` | create | Phase 3 — этот файл |
| `.specs/hyperv-test-runner/README.md` | edit | Phase 3 — overview + roadmap + key ideas + quick start |
| `.specs/hyperv-test-runner/CHANGELOG.md` | edit | Phase 3 — Initial 0.1.0 entry |

## Implementation files (создаются в Phase 1+ TASKS.md)

### Lifecycle scripts (@feature1, @feature2, @feature3, @feature4, @feature12)

| Path | Action | Reason |
|------|--------|--------|
| `tools/hyperv-test-runner/lib/common.ps1` | create | [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts) — shared helpers (admin check, hyper-v assert, wait ready) |
| `tools/hyperv-test-runner/01-create-vm.ps1` | create | [FR-1](FR.md#fr-1-hyper-v-vm-lifecycle-scripts) — New-VM Generation 2 + vTPM + ISO mount |
| `tools/hyperv-test-runner/02-post-install.ps1` | create | [FR-4](FR.md#fr-4-native-rdp-access-via-mstsc) — RDP enable + winget Node/Git + npm Claude Code (внутри VM) |
| `tools/hyperv-test-runner/03-checkpoint.ps1` | create | [FR-2](FR.md#fr-2-snapshot-versioning) — Checkpoint-VM с параметром -Snapshot |
| `tools/hyperv-test-runner/04-revert-and-launch.ps1` | create | [FR-2](FR.md#fr-2-snapshot-versioning), [FR-3](FR.md#fr-3-gui-access-via-vmconnect-enhanced-session-mode) — Restore + Start + vmconnect |
| `tools/hyperv-test-runner/05-cleanup.ps1` | create | [FR-12](FR.md#fr-12-vm-cleanup) — Stop-VM + snapshots remove + Remove-VM с -Confirm/-Force |

### Test catalog (@feature8)

| Path | Action | Reason |
|------|--------|--------|
| `tests/hyperv-scenarios/schema.json` | create | [FR-8](FR.md#fr-8-test-scenario-catalog) — JSON Schema Draft-07 для validation |
| `tests/hyperv-scenarios/HV001_install-clean.yaml` | create | [FR-8](FR.md#fr-8-test-scenario-catalog) — reference сценарий install dev-pomogator |

### AI Agent Skill (@feature6, @feature7, @feature9, @feature10)

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/hyperv-test-runner/SKILL.md` | create | [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner) — AI skill orchestration с triggers и алгоритмом |
| `.claude/skills/hyperv-test-runner/scripts/run-scenario.ps1` | create | [FR-6](FR.md#fr-6-ai-agent-skill-hyperv-test-runner), [FR-9](FR.md#fr-9-run-artifacts-logging) — helper для skill, parse YAML + execute + log |

### BDD test runner (@feature1..@feature12 — meta tests)

| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/hyperv-test-runner.test.ts` | create | Phase 0 BDD foundation — Vitest tests для HVTR001..HVTR016 (статическая валидация структуры) |

### Cross-cutting

| Path | Action | Reason |
|------|--------|--------|
| `.gitignore` | edit | [FR-9](FR.md#fr-9-run-artifacts-logging), [NFR-Security](NFR.md#security) — добавить `.dev-pomogator/hyperv-runs/`, `*.iso`, `*.vhdx` |
| `CLAUDE.md` | edit | Обновить Rules table если skill становится always-apply (опционально) |
| `tests/fixtures/typical-claude-user/` | reuse (no change) | [FR-5](FR.md#fr-5-test-fixture-mounting-in-vm) — переиспользуется как target проект, не модифицируется |

### Reuse (no edits)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1` | reuse | [FR-7](FR.md#fr-7-visual-verification-via-screenshots) — переиспользуется skill-ом для visual capture |
| `.claude/skills/dev-pomogator-uninstall/SKILL.md` | reuse (pattern) | Эталон формата для нового SKILL.md (frontmatter + multi-step algorithm) |

## Out of scope (НЕ в этой спеке)

- `tools/sandbox-test-runner/` (3 файла, .wsb + bootstrap.ps1 + README) — Sandbox-based альтернатива, отвергнута. Удаление отдельной задачей с подтверждением human-а.
- Полная автоматизация Win 11 install через `unattend.xml` — не входит в v0/v1, потенциально v2+.
- Multi-baseline regression matrix runner (UC-7) — описан как roadmap v4, реализация после v3.
- Catalog auto-generation от `.specs/<feature>/FR.md` без human review — описан как roadmap v3, в v2 только assist + manual commit.
- Создание Win 11 IoT Enterprise LTSC alternative path — описан в RESEARCH, реализация по запросу.
