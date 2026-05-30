---
name: spec-backlog
description: |
  Drives the `dev-pomogator-spec-backlog` CLI to triage cross-spec-reconcile
  findings and dispatch specialist resolver agents at scale. Replaces the
  "3,878 AskUserQuestion calls" problem with a triage-and-batch pipeline:

    finding → classifier (AUTO_FIX / BACKLOG / NOISE)
            → backlog entry (.dev-pomogator/.specs-backlog/<DATE>.jsonl)
            → specialist resolver (ac-author / scenario-writer / fr-author /
                                   decision-arbiter / owner-picker / link-fixer)
            → produces .md skeleton OR recommendation file in the spec dir
            → entry marked resolved

  Use this skill when the user asks to: "посмотри что в беклоге",
  "почини спеки", "запусти fixer", "ingest findings", "resolve missing
  ACs", or any phrasing about cleaning up cross-spec-reconcile findings
  in bulk.

allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

# spec-backlog

Operates `dev-pomogator-spec-backlog` — the CLI that triages
cross-spec-reconcile findings into a per-day JSONL log and dispatches
specialist resolver agents to fix them.

## When to invoke

- User says: "посмотри backlog", "почини спеки", "обработай находки",
  "запусти resolver", "ingest dogfood".
- After a fresh dogfood run / detector change (new findings to triage).
- When user wants to clean up a specific spec ("почини
  spec-workflow-vmodel").
- When user asks to enumerate what kind of issues are open in the repo.

## When NOT to invoke

- Single-spec edits ("исправь FR-3 в auth-spec") — use direct Edit.
- Detector tuning ("это false positive") — edit
  `tools/spec-backlog/classifier.ts` or
  `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` directly.
- One-off cross-spec verification — use `Skill("cross-spec-resolve")`
  for the interactive walker (one finding at a time).

## The CLI

```bash
dev-pomogator-spec-backlog <subcommand> [flags]
```

Subcommands:

| Subcommand | Purpose |
|------------|---------|
| `ingest` | Run reconcile, classify every finding, append BACKLOG entries to today's JSONL (deduped by `entryId`). Print AUTO_FIX/NOISE/BACKLOG counts. |
| `list` | Print open entries grouped by category. Flags: `--all`, `--category <X>`, `--slug <Y>`, `--resolvers`. |
| `resolve <id>` | Run the entry's suggested_resolver, mark status. |
| `resolve --category <X> [--slug <Y>]` | Bulk resolve every open entry in category. Stops on first failure. |

## The 6 resolvers

Run `dev-pomogator-spec-backlog list --resolvers` for the live list. As
of v4.0.0:

| Resolver | Category it handles | What it produces |
|----------|---------------------|------------------|
| `ac-author` | `missing-spec-file` | `<slug>/ACCEPTANCE_CRITERIA.md` skeleton (one AC per FR-N, EARS WHEN/THEN placeholders) |
| `link-fixer` | `dead-link-typo` | Rewrites `[label](broken)` to `[label](correct)` via basename glob (bails on ambiguous) |
| `scenario-writer` | `missing-test` | Appends `@featureN Scenario` block to `<slug>/<slug>.feature` |
| `fr-author` | `missing-fr-section` | Appends `## FR-N: [TBD]` to `<slug>/FR.md` with citation context |
| `decision-arbiter` | `contradictory-nfr` | Writes `<slug>/DECISION_RECOMMENDATION.md` with code-frequency ground truth |
| `owner-picker` | `ownership-conflict` | Writes `<slug>/OWNERSHIP_RECOMMENDATION.md` via `git log` proximity |

All resolvers are **idempotent** — re-running on already-resolved state
bails with `already-exists`/`already-defined`/`already-covered` etc.

## Standard workflow

Always run this exact sequence:

1. **Ingest** — populate the backlog from current detector state:
   ```bash
   dev-pomogator-spec-backlog ingest
   ```
   Output shape: `Ingested N findings: AUTO_FIX (skipped): A, NOISE
   (skipped): N, BACKLOG (queued): B (X new entries, rest deduped)`.

2. **List** — survey open entries. Default lists everything grouped by
   category:
   ```bash
   dev-pomogator-spec-backlog list                       # all open
   dev-pomogator-spec-backlog list --slug <foo>          # one spec
   dev-pomogator-spec-backlog list --category dead-link-typo
   ```

3. **Resolve** — three modes:

   - **Single entry** (when picking one specific finding):
     ```bash
     dev-pomogator-spec-backlog resolve <12-char-id>
     ```
   - **Bulk by category** (sweep all dead-links, all missing-ACs, etc.):
     ```bash
     dev-pomogator-spec-backlog resolve --category dead-link-typo
     ```
   - **Bulk by category + slug** (sweep one spec's findings in one
     category):
     ```bash
     dev-pomogator-spec-backlog resolve --category missing-spec-file \
                                        --slug spec-workflow-vmodel
     ```

4. **Verify** — after resolving, re-run reconcile dogfood and confirm
   the resolved findings are gone:
   ```bash
   node --import tsx .dev-pomogator-tmp/dogfood.mjs | head -10
   ```

## Confidence + bail handling

Each resolver returns `ResolverResult { confidence: 0..1, files_changed,
notes, bailed_out? }`. Conventions:

- `confidence >= 0.8` → applied with high certainty; agent does not
  need to re-verify
- `0.5 <= confidence < 0.8` → applied but flag for human review in the
  final summary
- `confidence < 0.5` → resolver bailed; entry stays `open` for manual
  handling
- `bailed_out: { reason: 'already-exists' }` → idempotent skip; entry
  marked `resolved` since the target end-state is already correct

## Reporting back to user

After a bulk run, ALWAYS produce a summary in this shape:

```
## spec-backlog run summary

Ingested: N findings → A auto-fix / B backlog / C noise
Resolved: M entries (X applied, Y bailed-idempotent, Z bailed-error)
Files created/modified: <count> (list 5 most-recent paths)
Open entries remaining: K

### High-confidence applies (review optional)
- <slug>/<file>: <one-line summary>

### Manual review queue
- <id> <category> <slug>: <reason>
```

## Don't do

- **Don't** call individual resolvers programmatically — always go
  through the CLI so the JSONL log stays the single source of truth.
- **Don't** edit `.dev-pomogator/.specs-backlog/<DATE>.jsonl` by hand —
  the file is append-only with `latest-line-wins` semantics; manual
  edits break audit history.
- **Don't** resolve `ownership-conflict` or `contradictory-nfr` without
  showing the recommendation file content to the user FIRST — those
  produce *recommendation markdown*, not direct spec mutations, and the
  human still has to act on the advice.
- **Don't** assume `resolve --category` will fix all findings — many
  legitimately bail (ambiguous matches, missing source files, no code
  evidence). Always run `list --category X --all` after to confirm.

## Architecture

- CLI: `tools/spec-backlog/cli.ts` + `bin.cjs`
- Writer: `tools/spec-backlog/writer.ts` (append-only JSONL with
  deterministic `entryId(slug,code,evidence)` sha256 keys)
- Classifier: `tools/spec-backlog/classifier.ts` (routes findings to
  AUTO_FIX / BACKLOG / NOISE)
- Resolvers: `tools/spec-backlog/resolvers/<name>.ts` + `registry.ts`
- Storage: `.dev-pomogator/.specs-backlog/<YYYY-MM-DD>.jsonl`
- Design doc: `.specs/spec-generator-v4/BACKLOG_DESIGN.md`

## See also

- `.claude/skills/cross-spec-reconcile/SKILL.md` — the analyzer that
  produces findings (the input to this skill).
- `.claude/skills/cross-spec-resolve/SKILL.md` — interactive walker for
  one-finding-at-a-time handling (alternative to bulk pipeline).
- `.specs/spec-generator-v4/CHANGELOG.md` batch-12 + batch-13 — the
  shipping notes for the backlog mechanism and the 6 resolvers.
