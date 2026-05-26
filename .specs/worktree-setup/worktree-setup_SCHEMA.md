# worktree-setup Schema

## Visual pipeline diagram

```
[user invocation: slug + --pr=draft?]
            ↓
[Step 2: slug regex validate]
            ↓
[Step 3: gh auth pre-flight (only if --pr)]    ←─ FR-5
            ↓
[Step 4: detect main worktree via git worktree list --porcelain]
            ↓
[Step 5: CWD == main? if not → FR-8 warn flow]
            ↓
[Step 6: branch pre-flight: git show-ref ...]
            ↓
[Step 7: git worktree add -b feat/<slug> <path>]    ←─ FR-1
            ↓
[Step 8: node <main>/bin/cli.js --claude --all]    ←─ FR-2
            ↓
[Step 8b: env-sync — copy .env*, regenerate .devcontainer/.env, warn on secrets]    ←─ FR-10
            ↓
[Step 8c: build/deps-sync — npm install + npm run build (unless --skip-build)]    ←─ FR-11
            ↓
[Step 9: worktree-doctor.cjs (full)]    ←─ FR-6
            ↓
[Step 10: if --pr → three-layer resolve → push + gh pr create]    ←─ FR-4
            ↓
[Step 11: final summary block to user]

Parallel global infrastructure (FR-3):
[any hook fires]
   → tsx-runner-bootstrap.cjs (thin ~60-line loader; require's runner)
   → tsx-runner.js (resolveScriptPath line 107)
   → fs.existsSync(scriptPath)? ↓ no
   → orphan detect → append JSONL + maybe stderr hint → process.exit(0)
   (if exists ↓ yes → strategy fallback continues as before)
```

## Env file

```
# worktree-setup config — auto-created by skill, safe to edit manually.
# Each key documents its canonical investigation source — agent uses those
# commands when a value is empty (Layer 2). Persist your values here to skip
# investigation entirely (Layer 1).

# WT_GH_OWNER — github account/org. Source: `gh api user --jq .login` or parsed
# from `git remote get-url origin`. WT_ prefix avoids collision with gh CLI's own GH_HOST env var.
WT_GH_OWNER=

# WT_GH_REPO — github repository name. Source: `path.basename(main_worktree_cwd)`
# or parsed from `git remote get-url origin`.
WT_GH_REPO=

# WT_GH_PROTOCOL — https or ssh. Source: `gh auth status --hostname github.com`
# field "Git operations protocol". Default: https.
WT_GH_PROTOCOL=

# WT_GH_HOST — github hostname (for github enterprise users). Default: github.com. (Naming note: gh CLI itself reads GH_HOST as shell env var; our WT_ prefix prevents user confusion between this file's config key and gh CLI's runtime env var.)
WT_GH_HOST=
```

- `WT_GH_OWNER` (string, kebab-case or alphanumeric): GitHub user/org login, e.g., `acme-corp` or `john-doe`. Validated via `gh api users/${WT_GH_OWNER}` returns 200.
- `WT_GH_REPO` (string): GitHub repo name (without owner prefix), e.g., `dev-pomogator`. Validated jointly with owner via `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` returns 200.
- `WT_GH_PROTOCOL` (enum `https|ssh`, default `https`): determines remote URL format (`https://github.com/<o>/<r>.git` vs `git@github.com:<o>/<r>.git`).
- `WT_GH_HOST` (string, default `github.com`): for GitHub Enterprise users with a custom hostname. Used for both `gh` CLI `--hostname` flag and remote URL construction.

## orphan-worktrees.jsonl entry

```json
{
  "ts": "ISO8601",
  "worktree_path": "absolute-path-string",
  "missing_script": "relative-to-worktree-path-string",
  "hook_event": "Stop|SessionStart|PreToolUse|...",
  "session_id": "string-or-null"
}
```

- `ts` (ISO 8601 string): when orphan detection fired.
- `worktree_path` (absolute path string): the worktree where the missing target was looked up.
- `missing_script` (relative path string, starts with `.dev-pomogator/`): what the hook tried to invoke.
- `hook_event` (string): which hook lifecycle event triggered the firing (Stop / SessionStart / PreToolUse Bash / etc.).
- `session_id` (string or null): from env `CLAUDE_SESSION_ID` if set; null if absent.

JSONL is append-only. One JSON object per line, newline-terminated.

## env-sync candidate selection (FR-10)

Files synced from main into a new worktree are computed at runtime — never a hardcoded filename list:

- **include-globs** (repo root only): `.env`, `.env.*`
- **must be gitignored**: `git -C <main> check-ignore <file>` exits 0 (committed files are already carried by `git worktree add`, so they are excluded)
- **exclude-list**: `.env.example` (committed template, not a real config); `.devcontainer/.env` (regenerated separately with worktree-unique ports — see FR-10)
- **secret-patterns** (case-insensitive, trigger stderr warning): `password`, `secret`, `api[_-]?key`, `token`, `BEGIN (RSA |EC |DSA )?PRIVATE KEY` — same set as `Test-SensitiveContent` in `extensions/devcontainer/tools/devcontainer/launch-worktree.ps1`

Copy is byte-identical; existing target files are skipped (no overwrite).

## env-sync audit JSONL entry

```json
{
  "ts": "ISO8601",
  "worktree_path": "absolute-path-string",
  "file": "relative-to-worktree-path-string",
  "action": "copied|regenerated|skipped|warned",
  "secret_detected": true
}
```

- `ts` (ISO 8601 string): when the env-sync action fired.
- `worktree_path` (absolute path string): the new worktree receiving the file.
- `file` (relative path string): the env/config file acted upon.
- `action` (enum): `copied` (byte copy done) | `regenerated` (`.devcontainer/.env` rebuilt with unique ports) | `skipped` (target already existed) | `warned` (copied but matched a secret pattern).
- `secret_detected` (boolean): true if the file's contents matched a secret pattern.

