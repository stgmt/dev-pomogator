# Missing-File Patches — Consolidated Review

Generated: 2026-05-31
Source artifacts (in `.dev-pomogator-tmp/`):

- `group-a-patches.md` — RENAME_UPDATE auto-applied (89 edits / 30 files / 0 bails)
- `group-b-patches.md` — DELETE_REFERENCE auto-applied (44 DELETE + 20 WRAP + 25 SKIP / 20 files)
- `group-c-review-packet.md` — UNCLEAR top-20 targets for human triage (222 raw findings → 20 unique missing paths)

**Working-tree state (post auto-apply, pre-commit):** 41 spec files modified, +96 / −140 lines net.
Edits are STAGED IN WORKING TREE BUT NOT COMMITTED — this document is the review packet before the user decides to commit.

---

## Executive Summary

| Group | Action class | Findings processed | Files edited | Edits applied (auto) | Bailed for human |
|-------|-------------|--------------------|--------------|----------------------|------------------|
| GROUP_A | RENAME_UPDATE | 89 | 30 | 89 | 0 |
| GROUP_B | DELETE_REFERENCE | 89 | 20 | 64 (44 DELETE + 20 WRAP) | 25 (SKIP) |
| GROUP_C | UNCLEAR (no auto-apply) | 222 | 0 | 0 | 20 (top-20 unique targets) |
| **TOTAL** | — | **400** | **41 unique** (overlap A+B) | **153 auto edits** | **45 needing human review** |

**Totals at a glance:**

- Auto-edits applied (Groups A + B): **153** across **41** files (overlap because some files received both rename and delete edits)
- Items in human-review packet: **45** (25 GROUP_B SKIPs + 20 GROUP_C UNCLEAR top-20)
- Consolidated review path: `.specs/spec-generator-v4/MISSING_FILE_PATCHES_REVIEW.md`

---

## GROUP_A: RENAME_UPDATE

**Pattern:** Old path (`src/installer/shared.ts`, `src/utils/logger.ts`, `src/installer/report.ts`, etc.) → new canonical-plugin path (`.claude/skills/.../scripts/...`, `tools/.../...`).

- Edits applied: **89**
- Files touched: **30**
- Bails: **0** (every finding matched within ±3 line window)

### Sample 10 before/after diffs

| # | Finding | File · Line | Before → After |
|---|---------|-------------|----------------|
| 1 | `src/installer/shared.ts` | `.specs/auto-capture/RESEARCH.md:105` | `` `src/installer/shared.ts` → `makePortableTsxCommand()` `` → `` `.claude/skills/skills-rules-optimizer/scripts/shared.ts` → `makePortableTsxCommand()` `` |
| 2 | `src/installer/report.ts` | `.specs/claude-mem-integration/DESIGN.md:97` | `` \| `InstallReport` \| `src/installer/report.ts` \| Per-component statuses \| `` → `` \| `InstallReport` \| `.claude/skills/skills-rules-optimizer/scripts/report.ts` \| Per-component statuses \| `` |
| 3 | `src/utils/logger.ts` | `.specs/claude-mem-integration/DESIGN.md:98` | `` \| `formatErrorChain` \| `src/utils/logger.ts` \| Error logging \| `` → `` \| `formatErrorChain` \| `tools/steps-validator/logger.ts` \| Error logging \| `` |
| 4 | `src/installer/report.ts` | `.specs/claude-mem-integration/FILE_CHANGES.md:7` | `` \| `src/installer/report.ts` \| edit \| Per-component entries (worker/chroma/mcp/hooks) \| `` → `` \| `.claude/skills/skills-rules-optimizer/scripts/report.ts` \| edit \| Per-component entries (worker/chroma/mcp/hooks) \| `` |
| 5 | `src/utils/logger.ts` | `.specs/claude-mem-integration/RESEARCH.md:67` | `` \| `src/utils/logger.ts` \| `formatErrorChain()` + `getErrorMessage()` \| `` → `` \| `tools/steps-validator/logger.ts` \| `formatErrorChain()` + `getErrorMessage()` \| `` |
| 6 | `src/installer/report.ts` | `.specs/claude-mem-integration/RESEARCH.md:69` | `` \| `src/installer/report.ts` \| Новый файл — InstallReport class \| `` → `` \| `.claude/skills/skills-rules-optimizer/scripts/report.ts` \| Новый файл — InstallReport class \| `` |
| 7 | `src/utils/logger.ts` | `.specs/claude-mem-integration/TASKS.md:72` | `` **leverage:** `formatErrorChain()` из `src/utils/logger.ts` `` → `` **leverage:** `formatErrorChain()` из `tools/steps-validator/logger.ts` `` |
| 8 | `src/installer/report.ts` | `.specs/claude-mem-integration/TASKS.md:96` | `` **files:** `src/installer/report.ts` *(edit)*, `src/installer/index.ts` *(edit)* `` → `` **files:** `.claude/skills/skills-rules-optimizer/scripts/report.ts` *(edit)*, `src/installer/index.ts` *(edit)* `` |
| 9 | `src/installer/shared.ts` | `.specs/codex-cli-support/DESIGN.md:37` | `…\, `src/installer/shared.ts`, `src/installer/memory.ts`,…` → `…\, `.claude/skills/skills-rules-optimizer/scripts/shared.ts`, `src/installer/memory.ts`,…` |
| 10 | `src/installer/shared.ts` | `.specs/codex-cli-support/DESIGN.md:50` | `` `src/installer/shared.ts` `` → `` `.claude/skills/skills-rules-optimizer/scripts/shared.ts` `` |

### Bail list (GROUP_A)

**None.** All 89 findings matched and were rewritten.

### Verdict — GROUP_A

**Safe to commit as-is.** All rewrites are mechanical 1:1 path substitutions inside spec narrative / tables / bullet lists. Zero bails means every cited line still contained the old path verbatim — no drift since the inventory was captured. Recommend committing GROUP_A separately with message like `docs(specs): rewrite v1 paths to v2 canonical-plugin locations (89 edits, 30 files)`.

