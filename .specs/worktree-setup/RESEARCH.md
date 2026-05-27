# Research

## Контекст

Self-dogfood paradox: `.claude/settings.json` в репозитории dev-pomogator закоммичен и содержит ~20 hooks с относительными путями `.dev-pomogator/tools/*`. `.dev-pomogator/` gitignored (installer-generated). Когда maintainer создаёт git worktree, `settings.json` распространяется (committed), а `.dev-pomogator/tools/` — нет. В результате каждый Stop/SessionStart/PreToolUse в worktree падает с `ERR_MODULE_NOT_FOUND` (non-blocking, но шумит и burns hot-path latency).

Observed state (2026-05-12): 4 из 5 sibling worktree-ей в `D:/repos/` имеют этот orphan state — `canonical-v2`, `forbid-root-artifacts`, `session-pilot`, `wt-honest-status-command`. Только main worktree `D:/repos/dev-pomogator` имеет полный `.dev-pomogator/tools/`.

## Источники

- `.gitignore:34` — `.dev-pomogator/` gitignored
- `CLAUDE.md` строка "Self-guard: dev-pomogator's own repo uses .claude/settings.json for dogfooding"
- `.specs/personal-pomogator/` FR-2 — обоснование `settings.local.json` для target projects
- `~/.dev-pomogator/config.json` — global installer state, привязан к абсолютным `projectPath`
- Ошибки в исходной сессии (UI output): 8 stop-hooks × 3 PreToolUse Bash × N Bash calls в session-pilot worktree

## Технические находки

### Точка входа self-heal: tsx-runner.js (not tsx-runner-bootstrap.cjs)

Verified via Read of `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` — это thin ~60-line loader, единственная задача которого `require('~/.dev-pomogator/scripts/tsx-runner.js')` и fail-soft при MODULE_NOT_FOUND. Strategy fallback (Strategy 0 native, 1 local tsx, 1.25 home tsx, 1.5 global tsx, 2 npx, 3 npm install + retry) и `resolveScriptPath()` живут в **`tsx-runner.js`** (Read verified: line 85–107 resolveScriptPath, line 359 FAIL emit, line 452 `strategies[].name:notfound` push, line 503 final `process.exit(1)`).

Self-heal patch вставляется в `tsx-runner.js` **сразу после `const scriptPath = resolveScriptPath(args[0])` (текущая line 107) и ДО `const scriptArgs = args.slice(1)` (line 108)**. Логика:

```js
// Self-heal block (FR-3): orphan worktree detection
if (args[0].startsWith('.dev-pomogator/') && !fs.existsSync(scriptPath)) {
  selfHealOrphanWorktree(args[0]);  // appends JSONL + dedup-checks stderr hint
  process.exit(0);  // silent no-op для hook
}
```

`selfHealOrphanWorktree()` — новая функция в том же файле (или вынесена в helper module). Дедупликация по `(worktree_path, session_id)` из env `CLAUDE_SESSION_ID` (fallback PID parent).

### Installer entry point

`bin/cli.js` принимает `--claude --all` и регистрирует CWD как `projectPath` в global config. Confirmed: pkg-script call в `D:/repos/dev-pomogator-session-pilot` будет регистрировать absolute path. Atomic write через temp-file + move уже реализован (см. `atomic-config-save` rule).

### Doctor scope для worktree-doctor.cjs

Polная `/pomogator-doctor` slash-command сейчас сидит в `.dev-pomogator/tools/pomogator-doctor/` — не доступна в orphan worktree (chicken-and-egg). Поэтому нужен **отдельный** standalone `worktree-doctor.cjs` в `~/.dev-pomogator/scripts/` (global, zero-dep). Узкий scope: 5–7 проверок верифицирующих именно "worktree boot state", не репликацию pomogator-doctor.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | `.git` exists в CWD | else → exit 3 (not_a_repo) |
| 2 | CWD есть в `git worktree list --porcelain` | определяет main vs worktree |
| 3 | Если worktree: `.dev-pomogator/tools/` существует | else → exit 1 (tools_missing) |
| 4 | `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` содержит абсолютный CWD | else → exit 1 (not_registered) |
| 5 | 3 случайные sentinel files из `.claude/settings.json` Stop hooks реально существуют | else → exit 2 (partial_install) |
| 6 | `package.json` содержит `"name":"dev-pomogator"` | else → exit 3 (not_dev_pomogator) |

