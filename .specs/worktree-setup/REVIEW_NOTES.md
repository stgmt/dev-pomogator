# Spec Review: worktree-setup

**Phase:** Discovery (Phase 1)
**Generated:** 2026-05-12
**Scope:** Categories 1, 2, 4, 5, 6, 10

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 2 | ⚠️ STOP — fix required |
| P1 (fix before stop) | 2 | ⚠️ review |
| P2 (recommendations) | 4 | ℹ️ logged |
| P3 (informational) | 0 | — |

**Overall verdict:** STOP_BLOCKED → **RESOLVED** (P0 ×2 fixed via Patches 1–4; P1 #3 resolved via user choice "Warn + offer continue" → UC-3 + US-1 AC updated)

**Resolution status (2026-05-12 post-fix):**
- P0 #1 — fixed in RESEARCH.md "Branch creation", USE_CASES.md UC-1, USER_STORIES.md US-1 IT
- P0 #2 — fixed in RESEARCH.md Risk #2 mitigation (hardcoded `npx github:stgmt/dev-pomogator` replaced with config-iteration + generic hint)
- P1 #3 — UC-3 rewritten as "warn + offer continue", new AC added to US-1
- P1 #4 (session-pilot internal API claims) — **DEFERRED to Phase 2** post session-pilot worktree bootstrap
- P2 #5–#8 — logged, not blocking

---

## Re-review round 2 (2026-05-12 post-patches)

Verified new claims introduced by patches:

- ✅ `git worktree list --porcelain` first entry IS main worktree — confirmed via real run on this repo (output starts with `worktree D:/repos/dev-pomogator` before any siblings)
- ✅ `git rev-parse --git-common-dir` returns `.git` in main, `<main>/.git` in sibling — alternative detection method, can be used in DESIGN.md
- ✅ `git show-ref --verify --quiet refs/heads/<branch>` — standard git plumbing, exit 0=exists, non-0=absent

New P2 finding (now fixed):

| # | Category | Location | Issue | Status |
|---|----------|----------|-------|--------|
| 9 | #1 External-API claim | USER_STORIES.md US-1 IT cleanup hint | `git branch -d feat/test-foo` would refuse after bootstrap created unmerged commits — verified via `git branch -h`: `-d` requires merged, `-D` forces. | **FIXED** — replaced with `git branch -D` + inline verification note |

**Round 2 verdict:** READY for ConfirmStop Discovery (0 P0, 0 P1 introduced by patches, all previously-flagged P0/P1 resolved).

---

## Re-review round 3 (Phase 2 STOP #2 pre-check, 2026-05-13)

Scope: categories 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13.

### P0 NEW findings

| # | Category | Location | Issue | Required fix |
|---|----------|----------|-------|--------------|
| 10 | #1 External-API claim (wrong-file claim) | FR-3, AC-3, RESEARCH.md "Точка входа bootstrap", DESIGN.md Components + Decision #4 + paths, SCHEMA.md pipeline, FILE_CHANGES.md | Spec consistently references `tsx-runner-bootstrap.cjs` as the file containing strategy fallback (Strategy 0/1/2). **Wrong.** Read of `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` showed it's a 60-line fail-soft loader that only does `require('tsx-runner.js')` and handles MODULE_NOT_FOUND if the runner itself is missing. The actual strategy fallback lives in `tsx-runner.js` (line 85 `resolveScriptPath()`, line 359 `FAIL` emit, line 503 final exit). Self-heal block belongs in `tsx-runner.js` right after line 107 (`scriptPath = resolveScriptPath(args[0])`). | Replace ALL mentions of `tsx-runner-bootstrap.cjs` in the patch context with `tsx-runner.js`. Note in FR-3: the check should be inserted after `resolveScriptPath()` — if `args[0].startsWith('.dev-pomogator/')` AND `!fs.existsSync(scriptPath)`, emit JSONL + stderr hint + `process.exit(0)`. Update FILE_CHANGES.md path. |

### P1 NEW findings

| # | Category | Location | Issue | Suggested fix |
|---|----------|----------|-------|---------------|
| 11 | #12 Cross-namespace name collision | SCHEMA.md env file keys + DESIGN.md Decision #5 + FR-4 mentions | Env file uses keys `GH_OWNER`, `GH_REPO`, `GH_PROTOCOL`, `GH_HOST`. `GH_HOST` is a real environment variable consumed by gh CLI itself (sets default hostname for gh operations). Although our env file is parsed via Node fs (NOT sourced into shell), the naming collision is confusing — user reading our file may believe these are gh's own env vars. | Prefix all env file keys with `WT_` (worktree-setup namespace): `WT_GH_OWNER`, `WT_GH_REPO`, `WT_GH_PROTOCOL`, `WT_GH_HOST`. Updates needed in SCHEMA.md, DESIGN.md Decision #5, FR-4, AC-4, USE_CASES.md UC-5 Layer 1 example. Stub template comments retain unchanged. |

### P2 NEW findings

| # | Category | Location | Note |
|---|----------|----------|------|
| 12 | #10 Fluff smell | DESIGN.md Decision #2 "anti-fantasy guard", Decision #3 "Mild violation of single-responsibility" | Fluffy phrases. "Anti-fantasy guard" is a named-pattern label (acceptable as terminology). "Mild violation of single-responsibility" is direct architecture honesty — acceptable. No change needed; logged for future awareness. |
| 13 | #1 External-API verify (positive) | All gh CLI claims | Verified during round 3: `gh auth status` exit 0 = authenticated; `gh repo view --json url,name,owner` returns `{name, owner.login, url}` (owner is nested); `gh api user --jq .login` returns login string; `gh pr create` supports `--draft` `-d`, `--title` `-t`, `--body` `-b`, `--repo` `-R [HOST/]OWNER/REPO`. All AC/FR text reflects correct flag names. No changes. |

### Auto-fix patches for round 3

#### Patch R3.1: tsx-runner.js (not bootstrap.cjs) — FR.md FR-3

**File:** `.specs/worktree-setup/FR.md`

Replace all `tsx-runner-bootstrap.cjs` mentions in FR-3 body with `tsx-runner.js`. Specifically: "On any hook invocation in a worktree where target script does not exist (`fs.existsSync(target)` false AND target starts with `.dev-pomogator/`), **`tsx-runner.js`** SHALL append exactly one JSON line to ..."

#### Patch R3.2: tsx-runner.js — ACCEPTANCE_CRITERIA.md AC-3

Same replacement in AC-3 body: "WHEN `tsx-runner.js` is invoked by any hook AND target script path starts with `.dev-pomogator/` AND `fs.existsSync(<resolved-script-path>)` returns false THEN..."

Add: "WHEN script is invoked, `tsx-runner.js` SHALL evaluate the self-heal block AFTER `resolveScriptPath()` returns (line 107 in current source) and BEFORE strategy iteration begins; if check fires, runner exits 0 (silent no-op for hook), skipping strategy invocation entirely."

#### Patch R3.3: tsx-runner.js — RESEARCH.md "Точка входа bootstrap"

Replace section title and body: "**Точка входа self-heal: `tsx-runner.js`** (not `tsx-runner-bootstrap.cjs` which is a thin require-loader). Patch inserts a check after `resolveScriptPath()` (line 107): if `args[0].startsWith('.dev-pomogator/')` AND `!fs.existsSync(scriptPath)`, the runner emits one JSONL line + dedup-checked stderr hint, then `process.exit(0)`."

#### Patch R3.4: tsx-runner.js — DESIGN.md (multiple sections)

- "Components" entry: rename `tsx-runner-bootstrap.cjs (extended)` to `tsx-runner.js (extended)`. Update description accordingly.
- "Где лежит реализация": replace `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` with `~/.dev-pomogator/scripts/tsx-runner.js`.
- "Директории и файлы": same path replacement.
- "Decision #4" title: rename `Self-heal as patch to existing tsx-runner-bootstrap.cjs` to `Self-heal as patch to existing tsx-runner.js (after resolveScriptPath line 107)`. Update Rationale to reflect that the patch sits in the script-resolution layer (the right semantic location for "target script not found"), not the runner-loader layer.

#### Patch R3.5: tsx-runner.js — SCHEMA.md pipeline diagram

Replace "[any hook fires] → tsx-runner-bootstrap.cjs → ..." with "[any hook fires] → tsx-runner-bootstrap.cjs (loader) → tsx-runner.js (resolveScriptPath + strategy fallback) → target exists? ↓ no → orphan detect → append JSONL + maybe stderr hint".

#### Patch R3.6: tsx-runner.js — FILE_CHANGES.md path

Change `src/scripts/tsx-runner-bootstrap.cjs` row to `src/scripts/tsx-runner.js` with reason still pointing to FR-3.

#### Patch R3.7: WT_ prefix — env file key collision

Update all references to env keys (SCHEMA.md, DESIGN.md Decision #5, FR-4, AC-4, USE_CASES.md UC-5 Layer 1, USER_STORIES.md US-3) replacing:
- `GH_OWNER` → `WT_GH_OWNER`
- `GH_REPO` → `WT_GH_REPO`
- `GH_PROTOCOL` → `WT_GH_PROTOCOL`
- `GH_HOST` → `WT_GH_HOST`

Stub template body in SCHEMA.md: rename keys in template + update inline comments to mention the prefix rationale ("WT_GH_* prefix avoids collision with gh CLI's own GH_HOST env var").

### Round 3 verdict: STOP_BLOCKED → **RESOLVED**

P0 #10 and P1 #11 fixed via patches R3.1–R3.7 + extra fixes for NFR-P3, DESIGN-29 wiring, RESEARCH-149.

---

## Re-review round 4 (post-R3 verification, 2026-05-13)

Scope: same Phase 2 categories + new **Category 14: Memory-aware constraint compliance**.

### P1 NEW findings (all post-R3 carry-over — refs I missed in patches)

| # | Category | Location | Issue | Status |
|---|----------|----------|-------|--------|
| 15 | #6 Cross-ref anchor mismatch | REQUIREMENTS.md L9 + L17 | FR-3 anchor still `fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runner-bootstrapcjs` after R3 renamed heading to use `tsx-runner.js`. Validator would emit broken link. | **FIXED** — updated to `fr-3-self-heal-hint-for-orphan-worktrees-via-tsx-runnerjs` in 2 places |
| 16 | #1 External-API claim (residual) | RESEARCH.md "Выводы" L158 | "minimal patch existing tsx-runner-bootstrap.cjs" — leftover from pre-R3 text | **FIXED** — replaced with tsx-runner.js + line 107 reference |
| 17 | #1 External-API claim (residual) | RESEARCH.md Existing Patterns table L183 | Table claimed `tsx-runner-bootstrap.cjs` has "strategy fallback" — wrong (verified Read shows it's loader-only); also said it's the integration point | **FIXED** — split into 2 rows: bootstrap.cjs (loader-only) + tsx-runner.js (strategy fallback + integration point); explicit Read-verification cited |
| 18 | #1 External-API claim (residual) | RESEARCH.md Architectural Constraints L189 | "self-heal встраивается ИЗНУТРИ tsx-runner-bootstrap.cjs" — wrong file | **FIXED** — corrected to tsx-runner.js + line 107 reference |

### Category 14 result (NEW — first run on this spec)

Memory dir contains 2 feedback files:
- `feedback_env-first-then-investigate-then-ask.md`
- `feedback_no-hardcoded-repo-or-user-identifiers.md`

Extracted forbidden literals from memory: `stgmt/dev-pomogator`, `npx github:stgmt/dev-pomogator`.

Grep result against `.specs/worktree-setup/` (excluding REVIEW_NOTES.md historical log):

| Location | Context | Verdict |
|----------|---------|---------|
| NFR.md:16 (NFR-S5) | "pattern `stgmt/dev-pomogator` MUST NOT appear in ..." | **META-REFERENCE** — describing the literal as a detection target, not using it as identifier. Acceptable per memory intent (the memory says don't USE hardcoded identifiers, not "never mention the literal anywhere"). P3 — false positive, no fix needed. |
| RESEARCH.md:200 (Risk #6 mitigation) | "pre-commit grep check для literals `stgmt/dev-pomogator` в `.claude/skills/...`" | **META-REFERENCE** — same context. P3. |
| SCHEMA.md:152 (validation rule) | "No hardcoded GitHub identifiers (`stgmt/dev-pomogator`, etc.)" | **META-REFERENCE** — example of what's forbidden. P3. |

Category 14 false-positive heuristic suggested: if literal appears in context with words "MUST NOT appear" / "forbidden" / "grep target" / "детектируется как" / "detection target" / "(`X`, etc.)" — treat as meta-reference, downgrade to P3. Add to future `category-14-memory-constraints.md` reference doc.

### Other categories — all green this round

- **#1 External-API**: gh CLI claims verified Round 3 (still valid); tsx-runner.js claims now match Read evidence; git claims unchanged
- **#2 Existing-asset duplicate**: no new
- **#3 Antipattern**: no `.claude/rules/antipatterns/*.md` dir exists in target (only `gotchas/`), category skip
- **#4 Assumption**: WT_ prefix backed by NFR-S5 + memory + Round 3 user confirmation
- **#5 Open Questions**: still no `## Open Questions` section
- **#6 @featureN consistency**: @feature1–@feature8 in .feature ↔ REQUIREMENTS matrix → all 8 mapped; CHK rows reference correctly
- **#7 Tooling mismatch**: no powershell-in-bash, no raw `npm test`/`pytest`/`dotnet test` literals
- **#8 Plan-gate**: no plan file
- **#9 BDD Phase 0**: DESIGN says TEST_DATA_ACTIVE, new hooks defined; will verify in Phase 3 TASKS
- **#10 Fluff**: no new fluffy phrases introduced by R3
- **#12 Cross-namespace collision**: WT_ prefix RESOLVED `GH_HOST` collision; verified no other `GH_*` env-var-shaped keys unprefixed in spec
- **#13 JWT/config keys**: N/A

### Round 4 verdict: **READY** for ConfirmStop Requirements

0 P0, 0 P1 (4 carry-over P1s fixed inline), 3 P3 false-positives (meta-references, no fix needed).

## P0 Findings

| # | Category | Location | Issue | Required fix |
|---|----------|----------|-------|--------------|
| 1 | #1 External-API claim | RESEARCH.md "Branch creation"; USE_CASES.md UC-1; USER_STORIES.md US-1 IT | Spec claims `git worktree add <path> <branch>` creates branch off HEAD if it doesn't exist. **WRONG** — verified via `git worktree add --help`: usage is `git worktree add [(-b \| -B) <new-branch>] <path> [<commit-ish>]`. Without `-b`, branch MUST exist (or be a remote-tracking branch with `--guess-remote`). For a new local branch, `-b` is required. | Replace all occurrences of `git worktree add <path> feat/{slug}` with one of: (a) `git worktree add -b feat/{slug} <path>` (atomic, preferred), OR (b) `git branch feat/{slug} && git worktree add <path> feat/{slug}` (two-step, easier to debug). Pick (a) for consistency. |
| 2 | #2 Existing-asset / self-violation | RESEARCH.md line 184 (Risk #2 mitigation) | Risk mitigation contains literal hardcoded `npx github:stgmt/dev-pomogator` — **direct violation of own feedback memory** `no-hardcoded-repo-or-user-identifiers.md` saved during this session. The mitigation should describe behavior without naming the specific user/repo. | Replace `npx github:stgmt/dev-pomogator` with `npx github:<owner>/<repo>` placeholder pattern, OR remove the fallback altogether and document that self-heal requires at least one previously-registered main worktree in `~/.dev-pomogator/config.json` (which is a fair pre-condition since installer must have run at least once anywhere on the machine). |

## P1 Findings

| # | Category | Location | Issue | Suggested fix |
|---|----------|----------|-------|---------------|
| 3 | #4 Assumption-vs-Requirement | USE_CASES.md UC-3 ("Skill invoked from inside an orphan worktree") | UC-3 prescribes skill refuses invocation from a sibling worktree. This is a reasonable design choice but wasn't explicitly confirmed by user. The four Q&A rounds covered location, bootstrap, branch naming, doctor triggers, env-first pattern — not "invocation from sibling". | Either (a) confirm with user this restriction is desired, OR (b) re-frame UC-3 as "skill detects non-main invocation and warns + offers to continue at user's risk" (less invasive). Recommend (a) — refusing is safer. |
| 4 | #1 External-API claim | RESEARCH.md "session-pilot integration surface" (US-5) | Claim about session-pilot internal API: `handlers.py:62` whitelist pattern, `terminal_launcher.spawn_terminal` function. These are inferred from grep but not deeply verified — `spawn_terminal` may not be the exact function name; whitelist check may be located differently in current 0.3.0 code. | Re-verify against session-pilot worktree before Phase 2 DESIGN.md commits these as contract. Read `handlers.py` and `terminal_launcher.py` fully; correct function/line names. Will be unblocked when we touch session-pilot worktree (currently impossible due to original bug — needs bootstrap first). |

## P2 / P3 Findings

| # | Category | Location | Note |
|---|----------|----------|------|
| 5 | #10 Fluff smell | RESEARCH.md "natural surface for batch visibility + remediation"; "self-dogfood paradox" | Stylistic descriptors. "Self-dogfood paradox" is acceptable as named-pattern label; "natural surface" is filler. Phase 2 DESIGN.md should re-state with concrete metric or remove. |
| 6 | #10 Fluff smell | RESEARCH.md "hot-path latency" without measurement | Phrase "burns hot-path latency" lacks a numeric anchor outside US-1 (which has ~1.5s). Tolerable in narrative paragraphs; tighten in DESIGN.md performance section. |
| 7 | #2 Smart-default risk | USE_CASES.md UC-5 Layer 3 — `path.basename(main_worktree_cwd)` as repo-name suggestion | For dev-pomogator user's environment, `basename` = `dev-pomogator` works. For forked repos (`dev-pomogator-fork-of-X`), basename mismatches actual GitHub repo name. The fallback already validates via `gh repo view` so wrong default is caught — but a 404 will fall to "create repo" hint that doesn't make sense for forks. Phase 2 DESIGN.md should add a forked-repo branch: detect via `gh repo view --json parent` if non-null, suggest parent's `{owner}/{name}` as alternative. |
| 8 | #2 Smell — possible overlap | session-pilot's `terminal_launcher.py` already spawns claude in worktree CWD; this skill's "Layer 3 launch new claude session" could converge | Not duplicate today (different scope), but Phase 2 DESIGN should explicitly cross-reference: "Skill launches via `wt -d` directly; session-pilot launches via `terminal_launcher.spawn_terminal`. Both call same underlying Win Terminal API. Future spec may unify." |

## Categories not blocking (no findings)

- **#5 Open Questions stale** — RESEARCH.md has no `## Open Questions` section; all initial Q1–Q7 questions answered in conversation. No stale checkbox lines found. ✅
- **#6 @featureN cross-file consistency** — `.feature` file scaffolded but empty (Phase 2 deliverable). No tags yet to cross-check. ✅ (will re-run in Phase 2)

## Auto-fix patches

### Patch 1: git worktree add — atomic `-b` for new branch (RESEARCH.md)

**File:** `.specs/worktree-setup/RESEARCH.md`

**old_string:**
```
### Branch creation

`git worktree add <path> <branch>` — если branch не существует, создаёт его off HEAD. Если существует — проверяет conflict с другим worktree.
```

**new_string:**
```
### Branch creation

`git worktree add -b feat/{slug} <path>` (atomic — creates new local branch + worktree in one call). Verified via `git worktree add --help`: usage `git worktree add [(-b|-B) <new-branch>] <path> [<commit-ish>]`. Without `-b` flag, branch MUST already exist (or be a remote-tracking match with `--guess-remote`). For our flow (new local branch off HEAD), `-b` is required.
```

### Patch 2: Remove hardcoded npx fallback (RESEARCH.md Risk #2)

**File:** `.specs/worktree-setup/RESEARCH.md`

**old_string:**
```
| Bootstrap command pins абсолютный путь к main worktree `bin/cli.js`; если main worktree переименован/удалён, self-heal hint указывает на несуществующий путь | Medium | Medium | Self-heal читает `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` чтобы найти living main worktree; если не найден — fallback hint на `npx github:stgmt/dev-pomogator` |
```

**new_string:**
```
| Bootstrap command pins абсолютный путь к main worktree `bin/cli.js`; если main worktree переименован/удалён, self-heal hint указывает на несуществующий путь | Medium | Medium | Self-heal читает `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` чтобы найти living main worktree; iterate через все зарегистрированные projectPath, выбрать первый где `fs.existsSync(path + '/bin/cli.js')` returns true. Если ни одного living main не найдено — emit generic hint без literal package name: "no main install found — re-install dev-pomogator via your package manager first, then re-run hook in this worktree" (без конкретного `npx` командаe — owner/repo не hardcode). |
```

### Patch 3: USE_CASES.md UC-1 atomic `-b`

**File:** `.specs/worktree-setup/USE_CASES.md`

**old_string:**
```
- Skill creates branch `feat/context-menu-fix` (off current HEAD of main)
- Skill runs `git worktree add D:/repos/dev-pomogator-context-menu-fix feat/context-menu-fix`
```

**new_string:**
```
- Skill runs `git worktree add -b feat/context-menu-fix D:/repos/dev-pomogator-context-menu-fix` (atomic — creates branch + worktree in one git call; verified via `git worktree add --help` usage `[-b <new-branch>] <path>`)
```

### Patch 4: USER_STORIES.md US-1 IT

**File:** `.specs/worktree-setup/USER_STORIES.md`

**old_string:**
```
**Independent Test:** Invoke skill with slug `test-foo` from main worktree. Verify: sibling `D:/repos/dev-pomogator-test-foo` exists on branch `feat/test-foo`, contains `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` (sentinel file), and `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` contains the absolute path. Cleanup with `git worktree remove`.
```

**new_string:**
```
**Independent Test:** Invoke skill with slug `test-foo` from main worktree. Verify: sibling `D:/repos/dev-pomogator-test-foo` exists on branch `feat/test-foo` (created atomically via `git worktree add -b feat/test-foo`), contains `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` (sentinel file), and `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` contains the absolute path. Cleanup with `git worktree remove <path> && git branch -d feat/test-foo`.
```

## Decision required

P0 #1 and P0 #2 must be fixed before `ConfirmStop Discovery`. Apply auto-patches 1–4, then re-run `npx tsx .dev-pomogator/tools/specs-generator/spec-status.ts -Path .specs/worktree-setup -ConfirmStop Discovery`.

P1 #3 (UC-3 invocation-from-sibling refusal) needs explicit user confirmation OR rephrase to softer warning.

P1 #4 (session-pilot internal API claims) is unblockable in this session because session-pilot worktree itself is orphan; verification deferred to Phase 2 (post-bootstrap of session-pilot).

P2 #5–#8 logged, not blocking.