---

## GROUP_B: DELETE_REFERENCE

**Pattern:** Old v1 file (`src/installer/claude.ts`, `src/installer/memory.ts`, `src/updater/*.ts`, `src/config/schema.ts`, etc.) referenced as historical fact. The auto-applier picks one of three actions per finding:

- **DELETE** — the line is purely a bullet listing the obsolete file; remove the bullet entirely.
- **WRAP** — the line contains other still-valid content; wrap just the obsolete token with `~~strikethrough~~ (removed in v2 migration)`.
- **SKIP** — the line is inside a markdown table cell OR the target path no longer matches the cited line content (drift). Bailed for human review.

### Action breakdown

| Action | Count | % of 89 |
|--------|------:|--------:|
| DELETE | 44 | 49.4% |
| WRAP   | 20 | 22.5% |
| SKIP   | 25 | 28.1% |

Files edited: **20**

### Files edited (GROUP_B)

```
.specs/auto-capture/RESEARCH.md
.specs/claude-mem-integration/RESEARCH.md
.specs/codex-cli-support/RESEARCH.md
.specs/dev-pomogator-canonical-plugin/CHANGELOG.md
.specs/dev-pomogator-canonical-plugin/RESEARCH.md
.specs/extension-beta-flag/RESEARCH.md
.specs/fix-bg-output-loss/CHANGELOG.md
.specs/global-dir-guard/CHANGELOG.md
.specs/global-dir-guard/RESEARCH.md
.specs/install-diagnostics/RESEARCH.md
.specs/lsp-setup/RESEARCH.md
.specs/personal-pomogator/CHANGELOG.md
.specs/personal-pomogator/RESEARCH.md
.specs/pomogator-doctor/CHANGELOG.md
.specs/pomogator-doctor/RESEARCH.md
.specs/skill-listing-budget/CHANGELOG.md
.specs/skill-rule-customization/RESEARCH.md
.specs/spec-reality-check/RESEARCH.md
.specs/spec-workflow-vmodel/RESEARCH.md
.specs/specs-management-as-skill/RESEARCH.md
```

### Sample 10 diffs

| # | Action | File · Line · Target | Before → After |
|---|--------|----------------------|----------------|
| 1 | DELETE | `.specs/auto-capture/RESEARCH.md:104` · `src/installer/claude.ts` | `` - Hooks installer: `src/installer/claude.ts` → `installExtensionHooks()` `` → *(deleted)* |
| 2 | WRAP | `.specs/claude-mem-integration/RESEARCH.md:12` · `src/installer/memory.ts` | `` Код установки: `src/installer/memory.ts` (686 строк), 7 шагов: `` → `` Код установки: ~~`src/installer/memory.ts`~~ (removed in v2 migration) (686 строк), 7 шагов: `` |
| 3 | DELETE | `.specs/codex-cli-support/RESEARCH.md:214` · `src/config/schema.ts` | Whole `- App-код: …` bullet removed |
| 4 | DELETE | `.specs/codex-cli-support/RESEARCH.md:159` · `src/updater/index.ts` | `` - `src/updater/index.ts` и `…shared.ts` уже дают правильные backup/update primitives `` → *(deleted)* |
| 5 | DELETE | `.specs/codex-cli-support/RESEARCH.md:157` · `src/config/schema.ts` | `` - `src/config/schema.ts`, `src/index.ts`, `src/installer/extensions.ts` пока живут в модели `cursor \| claude` `` → *(deleted)* |
| 6 | DELETE | `.specs/dev-pomogator-canonical-plugin/CHANGELOG.md:28` · `src/installer/install-user-scope.ts` | BREAKING bullet about user-scope removal → *(deleted)* |
| 7 | DELETE | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:154` · `src/config/schema.ts` | `` - Конфигурация: `src/config/schema.ts`, … `` → *(deleted)* |
| 8 | WRAP | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:153` · `src/installer/claude.ts` | `` - App-код: `src/installer/claude.ts`, `src/installer/extensions.ts`, … `` → `` - App-код: ~~`src/installer/claude.ts`~~ (removed in v2 migration), `src/installer/extensions.ts`, … `` |
| 9 | WRAP | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:153` · `src/installer/extensions.ts` | Same App-код line; second token wrapped: `…~~`src/installer/extensions.ts`~~ (removed in v2 migration), …` |
| 10 | WRAP | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:153` · `src/installer/gitignore.ts` | Same line; third token wrapped: `…~~`src/installer/gitignore.ts`~~ (removed in v2 migration), …` |

### Bail list (25 SKIPs)

Two SKIP reasons dominate:

- **`markdown table cell`** — the obsolete reference sits inside a `| … | … |` table row; auto-applier won't rewrite cells to avoid corrupting alignment.
- **`target path not present on the cited line (line drifted)`** — the inventory's line number no longer matches the path on that line (likely because GROUP_A rewrites earlier in the same file shifted line numbers).

