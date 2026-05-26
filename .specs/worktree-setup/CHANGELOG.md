# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased] — 2026-05-26 (amendment #4: canonical plugin test strategy)

### Design

- **Test strategy decision** added — the suite validates the plugin via canonical Claude Code mechanisms: `claude plugin validate` (structure, same check as Anthropic's submission CI) + direct tool invocation via spawnSync (behavior, already used by CORE024_*) + `claude --plugin-dir ./<plugin>` (runtime wiring). NOT the legacy installer (`runInstaller` → `dist/index.js`, which the plugin migration deletes). Hook paths via `${CLAUDE_PLUGIN_ROOT}`. New DESIGN Key Decision + BDD-infra note + T6-2 verification steps. Researched against official Claude Code plugin docs + Anthropic's `plugin-validator` agent. Cross-ref plugin-migration PR #24.
- **BDD-infra + Phase-0 realigned** to match the decision and reality: removed installer-based hooks (`setupTempProject`/`runInstaller`), static fixtures (`fresh-main`/`gh-mock`/tsx-runner snapshot) and Cucumber step-def framing; documented the actual `worktree-helpers.ts` API (`makeTempGitRepo`/`makeTempDir`/`isolateHome`/`cleanupTempPaths`/`gitAvailable`) and on-the-fly temp git repos + PATH-shim mocks across DESIGN, TASKS Phase 0, and FILE_CHANGES.

## [Unreleased] — 2026-05-26 (amendment #3: FR-12 devcontainer integration)

### Specification

- **FR-12 added (devcontainer integration)** — добавлено при реализации фичи как плагина. Две половины: (a) флаг `--devcontainer` → скил делает `docker compose build && up -d` для нового worktree с уникальным project-name и портами из `.devcontainer/.env` (reuse `Get-NextPorts`/`Invoke-RebuildWorktree`), best-effort; (b) `post-create.sh` ставит `npm install` + `npm run build` идемпотентно, чтобы «Reopen in Container» давал готовое окружение (раньше lifecycle делал только git/zsh/MCP).
- Added: AC-12 (AC-12.1..12.4), CHK-FR12-01..04 (total CHKs 32 → 36), NFR-R9 (best-effort docker) + NFR-P6 (docker time вне бюджета), @feature11 group CORE024_30..33 (now 33 scenarios total), Key Decision «devcontainer integration on both sides» (8 → 9), DESIGN devcontainer.ts компонент + шаг 8d, TASKS T2-7/T2-8 (27 → 29 tasks).
- Контекст: спека реализуется как отдельный плагин `extensions/worktree-setup/` (skill + tools + hooks + команда `/worktree`); FR-12 — новое требование под запрос «интеграция в девконтейнер».

## [Unreleased] — 2026-05-26 (amendment #2: FR-11 build/deps-sync + edge-cases)

### Specification

- **FR-11 added (build/deps-sync)** — gap-аудит показал: инсталлер не делает корневой `npm install`/`npm run build` (`src/installer/shared.ts:407` только tool-deps + warn «run npm run build first»), поэтому свежий worktree не собирается и `build_guard` режет тесты. FR-11: скил делает `npm install` (нет `node_modules`) + `npm run build` (нет/устарел `dist`), опт-аут `--skip-build`, best-effort при сбое (вне perf-бюджета, NFR-P5).
- **Edge-cases** — FR-1 расширен pre-flight коллизии директории worktree (не только ветки); FR-2 расширен guard'ом что инсталлер таргетит worktree, а не репозиторий-предок (`findRepoRoot()` возвращает топовый git-корень, `src/utils/repo.ts:13`).
- Added: AC-11 (AC-11.1..11.4), CHK-FR11-01..04 + CHK-FR1-04 + CHK-FR2-04 (total CHKs 26 → 32), NFR-P5 (build вне бюджета) + NFR-R7 (run-log) + NFR-R8 (port concurrency) + NFR-U6 (per-step summary), @feature10 group CORE024_24..27 + edge CORE024_28/_29 (build-sync coverage), 2 Key Decisions (auto-build vs report-only; coexistence с launch-worktree.ps1, 6 → 8), SCHEMA skill run-log JSONL + шаг 8c, TASKS T0-5/T1-4/T2-5/T2-6 (23 → 27 tasks), команда `/worktree`.

## [Unreleased] — 2026-05-25 (amendment: FR-10 env-sync)

### Specification

- **FR-10 added (env-sync)** — spec extended post-Complete to cover gitignored local env/config files lost in a fresh worktree (`git worktree add` carries only committed files). Skill copies root `.env*` (minus `.env.example`) from main, regenerates `.devcontainer/.env` with worktree-unique ports (never copies it — port collision), warns on secret-bearing files without printing values, skips existing targets (idempotent), best-effort on per-file failure.
- Added: AC-10 (AC-10.1..10.5), CHK-FR10-01..05 (total CHKs 21 → 26), NFR-S6 (secret-aware copy) + NFR-R6 (best-effort env-sync), @feature9 group CORE024_19..23 (env-sync coverage), DESIGN Key Decision "copy not symlink, regenerate devcontainer .env" (5 → 6), SCHEMA "env-sync candidate selection" + "env-sync audit JSONL entry", TASKS T0-4 + T2-4 (21 → 23 tasks).
- Strategy decision: env files **copied** from main (not symlinked) — Windows file symlinks require elevated privileges; copy isolates worktree-local edits. Reflects user decision in the amendment session.

## [Unreleased] — 2026-05-13

### Specification

- **Phase 1 (Discovery)** complete: 5 user stories, 7 use cases, RESEARCH.md with technical findings + 9 risks
- **Phase 2 (Requirements + Design)** complete: 9 FRs (8 in-scope + 1 OUT_OF_SCOPE), 20 NFRs, 8 ACs (EARS format), 21 CHK traceability rows, 5 Key Decisions with Rationale/Trade-off/Alternatives, BDD scenarios CORE024_01..18 (Phase 2 baseline)
- **Phase 3 (Finalization)** complete: 21 implementation tasks across Phase 0..6, README overview, this CHANGELOG

### Cross-feature dependencies

- **session-pilot v0.4.0** (separate branch `feat/session-pilot` at `D:/repos/dev-pomogator-session-pilot`) will consume `worktree-doctor.cjs --quick` contract introduced by this spec. After this spec merges to main, the session-pilot branch rebases on main and picks up worktree-doctor.cjs via installer auto-update. session-pilot-side implementation (indexer + handlers + frontend changes for "bootstrap" column) is OUT OF SCOPE of this spec.

### Spec quality milestones

- 4 spec-review rounds: 2 P0 (wrong file reference, hardcoded identifier) + 2 P1 (UC-3 decision, env key collision) caught and resolved; 4 carry-over residual references found and fixed in Round 4
- 2 feedback memories captured during spec generation: `feedback_no-hardcoded-repo-or-user-identifiers.md`, `feedback_env-first-then-investigate-then-ask.md` — both consumed via new spec-review Category 14
- create-spec skill enhanced with Pre-Write Verification Checklist (Phase 1: 3 items, Phase 2: 8 items) — would have caught all 4 P0/P1 found in this spec at generation time
- spec-review skill extended with Category 14 (Memory-aware constraint compliance) — runs every phase, scans project memory for forbidden literals

## [0.1.0] — TBD (implementation)

### Added
- Skill `worktree-setup` (TypeScript orchestration in `.claude/skills/worktree-setup/`)
- Global `worktree-doctor.cjs` with full + `--quick` modes (installed to `~/.dev-pomogator/scripts/`)
- Self-heal block in `src/scripts/tsx-runner.js` (orphan worktree detection + JSONL audit + stderr hint with session-scoped deduplication)
- Three-layer config resolution for PR creation (env file → agent investigation → AskUserQuestion last resort)
- `extensions/worktree-setup/extension.json` manifest for installer-managed artifact tracking

### Changed
- `src/scripts/tsx-runner.js` extended with orphan-detect block after `resolveScriptPath()` line 107 (non-invasive — adds ≤5ms in happy path)

### Implementation notes
- TBD: PR URL when merged
