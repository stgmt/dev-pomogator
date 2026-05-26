# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/worktree-setup/SKILL.md` | create | Skill entry point with frontmatter (allowed-tools, description, triggers), workflow steps, env-file resolution instructions — [FR-1](FR.md#fr-1-atomic-worktreebranch-creation-from-main), [FR-4](FR.md#fr-4-pr-creation-via-three-layer-config-resolution), [FR-8](FR.md#fr-8-invocation-from-sibling-worktree--warn--offer-continue) |
| `.claude/skills/worktree-setup/scripts/orchestrate.ts` | create | Top-level orchestration: validate slug → pre-flights (branch + dir collision) → git ops → bootstrap (+ ancestor-guard) → env-sync → build/deps-sync → doctor → optional PR → run-log — implements [FR-1](FR.md), [FR-2](FR.md), [FR-5](FR.md), [FR-6](FR.md), [FR-8](FR.md), [FR-11](FR.md#fr-11-build-and-dependency-synchronization) |
| `.claude/commands/worktree.md` | create | Thin slash-command wrapper `/worktree <slug> [--pr=draft] [--skip-build]` invoking the worktree-setup skill (equivalent to phrase triggers) — [FR-1](FR.md), [FR-11](FR.md#fr-11-build-and-dependency-synchronization) |
| `.claude/skills/worktree-setup/scripts/env-resolver.ts` | create | Three-layer config resolution (env → investigate → ask) + env file create-on-absent stub — [FR-4](FR.md#fr-4-pr-creation-via-three-layer-config-resolution) |
| `.claude/skills/worktree-setup/scripts/pr-creator.ts` | create | Git push + `gh pr create` invocation with resolved owner/repo — [FR-4](FR.md) |
| `.claude/skills/worktree-setup/scripts/env-sync.ts` | create | Copy gitignored root `.env*` (minus `.env.example`) into the new worktree, regenerate `.devcontainer/.env` with unique ports, warn on secret-bearing files, skip existing targets — [FR-10](FR.md#fr-10-local-envconfig-file-synchronization-into-fresh-worktree) |
| `extensions/worktree-setup/extension.json` | create | Installer manifest registering global artifacts (worktree-doctor.cjs) + skill (SKILL.md + scripts) as managed files with SHA-256 tracking |
| `extensions/worktree-setup/tools/worktree-setup/worktree-doctor.cjs` | create | Standalone CJS source-of-truth; installer copies to `~/.dev-pomogator/scripts/worktree-doctor.cjs` — [FR-6](FR.md#fr-6-worktree-doctorcjs-standalone-diagnostic) |
| `src/scripts/tsx-runner.js` | edit | Insert orphan-detect block immediately after `resolveScriptPath()` (current line 107): if `args[0].startsWith('.dev-pomogator/') && !fs.existsSync(scriptPath)` → append JSONL + dedup-checked stderr hint → `process.exit(0)` — [FR-3](FR.md#fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runner-js) |
| `tests/e2e/worktree-setup.test.ts` | create | Integration tests: 21 CHK-covered scenarios via spawnSync + git worktree fixtures + temp HOME isolation |
| `tests/e2e/worktree-helpers.ts` | create | Integration harness: `makeTempGitRepo` (real repo + initial commit), `makeTempDir`, `isolateHome`, `cleanupTempPaths`, `gitAvailable`, `makeMockBin` (PATH-shim gh/docker), `writeMockInstaller` (mock bin/cli.js) — temp repos + mocks on the fly, no static fixtures/installer |
| `.claude/skills/worktree-setup/scripts/devcontainer.ts` | create | FR-12 `--devcontainer`: `docker compose build && up` for new worktree with unique project name/ports (reuse launch-worktree.ps1 port logic) — [FR-12](FR.md#fr-12-devcontainer-integration) |
| `extensions/devcontainer/tools/devcontainer/templates/scripts/post-create.sh` | edit | FR-12 add idempotent `npm install` + `npm run build` after existing git/MCP setup so Reopen-in-Container yields a built env — [FR-12](FR.md#fr-12-devcontainer-integration) |
| `.specs/worktree-setup/worktree-setup.feature` | edit | BDD scenarios @feature1–@feature11 mapped to FR-1..FR-8 + FR-10 + FR-11 + FR-12 (CORE024_01..33) |
| `CLAUDE.md` | edit | Add `worktree-setup` skill row to extension list per `claude-md-glossary` rule |
| `.gitignore` | edit | Add `~/.dev-pomogator/worktree-setup.env` and `~/.dev-pomogator/orphan-worktrees.jsonl` to gitignore if they leak into a repo (defensive; they live in HOME so normally outside repo) |

## Out-of-spec changes (session-pilot integration)

Per FR-7, session-pilot-side changes live in **separate branch `feat/session-pilot`** (already exists at `D:/repos/dev-pomogator-session-pilot`). These are NOT in scope of this spec's File Changes table — they will be implemented after this spec lands as a follow-up:

- `extensions/session-pilot/tools/session-pilot/indexer.py` — add `tools_present` field via `worktree-doctor.cjs --quick` per worktree
- `extensions/session-pilot/tools/session-pilot/handlers.py` — add POST `/api/bootstrap` endpoint
- `extensions/session-pilot/tools/session-pilot/frontend.py` — add "bootstrap" column with conditional glyph + click handler
- `extensions/session-pilot/extension.json` — version bump 0.3.0 → 0.4.0

Cross-reference: when this spec's PR merges to main, the session-pilot branch can rebase on main and pick up the contract (worktree-doctor.cjs `--quick` mode) automatically via installer auto-update.
