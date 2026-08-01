# Functional Requirements (FR)

## FR-1: Audit skills directory

System SHALL scan `.claude/skills/*/SKILL.md` files и emit JSON output: `{ totalSkills, withErrors[], withWarnings[], overlaps[], details[] }`. Each entry — token count, line count, frontmatter parsed object.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path)

## FR-2: Frontmatter validation per Anthropic spec

System SHALL validate skill frontmatter:
- `name` — ≤64 chars, lowercase + hyphens, no "anthropic"/"claude"
- `description` — ≤1024 chars, third-person form ("processes X" не "I help with X")
- `allowed-tools` — non-empty list

Violations emit `withErrors[]` entries.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path), [UC-4](USE_CASES.md#uc-4-bulk-pre-commit-audit-gate)

## FR-3: Allowed-tools coverage check

System SHALL parse SKILL.md body для tool invocations (regex matchers: `\bBash\b`, `\bEdit\b`, `\bWrite\b`, `\bRead\b`, `Skill\(`, `Agent\(`, `WebFetch`, `WebSearch`, `mcp__\w+`) и сравнить с frontmatter `allowed-tools` list. Tools used в body но не declared в frontmatter → emit error finding.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path)

## FR-4: Triple-axis overlap detection

System SHALL compute pairwise Jaccard similarity на 3 axes:
1. **Trigger phrases** — quoted strings extracted из `description:` (regex `/"([^"]+)"/g`)
2. **Section headings** — `## .+` patterns в SKILL.md body
3. **Functional keywords** — Mission line + first-line tokens из Steps section

Pair flagged как overlap candidate если any axis Jaccard ≥ 0.3.

Output: `overlaps[]` с entries `{a, b, axis: "trigger"|"sections"|"functional", similarity, recommendation: "merge"|"cross-reference"|"reorganize"|"keep separate"}`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path), [UC-2](USE_CASES.md#uc-2-detect-then-merge-workflow)

## FR-5: LLM merge synthesis через sub-agent

System SHALL accept `merge-skills.ts --execute <skill-a> <skill-b> --merged-name <name>` invocation. Script reads оба SKILL.md, формирует prompt из template `references/merge-prompt-template.md` (MERGE_PROMPT verbatim из jkitchin/skillz), и emits JSON envelope в stdout:

```json
{
  "action": "invoke-agent",
  "subagent_type": "general-purpose",
  "prompt": "...",
  "continuation": "verify-merge.ts --merged <merged-path> --originals <a> <b>"
}
```

SKILL.md workflow yields control: main turn parses envelope → calls `Agent(subagent_type, prompt)` tool → writes Agent output к `.claude/skills/<merged-name>/SKILL.md` → invokes continuation script. NO direct Anthropic SDK / API key dependency.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-2](USE_CASES.md#uc-2-detect-then-merge-workflow), [UC-3](USE_CASES.md#uc-3-edge-merge-agent-returns-malformed-skillmd)

## FR-6: Ratchet scorer (regression prevention)

System SHALL invoke independent scorer sub-agent через envelope pattern для evaluation merged skill против originals. Scorer prompt evaluates 4 criteria:
1. Frontmatter validity (per FR-2)
2. Allowed-tools coverage (per FR-3)
3. Mission preservation (does merged cover оба originals' missions?)
4. Trigger phrase preservation (sufficient subset)

Output: `{regression: bool, score_merged: number, score_originals: number, reasoning: string, shouldRevert: bool}`.

If `regression=true` AND no `--force` flag → main turn deletes merged file и emit regression report. User может re-run с `--force` для override.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-2](USE_CASES.md#uc-2-detect-then-merge-workflow), [UC-3](USE_CASES.md#uc-3-edge-merge-agent-returns-malformed-skillmd)

## FR-7: Preserve originals (no auto-delete)

System SHALL NEVER auto-delete original skill directories при successful merge. Output SHALL include cleanup suggestion как dim text (stderr или separate `cleanup_suggestions[]` field):

```
# Cleanup (manual review required):
rm -rf .claude/skills/<skill-a> .claude/skills/<skill-b>
```

Originals remain on disk до явного `rm` command юзера.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-2](USE_CASES.md#uc-2-detect-then-merge-workflow)

## FR-8: Unified scoring engine для rules + skills

System SHALL provide common `Asset` interface (`type: "rule" | "skill"`) и shared helpers в `shared.ts`:
- `parseFrontmatterFlexible()` — single parser для rule (`paths:`) и skill (`name`, `description`, `allowed-tools`) frontmatter
- `estimateTokens()`, `computeSha256()`, `collectMdFiles()` — generic, переиспользуются

Asset-specific logic (rule antipatterns vs skill antipatterns) — separate functions, но через shared types.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path), [UC-6](USE_CASES.md#uc-6-edge-suggest-rules-backwards-compat)

## FR-9: Backward compatibility для rules-side

System SHALL preserve current `rules-optimizer` API surface unchanged:
- `audit.ts --dir .claude/rules --save <file>` — bit-identical output как до renaming
- `check-antipatterns.ts --dir .claude/rules` — bit-identical detection и fix logic
- `report.ts --before <a> --after <b>` — bit-identical comparison output

`/suggest-rules` Phase 6 invocations SHALL work без modifications кроме path updates (`rules-optimizer/scripts/...` → `skills-rules-optimizer/scripts/...`).

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-9)
**Use Case:** [UC-6](USE_CASES.md#uc-6-edge-suggest-rules-backwards-compat)

## FR-10: Embedding-based semantic merge — OUT OF SCOPE

**Связанные AC:** [AC-10 stub](ACCEPTANCE_CRITERIA.md#out-of-scope-fr-10-deferred-to-v020) (FR помечен OUT OF SCOPE)

> OUT OF SCOPE — оптимизация Jaccard через `text-embedding-3` cosine distance. Текущий MVP использует Jaccard (cheap) + LLM judge (semantic). Embedding pre-filter может быть быстрее Jaccard и точнее, но добавляет dependency на OpenAI/Anthropic embedding API. Откладывается на v0.2.0.
>
> Связанные UC, AC и User Stories отсутствуют (deferred).

## FR-11: Auto-apply без human review — OUT OF SCOPE

**Связанные AC:** [AC-11 stub](ACCEPTANCE_CRITERIA.md#out-of-scope-fr-11-design-choice-never) (FR помечен OUT OF SCOPE)

> OUT OF SCOPE — system never auto-merges skills без explicit `--execute` flag от user. Detection — automatic, execution — manual. Это design choice ради safety, не technical limitation.
>
> Связанные UC, AC отсутствуют (по definition not applicable).
