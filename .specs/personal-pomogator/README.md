# Personal Pomogator

Гарантирует что **ничего** установленного dev-pomogator в target-проект (tools, hooks, rules, commands, skills, MCP config, env vars) **не может случайно попасть в git** команды. Личное у developer'а — остаётся личным.

## Ключевые идеи

1. **Hooks/env → `.claude/settings.local.json`** (gitignored by Claude Code convention, precedence выше settings.json) вместо shared `.claude/settings.json` с team hooks. Нативная фича Claude Code.

2. **Managed gitignore marker block** в `.gitignore` target-проекта — auto-generated из `ManagedFileEntry` registry, идемпотентный, drop-stale при re-install. Collapses per-tool/per-skill директории в single entries.

3. **Self-guard для dev-pomogator source repo** — dogfooding preserved, наш `.gitignore` и `.claude/settings.json` не мутируют при `dev-pomogator install` в нашем репо.

4. **Loud-fail setupGlobalScripts** — вместо silent warning при missing `dist/tsx-runner.js` installer падает громко с clear message. Фиксит dkorotkov incident 2026-04-06.

5. **Fail-soft hook wrapper** `tsx-runner-bootstrap.cjs` — если runner исчезает после успешной установки (antivirus, Claude Code updater), hooks silently exit 0 с diagnostic вместо блокировки сессии. Real errors всё ещё propagate.

6. **Collision detection через `git ls-files`** — user-committed `.claude/commands/create-spec.md` не перезаписывается молча, installer пропускает copy + warn.

7. **Per-project uninstall command** `dev-pomogator uninstall --project [--dry-run]` — читает managed entries, безопасно удаляет только managed файлы, чистит gitignore block + settings.local.json + config.

8. **Force-global MCP writes** — `setup-mcp.py` всегда пишет Context7/Octocode в `~/.claude.json`, никогда в project `.mcp.json` (не смешиваем с user's potential secrets).

9. **Secret detection в project `.mcp.json`** — grep против patterns (JIRA_TOKEN, API_KEY, SECRET), SECURITY WARN в install report.

10. **AI agent uninstall skill** `dev-pomogator-uninstall` — Claude Code Skill триггерится на "удали dev-pomogator", ведёт AI агента через 5 шагов: safety checks → scope selection → CLI-first dry-run → manual fallback → verification.

## Где лежит реализация

- **Installer core**: `src/installer/{self-guard,gitignore,settings-local,collisions,uninstall-project,mcp-security}.ts`
- **Runtime wrapper**: `src/scripts/tsx-runner-bootstrap.cjs`
- **New extension**: `extensions/personal-pomogator/{extension.json, skills/dev-pomogator-uninstall/SKILL.md}`
- **Wiring**: `src/installer/claude.ts` (main flow), `src/installer/shared.ts` (shared helpers), `src/index.ts` (CLI)
- **MCP**: `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` (force-global)
- **Build**: `scripts/build-check-update.js` (bundle bootstrap.cjs)
- **Tests**: `tests/e2e/personal-pomogator.test.ts`
- **Docs**: `CLAUDE.md`, `.claude/rules/updater-managed-cleanup.md`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 9 user stories
- [USE_CASES.md](USE_CASES.md) — 12 use cases covering happy path + edge cases + incidents
- [RESEARCH.md](RESEARCH.md) — technical context, Project Context Analysis, relevant rules scan
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR↔AC↔UC↔@featureN
- [FR.md](FR.md) — 11 functional requirements
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 11 AC в EARS формате
- [DESIGN.md](DESIGN.md) — components, algorithms, reuse plan, BDD Test Infrastructure
- [FIXTURES.md](FIXTURES.md) — 12 test fixtures с lifecycle и gap analysis
- [TASKS.md](TASKS.md) — TDD-порядок: Phase 0 BDD → Phase 1-8 implementation → Phase 9 polish
- [FILE_CHANGES.md](FILE_CHANGES.md) — 33 файла к изменению (15 spec + 7 new src + 2 new ext + 5 modified + 2 tests + 2 docs)
- [personal-pomogator.feature](personal-pomogator.feature) — 33 BDD сценария (PERSO_10..93) в 9 feature groups
- [CHANGELOG.md](CHANGELOG.md) — Keep-a-Changelog entries

## Связанные спеки

- [`.specs/global-dir-guard/`](../global-dir-guard/) — related spec для recovery при удалении `~/.dev-pomogator/` (Claude Code v2.1.83 incident). Complementary: global-dir-guard fixes post-delete recovery, personal-pomogator предотвращает installer leaving broken state в первую очередь.
