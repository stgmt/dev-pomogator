# Worktree Setup

Skill `worktree-setup` создаёт новый git worktree + ветку `feat/<slug>` + устанавливает dev-pomogator artifacts одной командой. Решает self-dogfood paradox: `.claude/settings.json` committed в dev-pomogator репо содержит hooks ссылающиеся на gitignored `.dev-pomogator/tools/`, что ломает каждый свежий worktree через ERR_MODULE_NOT_FOUND спам.

Три артефакта в трёх слоях:

1. **Skill** (`.claude/skills/worktree-setup/`) — orchestration, deliberate worktree creation
2. **Global doctor** (`~/.dev-pomogator/scripts/worktree-doctor.cjs`) — standalone CJS диагностика, 6 checks, `--quick` mode <50ms для session-pilot
3. **tsx-runner.js patch** — self-heal hint для orphan worktree-ей созданных через raw `git worktree add` (defence in depth)

Опционально (`--pr=draft`) — push branch + create draft GitHub PR через three-layer config resolution (env file → agent investigates → AskUserQuestion last resort).

## Ключевые идеи

- **Atomic worktree creation:** `git worktree add -b feat/<slug> <path>` одной командой (verified via `git worktree add --help` usage `[(-b|-B) <new-branch>] <path>`)
- **Self-heal без auto-install:** orphan worktree обнаруживается в `tsx-runner.js` после `resolveScriptPath()` (line 107); emit одного JSONL audit entry + одного stderr hint per `(worktree, session)` tuple
- **Three-layer config resolution (FR-4):** env file `~/.dev-pomogator/worktree-setup.env` (persistent) → agent investigates real sources (verify-don't-fantasize) → AskUserQuestion с derived default
- **No hardcoded identifiers:** owner/repo derived runtime context, никогда литералом. Enforced через pre-commit grep + integration test "skill works on forked repo"
- **WT_ prefix для env keys:** избегает collision с gh CLI's own `GH_HOST` shell env var
- **Session-pilot integration через `--quick` mode contract:** doctor выдаёт `tools_present=true|false` за <50ms, session-pilot dashboard показывает 🟢/🔴 + "doctor+bootstrap" кнопку

## Где лежит реализация

- **Skill orchestration**: `.claude/skills/worktree-setup/SKILL.md` + `.claude/skills/worktree-setup/scripts/orchestrate.ts`, `env-resolver.ts`, `pr-creator.ts`
- **Global doctor**: `extensions/worktree-setup/tools/worktree-setup/worktree-doctor.cjs` → installed to `~/.dev-pomogator/scripts/worktree-doctor.cjs`
- **Self-heal patch**: `src/scripts/tsx-runner.js` (insert orphan-detect block after `resolveScriptPath()` line 107)
- **Wiring**: `extensions/worktree-setup/extension.json` + `src/installer/extensions.ts` (managed file SHA-256 hash tracking)
- **Tests**: `tests/e2e/worktree-setup.test.ts` + `tests/e2e/worktree-helpers.ts` + `tests/fixtures/worktree-setup/`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 5 user stories (US-1..US-5)
- [USE_CASES.md](USE_CASES.md) — 7 use cases incl. UC-5 a/b/c PR resolution sub-flows
- [REQUIREMENTS.md](REQUIREMENTS.md) — 9 FRs + 8 ACs + 21 CHK traceability matrix
- [NFR.md](NFR.md) — 20 NFRs (Performance/Security/Reliability/Usability)
- [DESIGN.md](DESIGN.md) — architecture + 5 Key Decisions + BDD Test Infrastructure
- [worktree-setup_SCHEMA.md](worktree-setup_SCHEMA.md) — pipeline diagram + JSON schemas (env file, JSONL, /api/bootstrap)
- [worktree-setup.feature](worktree-setup.feature) — 18 BDD scenarios (CORE024_01..18) @feature1..@feature8
- [TASKS.md](TASKS.md) — TDD-ordered implementation plan (Phase 0..6, 21 tasks)
- [REVIEW_NOTES.md](REVIEW_NOTES.md) — semantic review log (4 rounds, 0 open P0/P1)
