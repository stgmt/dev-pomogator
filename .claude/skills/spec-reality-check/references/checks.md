# Checks reference — 10 codes

Each finding emits `AuditFinding` shape: `{check, category, severity, message, details, file?, line?}` (interface imported from `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14`).

## Drift checks (ERROR / WARNING)

### FC_CREATE_EXISTS

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=create` path already exists on disk
- **Root cause:** Spec is stale — file already created (likely shipped in earlier session), FC.md not updated
- **Fix:** Change row to `action=edit` if further changes planned, or remove/comment row out if work done. See HTML-comment pattern in canonical-plugin spec.

### FC_EDIT_MISSING

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=edit` on nonexistent path
- **Root cause:** Path renamed/deleted in code, not updated in FC.md; or typo
- **Fix:** `git log --diff-filter=D -- <path>` to confirm deletion; update or remove row

### FC_DELETE_MISSING

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=delete` on nonexistent path
- **Root cause:** File already deleted in previous commit — work done
- **Fix:** Remove row from FC.md, record in CHANGELOG.md

### NARRATIVE_PATH_MISSING

- **Severity:** WARNING
- **Category:** LOGIC_GAPS
- **Trigger:** Inline backtick path in FR/DESIGN/TASKS.md with TRACKED extension (`.ts`/`.py`/`.json`/etc.) does not exist on disk
- **Skipped automatically:** placeholders (`{x}`), globs (`steps/**/*.ts`), runtime paths (`~/...`/`$VAR`/`%VAR%`/abs), paths in fenced ``` blocks, paths inside spec dir, paths in FC `action=create` plan set
- **Root cause:** Stale/renamed/never-shipped narrative reference
- **Fix:** Update path or mark `[historical: ...]`

### CODE_DRIFT_FR_ALREADY_DONE

- **Severity:** WARNING
- **Category:** LOGIC_GAPS
- **Trigger:** `git log --max-count=20 -S "FR-N"` returns ≥1 commit for FC.md paths
- **Root cause:** Feature already shipped; spec re-planning done work
- **Fix:** Verify shipped — if true, mark spec done, update CHANGELOG; if false-positive (commit mentions FR-N in changelog ref), note `[verified non-implementation]`

### TASKS_FC_CONSISTENCY

- **Severity:** WARNING (orphan TASK file) / INFO (orphan FC file)
- **Category:** INCONSISTENCY
- **Trigger:** File mentioned in TASKS.md (via `**files:**` block OR inline backtick with path separator) but not in FC.md table — or vice versa
- **Skipped:** Paths matching `[OUT_OF_SCOPE: ...]`, `~~strikethrough~~`, placeholders, globs, runtime paths
- **Root cause:** TASKS/FC desync — added/renamed only on one side
- **Fix:** Reconcile — typically FC is primary inventory, TASKS is operational view

## Informational skip codes (INFO)

### FC_PLACEHOLDER_PATH

- **Severity:** INFO
- **Trigger:** FC row path is unfilled template — `{slug}`, `<TBD/name>`, bare `TBD`, `...` prefix
- **Why:** Spec is scaffold-stage; FC checks not applicable
- **Action:** Fill placeholder once decision known. Skill emits INFO so user knows row was parsed.

### FC_GLOB_PATTERN

- **Severity:** INFO
- **Trigger:** FC row path contains glob metachar — `**`, `*` in segment, `?`, `[abc]`
- **Why:** fs.existsSync of literal glob always false; spec uses pattern instead of concrete path
- **Action:** Either expand pattern to concrete rows OR accept as informational marker. Real-world hit: `extensions/*/extension.json` in codex-cli-support.

### FC_ACTION_UNCHECKED

- **Severity:** INFO
- **Trigger:** FC row `action` not in `{create, edit, delete}` — e.g. `rename`, `move`, `replace`, `reuse`, `preserve`, `create+edit`
- **Why:** rename/move/replace need source+target; single Path column doesn't express that. Standard CRUD trio is checked; others noted.
- **Action:** Consider splitting non-CRUD rows into `delete (source)` + `create (target)` for verifiability.

### FC_PARSE_UNPARSEABLE

- **Severity:** INFO
- **Trigger:** Row in `|`-table cannot be matched to Path column (no Path/File/Файл/Путь header), OR Action cell is empty/stripped to empty after backtick+asterisk removal
- **Action:** Standardize FC table header to `| Path | Action | Reason |` (or Cyrillic equivalents). Recognized headers: `path|file|файл|файлы|путь|пути|имя` for Path; `action|действие|операция` for Action; `reason|note|notes|описание|причина|комментарий` for Reason.

### FC_EMPTY

- **Severity:** INFO
- **Trigger:** FC.md has content but no parseable rows AND no skip-class findings (placeholder/glob/unparseable)
- **Why:** Empty scaffold spec — FC checks have nothing to verify
- **Action:** Add rows when implementation scope known.

### CODE_DRIFT_SKIPPED

- **Severity:** INFO
- **Trigger:** `.git/` directory not present at repo root
- **Why:** Docker test env strips `.git` (per `docker-no-git-repo` rule); code-drift impossible without git history
- **Action:** None — informational. Other checks still run.

## Output formats

| Format | Use case | Example |
|--------|----------|---------|
| `--format json` (default) | CI / hook consumption | `{"findings": [...], "summary": {by_severity, by_check}}` |
| `--format human` | Interactive read | ANSI-colored (chalk): red=ERROR / yellow=WARNING / blue=INFO + file:line refs |
| `--format markdown` | Commit-able reports (e.g. REALITY_CHECK_REPORT.md) | Markdown table: Check / Severity / File / Message / Suggested fix |

## Exit codes

- `0` — always (findings != error). Hook downstream checks `findings[].severity === 'ERROR'` для deny logic.
- `1` — only on unparseable CLI args или IO error (spec dir not found).

## Severity → spec-review P-level mapping

| Skill | spec-review |
|-------|-------------|
| ERROR | **P0** (blocks ConfirmStop) |
| WARNING | **P1** (acknowledgement required) |
| INFO | **P2** (informational) |

## Helper predicates (skip rules)

Listed for transparency; exported from `scripts/verify.ts`:

- **`isPlaceholderPath(p)`** — true if path contains `{...}`, `<...>`, bare `TBD`, or starts with `...`
- **`isGlobPath(p)`** — true if path contains `**`, `*` in path segment, `?`, or `[chars]` without file extension
- **`isRuntimePath(p)`** — true if path starts with `~`, `$VAR`, `%VAR%`, or is absolute (Unix `/etc/` or Windows `C:\`)

These guards keep narrative + FC checks from false-positive WARNINGs on non-repo path references.