Append-only, one JSON object per line. Written under `~/.dev-pomogator/logs/worktree-env-sync.jsonl`; read tolerance — unparseable lines skipped.

## skill run log entry (NFR-R7)

```json
{
  "ts": "ISO8601",
  "slug": "string",
  "worktree_path": "absolute-path-string",
  "steps": {
    "created": "done|failed|skipped",
    "bootstrapped": "done|failed|skipped",
    "env_synced": "done|failed|skipped",
    "built": "done|failed|skipped",
    "doctor": "done|failed|skipped",
    "pr": "done|failed|skipped"
  },
  "outcome": "success|partial|failed",
  "duration_ms": 1234
}
```

- `ts` (ISO 8601 string): when the skill invocation finished.
- `slug` (string): the requested slug.
- `worktree_path` (absolute path string): the worktree created (or attempted).
- `steps` (object): per-step status (`done`/`failed`/`skipped`) for created / bootstrapped / env_synced / built / doctor / pr — mirrors the NFR-U6 summary block.
- `outcome` (enum): `success` (all non-skipped steps done) | `partial` (some failed but worktree preserved) | `failed` (worktree not created).
- `duration_ms` (integer): total wall-clock, EXCLUDING `npm install`/`npm run build` time per NFR-P5 (build duration may be reported separately).

One JSON object per line, append-only (atomic O_APPEND), written to `~/.dev-pomogator/logs/worktree-setup.jsonl`. A write failure SHALL NOT fail the run (observability is non-critical, NFR-R7).

## POST /api/bootstrap request body

```json
{
  "worktree_path": "absolute-path-string"
}
```

- `worktree_path` (absolute path string, required): the worktree to bootstrap. Must match a path currently enumerated by session-pilot's indexer (whitelist).

## POST /api/bootstrap response (200)

```json
{
  "ok": true,
  "spawned_pid": 12345
}
```

- `ok` (boolean): true on success.
- `spawned_pid` (integer): PID of the spawned Windows Terminal process. Useful for client-side polling/cancellation.

## POST /api/bootstrap response (403 — whitelist failure)

```json
{
  "ok": false,
  "error": "worktree_path not in current index whitelist"
}
```

## worktree-doctor.cjs stdout format

```
key1=value1
key2=value2
...
status=OK|TOOLS_MISSING|NOT_REGISTERED|PARTIAL_INSTALL|NOT_APPLICABLE
```

Plain text, one key=value pair per line, last line is always `status=<STATUS>`. Designed for both AI parsing (grep `^status=`) and human reading. No JSON wrap — keeps script under 300 LOC and avoids deps.

Keys emitted in full mode:
- `worktree=true|false` — is CWD a worktree (not main)
- `main_path=<absolute>` — detected main worktree
- `current_path=<absolute>` — CWD
- `branch=<name>` — current branch
- `tools_present=true|false` — `.dev-pomogator/tools/` exists
- `registered=true|false` — CWD in global `projectPaths[]`
- `partial_install_missing=<comma-separated-paths>` — only if status=PARTIAL_INSTALL
- `suggested_action=bootstrap|repair|none` — what skill should do next
- `bootstrap_command=node <abs>/bin/cli.js --claude --all` — exact retry command

Keys emitted in `--quick` mode (subset):
- `tools_present=true|false`
- `status=OK|TOOLS_MISSING|NOT_APPLICABLE`

## Правила валидации

- Slug MUST match regex `^[a-z][a-z0-9-]*[a-z0-9]$` (kebab-case, 1–50 chars, no leading/trailing dash). Reject early with exit code 2.
- env file: keys MUST be one of `WT_GH_OWNER`, `WT_GH_REPO`, `WT_GH_PROTOCOL`, `WT_GH_HOST` — unknown keys ignored with warning to stderr (not fatal, allows forward-compat additions). WT_ prefix prevents namespace collision with gh CLI's own GH_HOST shell env var.
- env file `WT_GH_PROTOCOL` MUST be `https` or `ssh` if present (case-insensitive); other values rejected with hint.
- env file values MUST be validated via `gh repo view ${WT_GH_OWNER}/${WT_GH_REPO}` returns 200 before being used; 404 falls through to next resolution layer.
- JSONL entry: ALL five fields required. Lines failing parse silently skipped during read (read tolerance), but every write MUST produce a valid line. Validation: `JSON.parse` succeeds AND all 5 keys present.
- POST /api/bootstrap body: `worktree_path` MUST be an absolute path AND MUST match a current indexer whitelist entry. 403 on whitelist miss.
- Doctor stdout: last line MUST start with `status=`. Tests grep this exact prefix.
- No hardcoded GitHub identifiers (`stgmt/dev-pomogator`, etc.) anywhere in skill scripts or doctor.cjs — enforced via pre-commit grep check.
- env-sync candidate selection MUST be runtime-derived (include-globs `.env`/`.env.*` + `git check-ignore`), never a hardcoded filename; `.env.example` and `.devcontainer/.env` are always excluded from byte-copy.
- env-sync audit JSONL: `action` MUST be one of `copied|regenerated|skipped|warned`; `secret_detected` MUST be boolean. Existing target files MUST be `skipped` (never overwritten).
- skill run log JSONL: `outcome` MUST be one of `success|partial|failed`; each `steps.*` value MUST be `done|failed|skipped`. A write failure MUST NOT fail the run (observability non-critical).
- build/deps-sync: `npm install` runs only if root `node_modules` absent; `npm run build` runs only if `dist` absent or stale (any `src` file newer than newest `dist` file); `--skip-build` skips both; non-zero exit is best-effort (hint + continue, no rollback).
