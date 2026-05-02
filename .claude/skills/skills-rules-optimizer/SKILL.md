---
name: skills-rules-optimizer
description: >
  Optimizes .claude/rules/ AND .claude/skills/ — audit (token count, frontmatter
  validation, allowed-tools coverage, oversize cap), triple-axis Jaccard overlap
  detection between skills, LLM-driven merge synthesis through Claude Code
  sub-agent, ratchet (regression prevention) via independent scorer. Called
  automatically from suggest-rules Phase 6 after rule creation. Can also be
  invoked manually.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, mcp__context7__resolve-library-id, mcp__context7__query-docs
---

# Skills Rules Optimizer

## Mission

Optimize `.claude/rules/` AND `.claude/skills/` artifacts:

- **Rules side** (FR-9 backward compat): path-scoped YAML frontmatter, antipattern detection, merge small related files.
- **Skills side** (NEW, FR-1..FR-7): frontmatter validation per Anthropic spec, allowed-tools coverage, oversize cap, triple-axis Jaccard overlap detection, LLM-driven merge synthesis с ratchet regression prevention.

5-stage pipeline: **audit → detect → merge → ratchet → apply**.

## When to use

- **Automatically**: Called by `/suggest-rules` Phase 6 after rule creation (rules + skills audit)
- **Manually**: `audit.ts --dir .claude/rules` (rules-only) или `audit.ts --dir .claude/skills` (skills audit + overlap detection)
- **Merge workflow** (skills only, opt-in): `merge-skills.ts --execute <a> <b> --merged-name <name>`

## Stage 1: Audit

Dispatcher routes by `--dir` path:

```bash
# Rules audit (FR-9 verbatim, backward compat with previous rules-optimizer)
npx tsx .claude/skills/skills-rules-optimizer/scripts/audit.ts --dir .claude/rules --save audit_rules.json

# Skills audit (FR-1, FR-2, FR-3)
npx tsx .claude/skills/skills-rules-optimizer/scripts/audit.ts --dir .claude/skills --save audit_skills.json
```

**Skills audit detects:**
- `FRONTMATTER_NAME_FORBIDDEN_TOKEN` — name contains "anthropic" / "claude"
- `FRONTMATTER_NAME_TOO_LONG` — >64 chars
- `FRONTMATTER_NAME_INVALID_FORMAT` — not lowercase + hyphens
- `FRONTMATTER_DESCRIPTION_TOO_LONG` — >1024 chars
- `FRONTMATTER_ALLOWED_TOOLS_EMPTY` — missing/empty
- `ALLOWED_TOOLS_MISSING` — body invokes tools NOT declared in frontmatter
- `OVERSIZE` (warning) — SKILL.md >500 lines

## Stage 2: Detect overlaps (skills only)

```bash
npx tsx .claude/skills/skills-rules-optimizer/scripts/detect-overlap.ts --dir .claude/skills [--threshold 0.3]
```

Triple-axis Jaccard:
1. **trigger phrases** — quoted strings extracted from `description:` field
2. **section headings** — `## .+` patterns (excluding trivial: Mission/Steps/Output/etc.)
3. **functional keywords** — Mission line + Steps content tokens

Pair flagged if any axis ≥ threshold (default 0.3). Recommendation tier:
- ≥0.7 = `merge`
- ≥0.5 = `cross-reference`
- ≥0.3 = `reorganize`
- <0.3 = `keep separate`

## Stage 3: Merge synthesis (envelope pattern)

When user opts in для merge:

```bash
npx tsx .claude/skills/skills-rules-optimizer/scripts/merge-skills.ts \
  --execute <skill-a> <skill-b> --merged-name <name>
```

Script reads both SKILL.md, formats `MERGE_PROMPT` (template `references/merge-prompt-template.md`), emits JSON envelope to stdout:

```json
{
  "action": "invoke-agent",
  "subagent_type": "general-purpose",
  "prompt": "...",
  "continuation": "verify-merge.ts --merged <draft-path> --originals <a> <b>",
  "merged_path": "<dir>/<merged-name>/SKILL.md.draft"
}
```

**Main turn handles envelope:**