Stdout формат plain-text для AI parsing: `key=value` пары + `status=OK|ORPHAN|PARTIAL_INSTALL|NOT_REGISTERED`.

### Branch creation

`git worktree add -b feat/{slug} <path>` (atomic — создаёт новый local branch off HEAD И worktree одной командой). Verified via `git worktree add --help`: usage `git worktree add [(-b|-B) <new-branch>] <path> [<commit-ish>]`. Без `-b` флага `<branch>` интерпретируется как `<commit-ish>` и должен существовать (или быть remote-tracking branch с `--guess-remote`). Для нашего flow (новая локальная ветка off HEAD) `-b` обязателен.

Skill prefix `feat/{slug}` matches user's recent convention (`feat/session-pilot`, `feat/forbid-root-artifacts-v1.1.0`). Conflict resolution: если branch `feat/{slug}` уже existed (вне зависимости от того, checked out где-то или нет) — `-b` упадёт с "fatal: a branch named 'feat/{slug}' already exists". Skill детектит это pre-flight через `git show-ref --verify --quiet refs/heads/feat/{slug}` и предлагает либо reuse existing (через `git worktree add <path> feat/{slug}` без `-b`) либо abort с suggestion переименовать slug.

### session-pilot integration surface (US-5)

session-pilot v0.3.0 (`D:/repos/dev-pomogator-session-pilot/extensions/session-pilot/`) уже имеет:

- **Worktree indexer** (`indexer.py`) — сканирует JSONL по `~/.claude/projects/`, строит per-worktree manifest
- **Server** (`server.py`) на port 8083 — отдаёт `/api/claude`, `/api/launch`, etc.
- **Frontend** (`frontend.py`) — генерирует HTML с Tabulator.js таблицей, action buttons на каждую строку
- **terminal_launcher.py** — spawn нового Windows Terminal окна с `claude --resume <uuid>` (working pattern для `gh pr create`-style spawn)
- **Handlers** (`handlers.py:52`) — POST /api/launch принимает `worktree_path`, валидирует против indexer whitelist (security)

Что отсутствует и нужно добавить (отдельная имплементация в session-pilot worktree, в эту spec — только контракт):