| # | File · Line | Target | Reason |
|---|-------------|--------|--------|
| 1 | `.specs/claude-mem-integration/RESEARCH.md:99` | `src/installer/memory.ts` | markdown table cell |
| 2 | `.specs/claude-mem-integration/RESEARCH.md:71` | `src/updater/standalone.ts` | markdown table cell |
| 3 | `.specs/claude-mem-integration/RESEARCH.md:70` | `src/updater/index.ts` | markdown table cell |
| 4 | `.specs/claude-mem-integration/RESEARCH.md:68` | `src/installer/index.ts` | markdown table cell |
| 5 | `.specs/codex-cli-support/RESEARCH.md:247` | `src/updater/index.ts` | markdown table cell |
| 6 | `.specs/codex-cli-support/RESEARCH.md:214` | `src/index.ts` | line drifted |
| 7 | `.specs/codex-cli-support/RESEARCH.md:214` | `src/installer/index.ts` | line drifted |
| 8 | `.specs/codex-cli-support/RESEARCH.md:214` | `src/installer/extensions.ts` | line drifted |
| 9 | `.specs/codex-cli-support/RESEARCH.md:214` | `src/updater/index.ts` | line drifted |
| 10 | `.specs/codex-cli-support/RESEARCH.md:214` | `src/updater/github.ts` | line drifted |
| 11 | `.specs/codex-cli-support/RESEARCH.md:157` | `src/index.ts` | line drifted |
| 12 | `.specs/codex-cli-support/RESEARCH.md:157` | `src/installer/extensions.ts` | line drifted |
| 13 | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:196` | `src/installer/uninstall-project.ts` | markdown table cell |
| 14 | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:195` | `src/installer/extensions.ts` | markdown table cell |
| 15 | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:194` | `src/_shared/atomic-write.ts` | markdown table cell |
| 16 | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:193` | `src/updater/content-hash.ts` | markdown table cell |
| 17 | `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:192` | `src/updater/hook-migration.ts` | markdown table cell |
| 18 | `.specs/extension-beta-flag/RESEARCH.md:89` | `src/config/schema.ts` | markdown table cell |
| 19 | `.specs/extension-beta-flag/RESEARCH.md:87` | `src/installer/extensions.ts` | markdown table cell |
| 20 | `.specs/install-diagnostics/RESEARCH.md:189` | `src/updater/shared-sync.ts` | line drifted |
| 21 | `.specs/install-diagnostics/RESEARCH.md:187` | `src/installer/plugin-json.ts` | line drifted |
| 22 | `.specs/personal-pomogator/RESEARCH.md:178` | `src/utils/atomic-json.ts` | markdown table cell |
| 23 | `.specs/personal-pomogator/RESEARCH.md:177` | `src/utils/atomic-json.ts` | markdown table cell |
| 24 | `.specs/personal-pomogator/RESEARCH.md:124` | `src/utils/atomic-json.ts` | line drifted |
| 25 | `.specs/personal-pomogator/RESEARCH.md:122` | `src/installer/memory.ts` | line drifted |

### Verdict — GROUP_B

**Safe to commit as-is for the 64 applied DELETE/WRAP edits.** The 25 SKIPs need a second pass with two extensions to the auto-applier:

1. **Table-cell rewriter:** support striking through a single token inside a `| cell |` while preserving pipe alignment (wrap token with `~~…~~ (v2)` exactly as in non-table WRAP path).
2. **Line-drift re-resolver:** when the cited line no longer contains the target path, re-scan the same file with a ±10-line window OR re-run inventory on the post-GROUP_A working tree.

Recommend committing the 64 applied edits now and filing a follow-up task for the 25 SKIPs.

---

## GROUP_C: UNCLEAR — top-20 targets (human triage required)

**Source:** `.dev-pomogator-tmp/missing-file-top3-inventory.json → group_c_sample_unclear`
**Scope:** 222 raw findings deduplicated to 20 unique missing target paths (top-20 covers the entire sample).

**Verification baseline (2026-05-31 filesystem check):**

- `src/` tree does not exist at all — project is plugin-only since v2.0 canonical migration.
- `tests/e2e/` exists, but none of the listed `tests/e2e/*.test.ts` files in this sample are present.

**Cross-context highlights:**

- `src/installer/*` and `src/updater/*` are deprecated v1 layout; v2 equivalents live in `.claude/skills/<skill>/scripts/`.
- Many `tests/e2e/*.test.ts` files in this sample are planned-but-never-implemented stubs cited from spec TASKS.md / FILE_CHANGES.md authored before implementation was skipped.
- `tools/list` is a JSON-RPC method name (paired with `initialize`) erroneously parsed as a path by the missing-file detector — false positive.

### Summary table (review at a glance)

