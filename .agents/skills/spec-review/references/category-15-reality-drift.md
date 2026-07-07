# Category 15: Reality Drift (spec ↔ repo state)

Category 15 delegates to `Skill("spec-reality-check")` — a dedicated skill that runs six checks against the spec docs vs. the actual repository state (filesystem + git history).

This category fires on every phase: ConfirmStop Discovery / Requirements / Finalization, after each implementation phase, and on manual `proverь спеку` invocations.

## Invocation

```
Skill("spec-reality-check")
```

The skill resolves the target spec from the current conversation context (`.specs/{slug}/` reference) and runs `npx tsx .claude/skills/spec-reality-check/scripts/verify.ts <spec-path> --format json`. The spec-review pipeline parses the JSON output and folds findings into the overall report.

## Six sub-checks

The skill emits `AuditFinding[]` from these check IDs:

| Check ID | Severity (skill) | Maps to (spec-review) | What it verifies |
|----------|-----------------|------------------------|-------------------|
| `FC_CREATE_EXISTS` | ERROR | **P0** | FILE_CHANGES row `action=create` on a file that already exists |
| `FC_EDIT_MISSING` | ERROR | **P0** | FILE_CHANGES row `action=edit` on a missing file |
| `FC_DELETE_MISSING` | ERROR | **P0** | FILE_CHANGES row `action=delete` on a missing file |
| `NARRATIVE_PATH_MISSING` | WARNING | **P1** | inline backtick path in FR / DESIGN / TASKS pointing at a missing file |
| `CODE_DRIFT_FR_ALREADY_DONE` | WARNING | **P1** | `git log -S "FR-N"` returns commits — feature already shipped, spec re-planning done work |
| `TASKS_FC_CONSISTENCY` | WARNING / INFO | **P1** / **P2** | TASKS files not in FILE_CHANGES (or vice versa) |

Plus informational checks:

| Check ID | Severity | Maps to |
|----------|----------|---------|
| `FC_PARSE_UNPARSEABLE` | INFO | **P2** |
| `FC_EMPTY` | INFO | **P2** |
| `CODE_DRIFT_SKIPPED` | INFO | **P2** |

## Severity mapping rules

- skill `ERROR` → spec-review **P0** (blocks ConfirmStop)
- skill `WARNING` → spec-review **P1** (requires acknowledgement or fix)
- skill `INFO` → spec-review **P2** (informational, no block)

## Example findings → fix recipes

### FC_EDIT_MISSING

```
ERROR FC_EDIT_MISSING
  FILE_CHANGES action=edit on missing path: src/installer/install-user-scope.ts
  → src/installer/install-user-scope.ts:42
```

**Fix:** verify with `git log --diff-filter=D -- src/installer/install-user-scope.ts` whether the file was deleted; if so, the spec is planning to edit a removed file. Either restore the file path (typo / rename) or remove the row from FILE_CHANGES.

### CODE_DRIFT_FR_ALREADY_DONE

```
WARNING CODE_DRIFT_FR_ALREADY_DONE
  FR-5 has 3 matching git commits — feature may already be shipped
  commits: abc123, def456, ghi789
```

**Fix:** open commits to confirm FR-5 is actually shipped (vs. coincidental mention). If shipped — mark FR-5 done in spec, update CHANGELOG, do not include in current implementation plan. If false positive (commit message mentions FR-5 in changelog reference, not implementation) — note in spec as `[verified non-implementation]`.

### TASKS_FC_CONSISTENCY

```
WARNING TASKS_FC_CONSISTENCY
  TASKS.md references 'src/orphan_not_in_fc.ts' not in FILE_CHANGES.md
```

**Fix:** add the path to FILE_CHANGES table with appropriate action and reason, OR remove the path from TASKS.md `**files:**` block.

## When category 15 is no-op

- Spec `.specs/{slug}/` does not exist — skill exits gracefully, no findings.
- `FILE_CHANGES.md` is empty scaffold — `FC_EMPTY` INFO finding only.
- Repository lacks `.git/` directory (Docker test env per `docker-no-git-repo` rule) — `CODE_DRIFT_SKIPPED` INFO finding, other checks still run.

## Related

- [`.claude/skills/spec-reality-check/SKILL.md`](../../spec-reality-check/SKILL.md) — full skill reference
- [`.claude/skills/spec-reality-check/references/checks.md`](../../spec-reality-check/references/checks.md) — per-check details, root causes, fix recipes
- [`.claude/skills/spec-review/references/category-14-memory-constraints.md`](category-14-memory-constraints.md) — sibling cross-cutting category