1. `indexer.py` per-worktree поле `tools_present: bool` — populates via spawn `worktree-doctor.cjs --quick` (новый flag — runs только Check #3 из doctor)
2. `handlers.py` новый endpoint `POST /api/bootstrap {worktree_path}` — reuse whitelist pattern из `/api/launch`, spawn through `terminal_launcher.spawn_terminal` с командой `node <main-cli>/cli.js --claude --all`
3. `frontend.py` новая колонка `bootstrap` в Tabulator config — formatter conditional на `tools_present`, click handler POSTs to `/api/bootstrap`
4. `extension.json` version bump 0.3.0 → 0.4.0

worktree-doctor.cjs ОБЯЗАН поддерживать `--quick` mode — это контракт session-pilot integration. Quick mode: только Check #3 (tools dir existence) + Check #6 (is dev-pomogator repo). Exit 0=present, 1=missing, 3=not-applicable. Бюджет: <50ms per call (indexer scans N worktrees в parallel — N×50ms acceptable).

### PR creation через gh CLI — three-layer config resolution

**Critical constraint:** dev-pomogator shipped via `npx` к третьим сторонам. Skill ОБЯЗАН работать на любом repo любого user-а — НИКАКИХ хардкодов owner/repo. См. memory `feedback_no-hardcoded-repo-or-user-identifiers.md` + `feedback_env-first-then-investigate-then-ask.md`.

**Layered resolution model (strict order, skill stops at first success):**

#### Layer 0: Ensure env file exists (idempotent, always runs first on `--pr=draft`)

Skill checks `fs.existsSync('~/.dev-pomogator/worktree-setup.env')`. If absent → creates with stub template (commented headers + empty `key=` lines + inline doc-comments naming the investigation command per key). If present → does NOT overwrite (regardless of fill state).

Persistence model: skill only fills empty values via Edit (`key=` → `key=value`) after successful resolution in Layer 2 / Layer 3. Never replaces user-edited values, never touches comments.

#### Layer 1: Env file (persistent, no investigation)

Location: `~/.dev-pomogator/worktree-setup.env` (user-scoped, gitignored).

Format (key=value, comments allowed):
```
# Auto-populated by worktree-setup skill on first successful resolution.
# Edit manually if your gh login or default repo changes.
WT_GH_OWNER=<derived-from-gh-api-user-or-existing-remote>
WT_GH_REPO=<derived-from-basename-or-existing-remote>
WT_GH_PROTOCOL=https|ssh   # optional, default https
WT_GH_HOST=github.com      # optional, default github.com
```

Skill reads on `--pr=draft` invocation. If `WT_GH_OWNER` + `WT_GH_REPO` both non-empty → validate via `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` → 200 OK → use, skip Layer 2 & 3. If file absent or fields empty or validation 404 → fall through.

Persistence: skill writes env file only after a successful resolution (validated by gh). Never writes garbage / unvalidated values.

#### Layer 2: Agent investigates real sources (verify, don't fantasize)

Skill SKILL.md MUST contain explicit instructions table — each value, its source command, its validator:

| Value | Investigation command | Validator | Persist on success |
|-------|----------------------|-----------|---------------------|
| `WT_GH_OWNER` + `WT_GH_REPO` | `git remote get-url origin` → parse URL via regex | `gh repo view {parsed} --json url` returns 200 | env file Layer 1 |
| `WT_GH_OWNER` + `WT_GH_REPO` | `gh repo view --json url,owner,name` (no args, gh auto-detects from `.git/config` + upstream) | gh succeeded → already validated | env file Layer 1 |
| `WT_GH_OWNER` + `WT_GH_REPO` candidate | `gh api user --jq .login` + `path.basename(main_worktree_cwd)` combined as `{login}/{basename}` | `gh repo view {candidate}` returns 200 | env file Layer 1 |
| `WT_GH_PROTOCOL` | `gh auth status --hostname github.com` → grep "Git operations protocol" | always uses literal output | env file Layer 1 |
| `WT_GH_HOST` | derive from existing remote URL OR default `github.com` | trivial | env file Layer 1 |

Investigation rules (anti-fantasy):
- **Every candidate is validated via real query before use** — never trust a derivation blindly. If gh-validate returns 404, candidate is discarded.
- **Multiple candidates from different sources MUST agree** — if `git remote` says `userA/repo` and `gh api user` says `userB/repo`, do not silently pick. Fall through to Layer 3.
- **No string-templating without validation** — agent does NOT construct an owner/repo and proceed, it constructs → validates → only then uses.

#### Layer 3: AskUserQuestion (last resort)

Reached only if Layers 1 & 2 both failed (no env, investigation yielded zero validated candidates OR conflicting candidates).

AskUserQuestion contract:
- Question: "GitHub repo for this worktree? (format: owner/repo)"
- Suggested default field populated from investigation output even though it didn't validate (e.g., `{gh api user --jq .login}/{path.basename(main_worktree_cwd)}`) — never blank
- After user answers, skill validates via `gh repo view` → if 200, persist to env file and proceed; if 404, refuse with hint "Create repo via `gh repo create {user_answer}` first, then re-run"
- Skill NEVER auto-creates the GitHub repo (would risk public exposure of private code)

#### Additional pre-flight: `gh auth status`

Before any of Layer 1/2/3 runs, skill checks `gh auth status` exit code:
- exit 0 → proceed
- exit non-0 → refuse pre-flight with hint "Run `gh auth login` first. Skill will not create worktree until gh is authenticated."
- This check runs BEFORE `git worktree add` so we don't leave a half-created worktree on failure

Skill выполняет push + remote-add + PR create ТОЛЬКО при явном `--pr=draft` flag. Default (no `--pr`): local-only, no env file read/write, no git config mutations, no `gh` calls.

## Где лежит реализация

- App-код skill (NEW): `.claude/skills/worktree-setup/SKILL.md` + `.claude/skills/worktree-setup/scripts/*.ts` (TypeScript helpers)
- Global doctor (NEW): `~/.dev-pomogator/scripts/worktree-doctor.cjs` (standalone, zero-dep)
- Self-heal patch (EDIT): `~/.dev-pomogator/scripts/tsx-runner.js` (existing, insert orphan-detect block after `resolveScriptPath()` line 107)
- Installer registration (NEW): добавить worktree-doctor.cjs и обновлённый tsx-runner-bootstrap.cjs в `src/installer/` artifacts (чтобы auto-update раскатил)
- Audit log (NEW при первом запуске): `~/.dev-pomogator/orphan-worktrees.jsonl`
- Tests (NEW): `tests/e2e/worktree-setup.test.ts` (integration через spawnSync + git worktree fixture)

## Выводы

- Skill — orchestration слой (TypeScript), вызывает git + installer + doctor sequentially.
- Doctor — standalone CJS в global location, не зависит от worktree-local state, читает global config.
- Self-heal — minimal patch existing `tsx-runner.js` в одном месте (after `resolveScriptPath()` line 107; deduplicated по worktree path × session_id).
- Не пытаемся починить self-dogfood paradox в этой спецификации (см. Risk #1) — фиксируем как known constraint.
- Session transfer и cleanup-batch — out-of-scope (явные user-decisions).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | Modifying `~/.dev-pomogator/config.json` | FR-4 (installer integration) |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через `flag: 'wx'` (O_EXCL) | Concurrent worktree create | FR-5 (concurrency safety) |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Пути валидировать через resolve+startsWith | Skill принимает slug → resolves to path | FR-1 (path validation) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Manifest — source of truth для апдейтера | Skill регистрирует new artifacts | FR-6 (manifest updates) |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Апдейтер удаляет только managed-файлы | Adding worktree-doctor.cjs to managed list | FR-7 (uninstall safety) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | В `extensions/**/*.ts` relative imports `.ts` | Skill scripts | NFR-Reliability (Node 22.6+ native strip-types) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты ОБЯЗАНЫ быть интеграционными | Test design | NFR-Reliability (test scope) |
| screenshot-driven-verification | `.claude/rules/pomogator/screenshot-driven-verification.md` | КАЖДЫЙ скриншот реально анализировать | Manual verification | NFR-Verification |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| context-menu skill | `.claude/skills/context-menu/SKILL.md` | Pattern для skill с Windows-specific bash invocations | Reference для skill structure |
| pomogator-doctor | `.dev-pomogator/tools/pomogator-doctor/` | 17-check diagnostic скрипт + 🟢🟡🔴 grouping | Шаблон формата вывода (но НЕ переиспользуем — orphan worktree не имеет доступа) |
| tsx-runner-bootstrap | `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` | Thin ~60-line loader, `require`s tsx-runner.js | Read-verified не patch target (loader only) |
| tsx-runner | `~/.dev-pomogator/scripts/tsx-runner.js` | Script resolution (`resolveScriptPath` line 85–107) + strategy fallback (Strategy 0/1/1.25/1.5/2/3) | **Integration point для US-2 self-heal patch** (insert after line 107) |
| installer | `bin/cli.js` + `src/installer/` | Registers projectPath в global config, copies tools/skills | Reused as-is в bootstrap step |
| dev-pomogator-uninstall | `.claude/skills/dev-pomogator-uninstall/SKILL.md` | Skill structure pattern (slash-command style) | Reference для skill scaffolding |

### Architectural Constraints Summary

Скилл живёт в `.claude/skills/worktree-setup/` (committed в dev-pomogator repo). Sub-scripts — TypeScript под `.claude/skills/worktree-setup/scripts/`. Global artifacts (`worktree-doctor.cjs`, patched `tsx-runner.js`) — устанавливаются installer-ом в `~/.dev-pomogator/scripts/` (managed paths трекаются в global config с SHA-256 hashes). Никаких изменений в `.claude/settings.json` (committed) — это разрушит self-dogfood для main worktree-репозитория. Никаких изменений в существующих hooks — self-heal встраивается ИЗНУТРИ tsx-runner.js (after resolveScriptPath line 107), прозрачно для всех hook scripts.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Self-dogfood paradox: changes to committed `.claude/settings.json` в main worktree автоматически попадают во все worktree-и; refactor settings.json в одной ветке поломает остальные | High | Medium | Не менять `.claude/settings.json` в скоупе этой spec; document как known constraint в DESIGN.md; future spec может разрешить через split на committed (skeleton) vs local (per-worktree overlay) |
| Bootstrap command pins абсолютный путь к main worktree `bin/cli.js`; если main worktree переименован/удалён, self-heal hint указывает на несуществующий путь | Medium | Medium | Self-heal читает `~/.dev-pomogator/config.json` `installedExtensions[].projectPaths[]` и iterate через все зарегистрированные projectPath, выбирает первый где `fs.existsSync(<path>/bin/cli.js)` returns true. Если ни одного living main install не найдено — emit generic hint без literal package identifier: "No living dev-pomogator main install found in registered projectPaths. Re-install dev-pomogator via your package manager (the original source you used: npx/npm/clone), then re-run hook in this worktree." Никакого хардкоженного `npx github:<owner>/<repo>` — owner/repo не известен скиллу и не должен быть pinned в коде (см. memory `no-hardcoded-repo-or-user-identifiers`). |
| Concurrent skill invocations из двух терминалов одновременно → race на `~/.dev-pomogator/config.json` (gone wrong = corrupted config) | Low | High | Использовать существующий atomic-config-save паттерн (`flag: 'wx'` для lock-file); installer уже это делает, skill наследует через bin/cli.js call |
| `feat/{slug}` branch уже занят другим worktree (например, я открыл его в session-pilot) → `git worktree add` падает с "branch already checked out" | Medium | Low | Skill детектит conflict перед `git worktree add` через `git worktree list --porcelain`; user-friendly error с предложением unique slug или manual `git worktree remove` существующего |
| Sibling path `D:/repos/dev-pomogator-{slug}` уже существует как обычная директория (не worktree) | Low | Low | Skill проверяет `fs.existsSync` перед `git worktree add`; если directory exists и не worktree — refuse с clear error |
| Hardcoded GitHub owner/repo identifiers попадают в SKILL.md / scripts (dev-pomogator shipped к третьим сторонам через npx) — fail для любого user-а кроме maintainer-а | Medium | High | Все owner/repo derived from runtime context (git remote, gh repo view, gh api user); explicit acceptance test "skill works on forked repo" (US-3 AC); pre-commit grep check для literals `stgmt/dev-pomogator` в `.claude/skills/worktree-setup/` |
| gh CLI not authenticated на target machine — skill `--pr=draft` упадёт midway после worktree уже создан | Medium | Low | Skill проверяет `gh auth status` **до** `git worktree add` если `--pr=draft` указан; refuse pre-flight с hint `gh auth login` |
| Env file `~/.dev-pomogator/worktree-setup.env` ages out (user changed gh login, deleted/transferred repo, или moved org) → skill использует stale WT_GH_OWNER → push fails / PR goes to wrong repo | Low | Medium | Skill ВСЕГДА validate env values via `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` перед использованием; если 404 → log warn + fall through to Layer 2 investigation + overwrite env с fresh values |
| Agent fantasy: skill подставляет owner/repo не выполнив investigation, или принимает кандидата без validation | Medium | High | SKILL.md содержит explicit instruction table (Layer 2 RESEARCH.md) — для каждого value указан investigation command И validator; SKILL.md mission text запрещает "guess without verify"; acceptance test purposefully feeds skill ambiguous state и проверяет что skill falls to Layer 3 а не fantasizes |
