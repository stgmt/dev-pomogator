# Pomogator Doctor

Диагностическая команда для dev-pomogator, которая проверяет окружение разработчика после `git clone` и показывает что сломано, предлагая переустановку если проблему может решить `npx dev-pomogator`.

## Зачем это нужно

Когда разработчик А ставит dev-pomogator в проекте, артефакты раскиданы по 4 местам: `~/.dev-pomogator/` (в `.gitignore`), `.claude/settings.local.json` (per-dev), `.env` (секреты), `.mcp.json` (MCP конфиг). Разработчик Б, клонируя проект, получает только код + `.claude/rules/` — остальное нужно восстановить. Без доктора Б тратит час на дебаг ENOENT в hooks. С доктором Б узнаёт за 5 секунд что именно сломано и как починить.

## Ключевые идеи

- **Три точки входа**: `/pomogator-doctor` (slash в Claude Code), `dev-pomogator --doctor` (CLI + `--json` для CI), SessionStart hook (silent when OK, баннер через `additionalContext` при проблеме)
- **17 checks** в 3 traffic-light группах: 🟢 self-sufficient (Node, Git, home structure) / 🟡 needs env vars (API keys в двух местах: `.env` + `settings.local.json → env`) / 🔴 needs external deps (Bun, Python+packages, Docker, MCP servers)
- **Per-extension driving** — Doctor запускает только relevant checks по `config.installedExtensions[*].dependencies` (новое поле в `extension.json` schema), не 17 слепо
- **MCP Full probe** — реальное JSON-RPC подключение к MCP серверу (spawn stdio / fetch http + `initialize` + `tools/list`) с hard timeout 3s и SIGKILL cleanup; parse-only даёт ложнопозитивы когда сервер сконфигурирован но процесс падает
- **Reinstall integration** — каждый check помечен `reinstallable: yes|no`. Critical+reinstallable (missing tools, stale hooks, version mismatch, broken plugin-loader) → AskUserQuestion `"Run 'npx dev-pomogator' now?"` → spawn installer по согласию. Non-reinstallable (missing API key, Bun, Python) — только actionable hint, отдельный блок в выводе

## Где лежит реализация

- **App-код (shared core)**: `src/doctor/` — index, runner, reporter, reinstall, types, lock + 14 checks
- **Extension**: `extensions/pomogator-doctor/` — extension.json, doctor-hook.ts (SessionStart), slash command
- **CLI wiring**: `src/index.ts` (edit) — `--doctor`, `--json`, `--quiet`, `--extension <name>` flags
- **Tests**: `tests/features/plugins/pomogator-doctor/` + `tests/e2e/pomogator-doctor.test.ts`
- **Fixtures**: `tests/fixtures/pomogator-doctor/` — temp-home-builder, fake-mcp-server, dotenv fixtures, env-snapshot/child-registry hooks

## Где читать дальше

Порядок чтения по роли:

**Быстро понять о чём**: [USER_STORIES.md](USER_STORIES.md) → [USE_CASES.md](USE_CASES.md)

**Review требований**: [REQUIREMENTS.md](REQUIREMENTS.md) (traceability matrix) → [FR.md](FR.md) (34 FR: 25 initial + 9 post-launch hardening `@feature12`) → [NFR.md](NFR.md) (Perf/Sec/Rel/Usa) → [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) (EARS, 34 AC)

**Архитектура перед implementation**: [DESIGN.md](DESIGN.md) → [pomogator-doctor_SCHEMA.md](pomogator-doctor_SCHEMA.md) (TypeScript interfaces + JSON output schema) → [FIXTURES.md](FIXTURES.md) (13 fixtures + 4 hooks + cleanup order)

**Implementation план**: [TASKS.md](TASKS.md) (TDD Phase 0 Red → Phase 1-7 Green + Refactor → Phase 8 Post-Launch Hardening) → [FILE_CHANGES.md](FILE_CHANGES.md) (63 операций: 37 create + 26 edit)

**BDD сценарии**: [pomogator-doctor.feature](pomogator-doctor.feature) — 31 scenarios POMOGATORDOCTOR001_01..31 покрывающие все UC + reliability edge cases + post-launch integrity checks

**Background research**: [RESEARCH.md](RESEARCH.md) — portability analysis 17 категорий, Extension Dependency Matrix, MCP Full probe protocol, community patterns (Claude Code /doctor, npm doctor, Expo Doctor, mise), Project Context (9 relevant rules + 9 reuse patterns)

**История изменений**: [CHANGELOG.md](CHANGELOG.md)

**Post-implementation**: [AUDIT_REPORT.md](AUDIT_REPORT.md) — генерируется Phase 3+ audit после Finalization
