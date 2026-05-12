# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1:** Skill end-to-end overhead (excluding installer time) SHALL NOT exceed 5 seconds on a warm machine. Breakdown budget: worktree-doctor.cjs full mode <200ms, worktree-doctor.cjs `--quick` mode <50ms, slug/branch pre-flight <100ms, env-file read+validate <300ms (including one `gh repo view` API call), skill orchestration overhead <500ms.
- **NFR-P2:** `worktree-doctor.cjs --quick` SHALL complete in <50ms per invocation. Justified by FR-7 budget: session-pilot indexer calls doctor N times (once per worktree); at 5 worktrees this is 250ms total which fits within dashboard SWR cycle.
- **NFR-P3:** tsx-runner.js self-heal block (FR-3, inserted after `resolveScriptPath` line 107) SHALL add ≤5ms overhead per hook invocation in the happy path (target file exists → no JSONL write, no stderr emission). Implementation: single `fs.existsSync` check before strategy iteration.
- **NFR-P4:** Installer time (`node bin/cli.js --claude --all`) is out of NFR scope — bounded by installer's own NFR (this spec does not regress it).

## Security

- **NFR-S1:** Env file `~/.dev-pomogator/worktree-setup.env` SHALL be created with mode 0600 (owner read/write only) on POSIX; on Windows, default ACL inheritance from `~/.dev-pomogator/` directory. No secrets are stored in env file — only `WT_GH_OWNER`, `WT_GH_REPO`, `WT_GH_PROTOCOL`, `WT_GH_HOST` (all non-secret identifiers).
- **NFR-S2:** Path validation (no traversal): all paths derived from user input (slug, worktree_path in `/api/bootstrap`) MUST pass through resolve-within-projectparent check per existing `.claude/rules/no-unvalidated-manifest-paths.md` pattern. `<main-parent>/<main-basename>-<slug>` MUST resolve to an absolute path whose parent equals main-parent (no escape via slug containing `../`).
- **NFR-S3:** `/api/bootstrap` endpoint (session-pilot FR-7) MUST validate `worktree_path` against the indexer's whitelist (reuse handlers.py `_send_json(self, {"ok": False, "error": "worktree_path not in current index whitelist"}, 403)` pattern). Rejects any path not currently enumerated by indexer.
- **NFR-S4:** Skill MUST NOT auto-create the GitHub repo if `gh repo view {owner}/{repo}` returns 404. User-facing hint suggests `gh repo create` but skill never invokes it (avoids accidental public-exposure of private code).
- **NFR-S5:** No hardcoded GitHub owner/repo, no hardcoded paths to maintainer-specific worktrees. All identifiers derived from runtime context (env file, git remote, gh api, cwd). Enforced via pre-commit grep: pattern `stgmt/dev-pomogator` MUST NOT appear in `.claude/skills/worktree-setup/` or `~/.dev-pomogator/scripts/worktree-doctor.cjs` (excluded: documentation referring to the pattern itself as a detection target).

## Reliability

- **NFR-R1:** All env-file writes SHALL use atomic temp-file + move pattern per existing `.claude/rules/atomic-config-save.md`. Concurrent skill invocations from two terminals MUST NOT corrupt the env file.
- **NFR-R2:** Skill SHALL be idempotent: re-invocation with the same slug on an existing worktree SHALL detect via UC-4 flow (`git worktree list --porcelain` lookup) and offer re-bootstrap (no `git worktree add` retry), instead of failing with "path already exists" half-state.
- **NFR-R3:** Bootstrap failure (FR-2 `bin/cli.js` non-zero exit) SHALL NOT auto-delete the half-created worktree. Skill prints retry command and preserves the partial state so user can debug. Justified by `updater-managed-cleanup` rule: never delete user-touched state without explicit consent.
- **NFR-R4:** Doctor exit-code mapping SHALL be stable across versions (OK=0, TOOLS_MISSING=1, PARTIAL_INSTALL=2, NOT_APPLICABLE=3). Any new failure mode adds new exit codes; existing codes are never repurposed. Enforced by integration test asserting exit-code-to-status mapping.
- **NFR-R5:** Self-heal hint deduplication (FR-3) MUST survive process restarts within session — keyed on `CLAUDE_SESSION_ID` env var (which the harness sets per session, stable across hook invocations). Fallback to PID of parent claude process if env var absent.

## Usability

- **NFR-U1:** All error messages SHALL include both the failure cause AND the next-step command. Example: not "gh auth failed" but "gh auth failed. Run `gh auth login` first."
- **NFR-U2:** Env-file stub SHALL include inline `#`-comments naming the canonical investigation command per key (e.g., `# WT_GH_OWNER source: gh api user --jq .login`). User can hand-edit without consulting external docs.
- **NFR-U3:** Skill output SHALL include final summary block with: new worktree path, branch name, doctor verdict, PR URL (if `--pr`), and suggested `wt -d <path> claude` command for opening claude in the new worktree (Windows Terminal CLI — user copies and runs manually, satisfying user's preference against session auto-migration per Q3).
- **NFR-U4:** AskUserQuestion calls (FR-4 Layer 3, FR-8 invocation-from-sibling) SHALL populate the suggested-default field with the best derived value, never blank. Justifies the user clicking "OK on default" 90%+ of the time.
- **NFR-U5:** Self-heal stderr hint (FR-3) SHALL be at most one line — no multi-line banners. Prevents clutter when many hooks fire in sequence.