1. Parse stdout JSON
2. Call `Agent(subagent_type="general-purpose", prompt=envelope.prompt)`
3. Write Agent's response to `envelope.merged_path` (via Write tool, atomic temp+move per `atomic-config-save` rule)
4. Run continuation: `Bash(envelope.continuation)` → emits scorer envelope (Stage 4)

NO direct Anthropic SDK / API key dependency. Sub-agent invocation entirely через Claude Code Agent tool.

## Stage 4: Ratchet (regression prevention)

After Stage 3 draft written, `verify-merge.ts` emits scorer envelope:

```json
{
  "action": "invoke-agent",
  "subagent_type": "general-purpose",
  "prompt": "<SCORER_PROMPT с merged + originals>",
  "decision_handler": {
    "merged_path": "...",
    "originals": { "a": "...", "b": "..." },
    "force": false,
    "on_regression": "delete_draft_emit_report",
    "on_pass": "rename_draft_emit_cleanup",
    "cleanup_suggestions": ["rm -rf ...", "rm -rf ..."]
  }
}
```

**Main turn handles scorer envelope:**

1. Call `Agent(subagent_type="general-purpose", prompt=envelope.prompt)` — INDEPENDENT fresh-context sub-agent
2. Parse Agent's JSON response: `{regression, score_merged, score_originals, criteria, reasoning, shouldRevert}`
3. Apply decision per `decision_handler`:
   - **regression && !force** → delete `merged_path` (Bash `rm`), emit regression report с `reasoning`
   - **!regression OR force** → rename `<merged_path>` → `<dir>/SKILL.md` (drop `.draft` suffix), emit `cleanup_suggestions`

Scorer evaluates 4 criteria (per `references/ratchet-scoring.md`):
- **frontmatter_validity** — name/description/allowed-tools per Anthropic spec
- **allowed_tools_coverage** — body invocations declared
- **mission_preservation** — both originals' missions covered
- **trigger_phrase_preservation** — ≥80% original triggers retained

Regression если `score_merged < 0.9 × score_originals`.

## Stage 5: Apply / Cleanup

After Stage 4 pass:
- Final `<merged-name>/SKILL.md` exists (renamed from draft)
- Originals remain untouched on disk (FR-7 preserve)
- Output `cleanup_suggestions` array: manual `rm -rf` commands suggested как dim text

User reviews + executes manual cleanup when satisfied. **NEVER auto-delete originals** — protects against false-positive ratchet pass.

## Rules-side workflow (FR-9 verbatim)

For backward compatibility, when `--dir` matches `.claude/rules`:

1. **Step 1: Audit** — `audit.ts --dir .claude/rules --save audit_before.json`
2. **Step 2: Add path-scoped frontmatter** — for each file без `paths`, infer via `references/path-inference-table.md`
3. **Step 3: Fix antipatterns** — `check-antipatterns.ts --dir .claude/rules`, apply fixes per `references/known-antipatterns.md`
4. **Step 4: Merge small related files** — confirmed same-domain + overlapping paths only
5. **Step 5: Final report** — `audit.ts --dir .claude/rules --save audit_after.json`, then `report.ts --before audit_before.json --after audit_after.json`

Logic byte-identical to pre-rename `rules-optimizer` (FR-9, AC-8).

## Error Handling

- Envelope output not parsed → main turn must validate JSON before Agent call
- Agent returns invalid SKILL.md → ratchet (Stage 4) catches; revert by default
- Path traversal in `--merged-name` → script rejects with error
- Merged-name already exists → script refuses overwrite
- Atomic write failure → temp file cleanup, error reported

## References

- `references/merge-prompt-template.md` — MERGE_PROMPT template (substituted by merge-skills.ts)
- `references/ratchet-scoring.md` — SCORER_PROMPT template + 4 evaluation criteria
- `references/path-inference-table.md` — path glob inference for rules frontmatter
- `references/known-antipatterns.md` — rule antipatterns + fixes

## Research foundation

- `jkitchin/skillz` (LLM two-stage merge)
- `L-Qun/EvoClaude` (Jaccard pre-filter)
- `connorblack/skill-tools` (triple-axis detection)
- `alchaincyf/darwin-skill` (ratchet regression prevention pattern)
- `shinytoyrobots/claude-skills-linter` (token-cost ranking)
- CASCADE paper (arxiv:2512.23880, Berkeley) — academic foundation