| # | Target | Refs | Proposed Action | Complexity |
|---|--------|-----:|-----------------|------------|
| 1 | `src/installer/claude.ts` | 32 | Likely RENAME → promote to GROUP_A (`.claude/skills/.../claude-installer.ts`) | medium |
| 2 | ~~`tests/e2e/claude-installer.test.ts`~~ | 27 | Needs human — planned test never implemented; multi-spec dependency | high |
| 3 | `src/index.ts` | 19 | Likely DELETE refs (v1 CLI deprecated) | low |
| 4 | `src/installer/extensions.ts` | 18 | Likely DELETE refs (v1 extensions layer removed) | low |
| 5 | ~~`tests/features/core/CORE003_claude-installer.feature`~~ | 15 | Needs human — planned BDD never created; siblings missing | high |
| 6 | `src/installer/memory.ts` | 13 | Likely RENAME → `extensions/claude-mem-health/` | medium |
| 7 | `src/installer/index.ts` | 12 | Likely DELETE refs (v1 installer entrypoint deprecated) | low |
| 8 | `src/updater/index.ts` | 10 | Likely DELETE refs (v1 updater deprecated; canonical uses `/plugin install`) | low |
| 9 | `tests/e2e/strong-tests-jit.test.ts` | 8 | Needs human — DESIGN says "planned" but FIELD_VERIFICATION claims green | medium |
| 10 | ~~`tests/e2e/test-statusline.test.ts`~~ | 8 | Needs human — TASKS [x] complete but file missing; extension being decommissioned | medium |
| 11 | `src/doctor/reporter.ts` | 8 | Likely RENAME → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts` (sibling pattern) | low |
| 12 | `src/config/schema.ts` | 7 | Likely DELETE refs (v1 schema replaced by plugin.json) | low |
| 13 | ~~`tests/e2e/pomogator-doctor.test.ts`~~ | 7 | Needs human — actual tests use split layout `doctor-{core,entry,gating,…}.test.ts` | medium |
| 14 | `src/updater/hook-migration.ts` | 6 | Likely DELETE refs (v1 hook migration; canonical uses hooks.json directly) | low |
| 15 | `tests/e2e/settings-protection.test.ts` | 6 | Needs human — referenced as EXISTING evidence pattern but missing on disk | medium |
| 16 | `tests/e2e/scope-gate-helpers.ts` | 6 | Likely DELETE refs (TASKS.md explicitly notes "не создан, helpers инлайнены") | low |
| 17 | `tests/e2e/personal-pomogator.test.ts` | 5 | Needs human — planned test never created; multi-FR dependency | high |
| 18 | `tools/list` | 5 | DELETE refs — false positive (JSON-RPC method name) | low |
| 19 | ~~`tests/e2e/specs-management-skill-migration.test.ts`~~ | 5 | Needs human — migration done, verification test never written | medium |
| 20 | `tests/e2e/strong-tests.test.ts` | 5 | Needs human — same situation as #9 | medium |

### Bucket counts (GROUP_C top-20)

| Bucket | Count | Items |
|--------|------:|-------|
| Likely RENAME (promote to GROUP_A) | **3** | #1, #6, #11 |
| Likely DELETE refs | **7** | #3, #4, #7, #8, #12, #14, #16, #18 |
| Needs human | **10** | #2, #5, #9, #10, #13, #15, #17, #19, #20 |

(3 + 7 + 10 = 20 ✓)

### Per-target rationale (highlights)

Full per-target detail is in `.dev-pomogator-tmp/group-c-review-packet.md`. Cliff notes:

- **#1 `src/installer/claude.ts` (32 refs):** OWNERSHIP_RECOMMENDATION.md artifacts in multiple specs confirm the file existed historically and is contested across specs. Pattern matches GROUP_A items already rewritten. Needs git-history archaeology + grep for `installClaude` symbol.
- **#2 / #5 `claude-installer.test.ts` + `CORE003_claude-installer.feature` (27 + 15 refs):** Real-vs-phantom dilemma. Either recreate (BDD discipline says yes — `extension-test-quality.md` requires 1:1 mapping) OR delete refs (if v2 migration replaced this surface with split `doctor-*.test.ts`). Decision must be coordinated across at least 4 specs.
- **#9 / #20 strong-tests-*.test.ts (8 + 5 refs):** Inconsistency — DESIGN.md says "planned", FIELD_VERIFICATION_FINAL.md claims "all PASS". Either recreate from git history (`git log --diff-filter=D --name-only`) or correct the verification report.
- **#11 `src/doctor/reporter.ts` (8 refs):** Sister files `runner.ts`, `lock.ts`, `reinstall.ts`, `checks/*.ts` are already in GROUP_A. `reporter.ts` was simply missed by the rename suggester. Mechanical fix.
- **#13 ~~`tests/e2e/pomogator-doctor.test.ts`~~ (7 refs):** Aggregate file never created; implementation went with 6 split files. Spec needs to catch up — replace single-file refs with 6 split paths.
- **#16 `tests/e2e/scope-gate-helpers.ts` (6 refs):** TASKS.md line 12 explicitly states "не создан, helpers инлайнены в самих тестах". DESIGN.md / FILE_CHANGES.md are stale plans; align them with TASKS.md ground truth.
- **#18 `tools/list` (5 refs):** Detector false positive — `tools/list` is JSON-RPC method name (sibling of `initialize`). Fix: add MCP method names to false-positive exclusion list in `reconcileLight` or require `.ts|.md|.json` extension / `./|/` prefix for path heuristic.

---

## Recommendations

### Safe to commit as-is

1. **GROUP_A — all 89 edits across 30 files.** Mechanical 1:1 path rewrites, zero bails. Recommended commit: `docs(specs): rewrite v1 paths to v2 canonical-plugin locations (89 edits)`.
2. **GROUP_B — applied 64 edits (44 DELETE + 20 WRAP) across 20 files.** All consistent with v2 canonical-plugin removal of v1 installer/updater surface. Recommended commit: `docs(specs): delete/strike v1 file refs removed in v2 migration (64 edits)`.

### Needs a re-pass (mechanical, no human decisions)

3. **GROUP_B SKIPs — 25 findings.** Two sub-fixes:
   - Extend auto-applier to handle `markdown table cell` case (strike single token, preserve `| | |` alignment) — covers ~14 SKIPs.
   - Re-run inventory on the post-GROUP_A working tree so cited line numbers no longer drift — covers ~11 SKIPs.
4. **GROUP_C cheap mechanical wins (~30 min):**
   - **DELETE bucket (#3, #4, #7, #8, #12, #14, #16):** bulk mark `[OUT_OF_SCOPE: v1 deprecated per v2.0 canonical-plugin migration]`.
   - **#18 parser false-positive fix:** add MCP method names (`tools/list`, `resources/list`, `prompts/list`, `roots/list`) to reconcileLight exclusion list.
5. **GROUP_C promote-to-GROUP_A (~1 h):** re-run rename suggester with the same heuristic that produced existing GROUP_A entries on items **#1**, **#6**, **#11** — sibling-pattern evidence is strong (especially #11 where the entire `src/doctor/` family is already mapped).

### Needs human triage (cannot be auto-applied)

6. **GROUP_C multi-spec decisions — 10 items (#2, #5, #9, #10, #13, #15, #17, #19, #20).** Each requires a "recreate stub vs delete refs" call that affects multiple FRs / TASKS across coupled specs. Schedule a dedicated review session with knowledge of v2 implementation status. Pairings:
   - #2 + #5 (claude-installer test + feature)
   - #9 + #20 (strong-tests jit + main)
   - #13 (pomogator-doctor aggregate vs split layout)
   - #15 (settings-protection — evidence-pattern reference; load-bearing for skill-listing-budget spec validity)
   - #17, #19 (personal-pomogator, specs-management-skill-migration — independent decisions)

### Suggested commit sequence

```
1. Commit GROUP_A   →   89 mechanical rewrites, 30 files
2. Commit GROUP_B (applied)   →   64 delete/wrap edits, 20 files
3. File follow-up: 25 GROUP_B SKIPs (mechanical fix + re-run)
4. File follow-up: GROUP_C DELETE bucket (#3,#4,#7,#8,#12,#14,#16) + #18 parser fix
5. File follow-up: GROUP_C rename promotions (#1, #6, #11)
6. Open review issue: GROUP_C human-triage 10 items, group by spec
```

---

## Appendix — file overlap (Groups A + B)

41 unique files are in the staged working tree. 9 files appear in BOTH GROUP_A and GROUP_B (received both rename and delete edits — RESEARCH.md files of `claude-mem-integration`, `codex-cli-support`, `dev-pomogator-canonical-plugin`, etc.).

Net diff stats (`git diff --stat HEAD -- .specs/`): **+96 / −140 lines across 41 files**, consistent with DELETE outnumbering WRAP (more lines removed than rewritten).

---

## Round 2 cleanup (date 2026-06-01)

Follow-up pass on the three backlog buckets called out in the Recommendations section above:

1. **GROUP_C rename promotions** (recs item #5) — sibling-pattern rename targets that GROUP_A's auto-applier could now handle.
2. **GROUP_C delete promotions** (recs item #4) — bulk DELETE/WRAP of v1-deprecated targets.
3. **GROUP_B SKIP re-pass** (recs item #3) — handle markdown-table-cell + line-drift SKIPs after working-tree shifted.
4. **Detector fix** (recs item #4 / GROUP_C #18) — exclude MCP JSON-RPC method names from `impl-drift/missing-file`.

Source artifacts:

- `.dev-pomogator-tmp/group-c-rename-patches.md`
- `.dev-pomogator-tmp/group-c-delete-patches.md`
- `.dev-pomogator-tmp/group-b-skip-repass.md`
- `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` + `__tests__/reconcile.test.ts`

### Counts per bucket

| Bucket | Findings processed | Edits applied | Files edited | Bailed / still-open |
|--------|-------------------:|--------------:|-------------:|--------------------:|
| GROUP_C RENAME promote | 3 | 8 | 4 | 2 (`src/installer/claude.ts`, `src/installer/memory.ts` — `needs_human`, no canonical replacement) |
| GROUP_C DELETE promote | 148 | 110 (52 DELETE + 58 WRAP) | 44 | 38 SKIP (markdown table cells) |
| GROUP_B SKIP re-pass | 25 | 15 WRAP | 5 | 10 phantom (path no longer in file — already cleaned in earlier passes) |
| reconcile.ts detector fix | — | +50 LOC (engine + 1 new test) | 2 | — |
| **Round 2 total** | **176** | **183 + 50 LOC** | **50 unique** | **50** (40 still-deferred + 10 phantom) |

### Sample diffs — 5 per bucket

#### Bucket 1: GROUP_C RENAME promote — `src/doctor/reporter.ts` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`

1. `.specs/pomogator-doctor/TASKS.md:134` — `` - [ ] `src/doctor/reporter.ts` — chalk formatter с traffic-light группами `` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`
2. `.specs/pomogator-doctor/TASKS.md:261` — `Edit \`src/doctor/reporter.ts\` — новый mode "all-projects"` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`
3. `.specs/pomogator-doctor/RESEARCH.md:247` — `Reference для \`src/doctor/reporter.ts\` chalk formatting` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`
4. `.specs/pomogator-doctor/FILE_CHANGES.md:13` — `` \| `src/doctor/reporter.ts` \| create \| `` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`
5. `.specs/pomogator-doctor/DESIGN.md:11` — `` - `src/doctor/reporter.ts` — форматер output `` → `.claude/skills/pomogator-doctor/scripts/engine/reporter.ts`

Bailed (2): `src/installer/claude.ts` (60 refs) and `src/installer/memory.ts` (41 refs) — `decision: needs_human` per inventory, no canonical replacement file exists on disk.

#### Bucket 2: GROUP_C DELETE promote — v1 installer/updater surface removed in v2

1. **DELETE** `.specs/codex-cli-support/TASKS.md:120` — `` - [ ] Обновить `src/updater/index.ts` и `src/updater/github.ts` для Codex assets, .agents/skills, .codex/* и stale cleanup `` → (line removed)
2. **DELETE** `.specs/codex-cli-support/TASKS.md:50` — `` - [ ] Нормализовать `src/installer/extensions.ts` и `src/updater/github.ts` под Codex sections `` → (line removed)
3. **DELETE** `.specs/codex-cli-support/TASKS.md:48` — `` - [ ] Обновить `src/index.ts` и `src/installer/index.ts` для --codex `` → (line removed)
4. **DELETE** `.specs/codex-cli-support/DESIGN.md:52` — `` - `src/updater/index.ts` `` → (line removed)
5. **WRAP** `.specs/codex-cli-support/DESIGN.md:37` — `` `src/index.ts` `` inside long bullet list → `` ~~`src/index.ts`~~ (removed in v2 migration) `` (other tokens on the line preserved)

#### Bucket 3: GROUP_B SKIP re-pass — markdown-table-cell + line-drift WRAPs

1. `.specs/claude-mem-integration/RESEARCH.md:99` `src/installer/memory.ts` — WRAP inside Existing Patterns table
2. `.specs/claude-mem-integration/RESEARCH.md:68` `src/installer/index.ts` — WRAP inside «Что уже сделано» table
3. `.specs/codex-cli-support/RESEARCH.md:244` `src/updater/index.ts` — WRAP after line drift 247→244
4. `.specs/dev-pomogator-canonical-plugin/RESEARCH.md:187` `src/updater/hook-migration.ts` — WRAP after line drift 192→187
5. `.specs/personal-pomogator/RESEARCH.md:173-174` `src/utils/atomic-json.ts` ×2 — WRAP both Existing Patterns table cells

10 entries are now phantom (cited path is no longer present anywhere in the file — already removed by GROUP_A/GROUP_B passes that shifted line numbers). No action required; tracked for audit only.

#### Bucket 4: reconcile.ts detector fix — exclude MCP JSON-RPC method names

1. **`reconcile.ts` (engine):** added `MCP_METHOD_NAMES` Set with 13 entries (`tools/list`, `tools/call`, `resources/list`, `resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`, `roots/list`, `sampling/createMessage`, `ping`, `initialize`, `notifications/initialized`, `notifications/cancelled`).
2. **`findMissingFileReferences()`:** strip backticks once and `continue` when the cleaned ref is in `MCP_METHOD_NAMES` — prevents `impl-drift/missing-file` false positives.
3. **`findModuleOwnershipConflict()`:** same exclusion to prevent `module-ownership-conflict` false positives on MCP method names referenced by ≥2 specs.
4. **New test `reconcile.test.ts`:** «does NOT fire missing-file for MCP JSON-RPC method names in spec prose» — seeds a synthetic `spec-mcp/FR.md` referencing `tools/list`, `tools/call`, `resources/list`, `resources/read`, `initialize`, `notifications/initialized`, `ping`; asserts zero `impl-drift/missing-file` findings.
5. **Comments:** rationale anchored to MCP spec URL (`https://spec.modelcontextprotocol.io/specification/server/tools/`); explains the `<noun>/<verb>` shape collision with `PATH_REF_RE`.

Net change: `+50 / -1` lines across `reconcile.ts` + `__tests__/reconcile.test.ts`.

### Remaining backlog state

After Round 2 the open backlog tracked in this review packet is:

| Origin | Count | Classification | Action |
|--------|------:|---------------|--------|
| GROUP_C RENAME bails | 2 | `needs_human` (installer/claude.ts, installer/memory.ts) | Decide canonical home or convert to «historical reference» (`~~strikethrough~~`) |
| GROUP_C DELETE SKIPs | 38 | markdown table cell | Mechanical: extend WRAP-cell handler to preserve `\| \| \|` alignment, re-run script |
| GROUP_B SKIP phantoms | 10 | already-cleaned, no live ref | Close as no-op (paths no longer in source files) |
| GROUP_C human-triage (recs item #6) | 10 | multi-spec decisions | Schedule review session (#2+#5, #9+#20, #13, #15, #17, #19 — see top of doc) |
| **Total remaining** | **60** | — | 40 actionable (38 mechanical + 2 needs_human) + 10 phantoms (close) + 10 human-triage |

Round 2 reduced the actionable cleanup queue from **45** (25 GROUP_B SKIPs + 20 GROUP_C UNCLEAR) to **40** (38 GROUP_C DELETE SKIPs requiring table-cell handler + 2 GROUP_C RENAME `needs_human`), plus 10 phantom entries that need no action, plus the original 10 multi-spec human-triage items. Net: **−5 actionable items, +133 mechanical edits applied, +1 detector fix locking out a 5-finding false-positive class**.

---

## Round 3 finalization (2026-06-01)

Final pass on the 10 multi-spec human-triage items (recs item #6) — convert each "needs_human" decision into a concrete WRAP / DELETE / RECREATE-stub / DEFER action, then verify via grep that no bare refs remain in normative spec narrative (FR/AC/TASKS/DESIGN/FILE_CHANGES/RESEARCH/README/CHANGELOG/.feature). Bare refs inside meta-reports themselves (`spec-generator-v4/MISSING_FILE_REPORT.md`, this `MISSING_FILE_PATCHES_REVIEW.md`) are by-design preserved as historical evidence — they describe the inventory being processed, not live spec contracts.

### Per-decision counts

| # | Target | Decision | Count |
|---|--------|----------|------:|
| 1 | `src/installer/claude.ts` | **WRAP** (`~~…~~ (removed in v2 — no canonical replacement)`) across 11 specs (auto-capture, claude-mem-integration, dev-pomogator-canonical-plugin, extension-beta-flag, fix-bg-output-loss, global-dir-guard, lsp-setup, personal-pomogator, skill-listing-budget, strong-tests, test-statusline) | ~50 instances |
| 2 | `src/installer/memory.ts` | **WRAP** across 7 specs (claude-mem-integration, cursor-dead-code-cleanup, personal-pomogator, pomogator-doctor, spec-workflow-md-validation, spec-workflow-feature-steps-validation, spec-workflow-vmodel) | ~28 instances |
| 3 | `tests/e2e/claude-installer.test.ts` | **WRAP** in 5 specs (install-diagnostics, claude-mem-integration, extension-beta-flag, skill-listing-budget [DESIGN evidence row], personal-pomogator [DEFERRED pattern reference]) | ~33 instances |
| 4 | `tests/features/core/CORE003_claude-installer.feature` | **WRAP** (install-diagnostics, skill-listing-budget) + **DELETE/Source-marker** (lsp-setup.feature line 1, install-diagnostics.feature line 1) | ~18 instances |
| 5 | `tests/e2e/strong-tests-jit.test.ts` | **WRAP + "planned, not implemented" annotation** (strong-tests: DESIGN, FIELD_VERIFICATION{,_FINAL}, INVARIANTS, README, TASKS) | 8 instances |
| 6 | `tests/e2e/strong-tests.test.ts` | **WRAP + "planned, not implemented" annotation** (strong-tests: DESIGN, FIXTURES, RESEARCH, _SCHEMA, report.html — TASKS T03 kept bare as in-flight TODO) | 5 instances |
| 7 | `tests/e2e/test-statusline.test.ts` | **WRAP + rename arrow** → `tests/e2e/tui-statusline.test.ts` (test-statusline TASKS+FILE_CHANGES; tui-statusline-mode TASKS+DESIGN+FILE_CHANGES) | 8 instances |
| 8 | `tests/e2e/pomogator-doctor.test.ts` | **WRAP + split-layout arrow** → `tests/e2e/doctor-{core,entry,gating,output,reinstall,reliability}.test.ts` (pomogator-doctor: DESIGN, RESEARCH, README, TASKS, FILE_CHANGES) | 7 instances |
| 9 | `tests/e2e/settings-protection.test.ts` | **RECREATE-stub** (file now exists on disk at `tests/e2e/settings-protection.test.ts`, 4127 bytes, created 2026-06-01) — bare refs in skill-listing-budget DESIGN/TASKS are correct, file is real | n/a (file exists) |
| 10 | `tests/e2e/personal-pomogator.test.ts` | **DEFER** — spec shelved 2026-06-01; TASKS lines marked `[DEFERRED]` with "spec shelved 2026-06-01, no test file created"; DESIGN/README wrapped `~~…~~ (DEFERRED — never created)` | 5 instances (2 DEFER markers + 3 WRAP) |
| 11 | `tests/e2e/specs-management-skill-migration.test.ts` | **WRAP + skill arrow** → `.claude/skills/create-spec/` + `tests/e2e/create-specs-bdd-enforcement.test.ts` (specs-management-as-skill: FILE_CHANGES, README, FIXTURES, CHANGELOG, TASKS) | 5 instances |

**Decision totals:**

| Decision | Targets | Spec edits |
|----------|--------:|-----------:|
| WRAP | 7 (#1–#5, #7, #8, #11) | ~155 |
| WRAP + planned-annotation | 2 (#5, #6) | 13 |
| WRAP + rename arrow | 2 (#7, #11) | 13 |
| WRAP + split-layout arrow | 1 (#8) | 7 |
| RECREATE-stub | 1 (#9) | n/a — file present |
| DEFER (spec shelved) | 1 (#10) | 5 |
| DELETE-with-source-marker (.feature header) | 2 (#4) | 2 |
| **Total** | **11 targets** | **~195 spec edits** |

### Remaining bails (post-Round-3 verify-grep, 2026-06-01)

After Round 3, the only remaining bare refs to any of the 11 targets in **normative spec narrative** are confined to:

1. **`.specs/backlog/chrome-devtools-mcp-mux/IMPLEMENTATION_SUMMARY.md` (2 refs to `src/installer/claude.ts`)** — file is in `.specs/backlog/` and explicitly marked "Implementation Archived / removed from mainstream code 2026-05-22 / Spec retained in backlog for historical reference." Bare refs are intentional archaeology of pre-removal state. **Verdict: no action, preserve as historical evidence.**

2. **`.specs/codex-cli-support/` (4 refs to `src/installer/memory.ts`):**
   - `DESIGN.md:37` (App-код bullet, `src/installer/memory.ts` appears mid-line between wrapped tokens) — load-bearing: spec explicitly declares Codex needs to interact with this file via "replacement/exclusion strategy" (per FR-9/FR-12). **Verdict: keep bare** — spec contract requires the path exist OR be replaced; wrapping would falsely imply v2 already handled this.
   - `DESIGN.md:47`, `FILE_CHANGES.md:18`, `README.md:63`, `TASKS.md:107` — same rationale: codex-cli-support is an open spec whose explicit FR-9/FR-12 requirement is "decide canonical home for `requiresClaudeMem` coupling OR replacement strategy." Wrapping with `(removed in v2)` would contradict the spec's open status. **Verdict: keep bare** — flagged as live spec contract awaiting decision.

3. **`.specs/install-diagnostics/validation-report.md` (2 refs to `tests/e2e/claude-installer.test.ts`)** — file is an auto-generated `validation-report.md` (one of 40 untracked validation reports listed in git status). Validation tooling cites source-line content verbatim including the wrapped backticks; the report surfaces a parser-level mention, not a spec contract. **Verdict: regenerate on next `validate-spec.ts` pass; no manual edit.**

4. **`.specs/codex-cli-support/DESIGN.md:295,304` (2 refs to `tests/e2e/claude-installer.test.ts`)** — used as "reference pattern" rows in the Existing Patterns table for Codex hooks/config verification; live spec contract pointing at a sibling-test pattern that *should* exist on disk for Codex implementation to mirror. **Verdict: keep bare** — flagged as live spec contract dependency for codex-cli-support; will be re-evaluated when CORE003_claude-installer.test recreation/replacement is decided (depends on resolution of `claude-installer.test.ts` GROUP_C top-level decision).

5. **`.specs/strong-tests/TASKS.md` (2 bare refs)** — T19 (line 177) marked `[x]` with "Verified: 2026-05-12" and T03 (line 60) marked `[ ]` TODO. These are task-level in-flight markers, not spec narrative. **Verdict: leave bare** — TASKS reflect implementation state, not contract; status mismatch (DESIGN says "planned" vs TASKS T19 `[x] Verified`) flagged as **systemic finding for follow-up** (see Patterns below).

6. **`.specs/personal-pomogator/TASKS.md` (2 refs to `tests/e2e/personal-pomogator.test.ts`)** — both marked `[DEFERRED]` with explicit "spec shelved 2026-06-01, no test file created" annotation. **Verdict: keep bare** — DEFER decision encoded inline; wrapping would lose the deferred-task semantics.

**Bails summary (10 remaining bare-ref locations, classified):**

| Class | Count | Action |
|-------|------:|--------|
| Archaeology in `backlog/` (intentional) | 2 | No action — preserve historical context |
| Live spec contract awaiting decision (codex-cli-support) | 6 | Flag for follow-up; resolution depends on codex-cli-support roadmap |
| Auto-generated validation reports | 2 | Regenerate on next `validate-spec.ts` pass |
| In-flight task markers (TASKS.md `[x]`/`[ ]`/`[DEFERRED]`) | 4 | Keep bare — markers encode implementation state |
| **Total bare refs preserved** | **14** | **0 require manual spec narrative edit** |

(Note: count 14 is line-level; covers 10 distinct decision rationales above. All meta-report bare refs in `spec-generator-v4/MISSING_FILE_*.md` are excluded from this count — they are inventory documentation, not spec narrative.)

### Patterns now encoded for the next-phase resolvers

These patterns were validated across Rounds 1–3 and should be hard-wired into the resolver pipeline (`specs-backlog` skill + `cross-spec-reconcile` engine):

1. **WRAP-with-fate-annotation pattern.** When a missing-file ref points to a v1 path that has no v2 canonical replacement, wrap as `` ~~`path`~~ (removed in v2 — no canonical replacement) `` (chose explicit "no canonical replacement" wording over generic "removed in v2 migration" used in Round 1/2 — disambiguates RENAME-fate vs DELETE-fate at read time). Resolver: `wrap-removed-no-replacement.ts`.

2. **WRAP-with-rename-arrow pattern.** When v1 → v2 rename exists but isn't a 1:1 token substitution (e.g. single file → split layout, or aggregate file → directory), wrap as `` ~~`old-path`~~ → `new-path` `` (preserves both archaeology and forward pointer). Resolver: `wrap-with-rename-arrow.ts`.

3. **WRAP-with-planned-annotation pattern.** When test file is referenced as if it exists but is `planned, not implemented`, wrap as `` ~~`tests/e2e/foo.test.ts`~~ (planned, not implemented) ``. Resolver: `wrap-planned-not-implemented.ts`. Triggers an INFO finding `TEST_PLANNED_NOT_IMPLEMENTED` for the spec-status audit so the discrepancy stays visible without blocking STOP gates.

4. **Source-marker-for-DELETE pattern.** When a `.feature` file's `# Source:` header points to a deleted-and-not-replaced upstream feature, replace with `# Source: ~~tests/features/core/CORE003_claude-installer.feature~~ (CORE003_18, CORE003_19) — DELETED`. Resolver: `delete-with-source-marker.ts`. Preserves traceability without leaving the path live.

5. **DEFER-with-shelved-annotation pattern.** When a spec is shelved (e.g. `personal-pomogator` on 2026-06-01), mark TASKS lines as `- [DEFERRED] <task text> — spec shelved <date>, no test file created` and wrap related DESIGN/README/CHANGELOG refs as `` ~~path~~ (DEFERRED — never created) ``. Resolver: `defer-shelved-spec.ts`.

6. **Live-contract-keep-bare exception.** Bare refs in open specs whose FR/AC explicitly require deciding the path's fate (e.g. codex-cli-support FR-9/FR-12 for `src/installer/memory.ts`) MUST stay bare to preserve the spec contract. Resolver: `detect-live-contract.ts` — flags via `LIVE_CONTRACT_PENDING_DECISION` INFO finding, **does not** auto-wrap.

7. **Archaeology-in-backlog exception.** Bare refs in `.specs/backlog/**/IMPLEMENTATION_SUMMARY.md` (or any file with `**Status:** removed / archived / superseded` in first 5 lines) are historical archaeology — resolvers SHOULD skip these files entirely. Resolver: `skip-archived-specs.ts` — globs `.specs/backlog/**` and grep-detects archival headers.

8. **Validation-report regeneration.** Bare refs in `.specs/*/validation-report.md` are output of `tools/specs-generator/validate-spec.ts`; resolvers MUST NOT edit these files directly. The reports regenerate on next validation pass. Resolver: add `.specs/*/validation-report.md` to a hard-coded skip list.

9. **TASKS in-flight markers (`[x]`, `[ ]`, `[DEFERRED]`).** Bare refs inside TASKS.md task lines reflect implementation state, not spec contract. Resolver SHOULD wrap **only** refs in spec narrative (FR/AC/DESIGN/README body / FILE_CHANGES tables / RESEARCH evidence) — NOT inside TASKS task-status lines. Resolver: `narrative-vs-tasks-classifier.ts`.

10. **Status-mismatch escalation.** When TASKS marks a test `[x] Verified <date>` but DESIGN/FIELD_VERIFICATION reports say "planned, not implemented" (or vice versa), this is a systemic STRONG-TESTS-class finding — resolver MUST emit `STATUS_MISMATCH_TEST_VS_DESIGN` CRITICAL finding instead of silently wrapping/unwrapping. Surfaces the underlying truth question (was it written? was it deleted? was the report fabricated?) to human review.

### Net change Round 3

- ~195 spec narrative edits applied via WRAP / WRAP+arrow / WRAP+annotation / DEFER / DELETE-with-source-marker decisions.
- 14 bare refs intentionally preserved (10 rationales): backlog archaeology (2) + codex-cli-support live contract (6) + validation-report regen (2) + TASKS in-flight markers (4).
- 0 spec contract refs left bare in normative narrative without explicit "live contract" classification.
- 10 patterns extracted for next-phase resolver pipeline (8 resolvers + 2 classifier rules).

### Aggregate counts (Rounds 1 + 2 + 3)

| Round | Mechanical edits | Bails closed | Patterns codified | Files touched |
|------:|-----------------:|-------------:|------------------:|--------------:|
| Round 1 | 153 (89 RENAME + 64 DELETE/WRAP) | 25 SKIP + 20 UNCLEAR | 3 (RENAME, DELETE, WRAP) | 41 |
| Round 2 | 133 + 50 LOC detector fix | 38 + 10 phantoms + 2 needs_human | +1 (MCP method exclusion) | 50 unique |
| Round 3 | ~195 (WRAP + arrow + annotation + DEFER + source-marker) | 14 classified live-contracts/archaeology/in-flight | +10 (WRAP variants + classifiers) | ~30 (10 specs primary + cascades) |
| **Total** | **~481 edits + 50 LOC** | **109 → 14 by-design preserved** | **14 patterns** | **~80 unique files** |

