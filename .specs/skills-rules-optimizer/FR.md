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

## FR-12: Shipped dependency-free checker and shared gates

System SHALL ship `tools/skill-health/check.mjs` as the sole canonical skill-health executable. It SHALL use Node built-in modules only, SHALL run without `tsx`, `yaml`, or package resolution, and source CI, the release gate, and installed-plugin dependency-absent verification SHALL invoke that exact shipped executable.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-4](USE_CASES.md#uc-4-bulk-pre-commit-audit-gate)

## FR-13: Strict frontmatter parser and metadata contract

System SHALL parse a SKILL.md frontmatter block without collapsing malformed or unterminated YAML into empty metadata. It SHALL emit structural findings for malformed YAML/frontmatter and validate required non-empty `name`, `description`, and `allowed-tools` values before evaluating downstream checks.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path)

## FR-14: Active tool permission coverage with false-positive pins

System SHALL compare only unambiguous active `Skill(...)`, `Agent(...)`, and `mcp__server__tool(...)` invocations with `allowed-tools`, preserving the exact MCP tool identity in every finding. It SHALL not report `ALLOWED_TOOLS_MISSING` for negated prose such as `never raw Write`, bare tool-name prose, or non-executing generic examples.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path)

## FR-15: Local reference integrity and root containment

System SHALL validate each statically resolvable local Markdown reference relative to the referring SKILL.md and SHALL emit a deterministic finding when the target is missing or resolves outside the plugin root. External URLs, templates, and generic examples that cannot be statically resolved SHALL not be treated as local references.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
**Use Case:** [UC-1](USE_CASES.md#uc-1-audit-skills-repo-happy-path)

## FR-16: Deterministic report and strict modes

System SHALL provide deterministic text and JSON reports. `--report` SHALL emit findings without converting them into a failing exit status, while `--strict` SHALL fail only for unbaselined error findings; the same unchanged input SHALL produce byte-identical ordered output in either format.

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
**Use Case:** [UC-4](USE_CASES.md#uc-4-bulk-pre-commit-audit-gate)

## FR-17: Exact fingerprint baseline

System SHALL baseline a finding only when its relative path, finding code, and SHA-256 content fingerprint exactly match one explicit baseline entry. It SHALL reject wildcard, prefix, directory-wide, and regular-expression exemptions; a changed content fingerprint SHALL make the finding blocking again.

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
**Use Case:** [UC-4](USE_CASES.md#uc-4-bulk-pre-commit-audit-gate)

## FR-18: Explicit mirror policy

System SHALL validate a declared mirror contract whose only supported modes are `exact`, `adapted`, `canonical-only`, and `legacy`. `exact` SHALL compare normalized content, `adapted` SHALL permit only declared transformations, and the other modes SHALL make their non-mirror expectation explicit rather than silently ignoring drift.

**Связанные AC:** [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18)
**Use Case:** [UC-6](USE_CASES.md#uc-6-edge-suggest-rules-backwards-compat)

## FR-19: No prompt lifecycle hook rollout

System SHALL expose skill-health checking through the executable and explicit CI/release verification only. This feature SHALL NOT add a `SessionStart` or `UserPromptSubmit` hook invocation, registration, or prompt-time scan for the checker.

**Связанные AC:** [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19)
**Use Case:** [UC-4](USE_CASES.md#uc-4-bulk-pre-commit-audit-gate)
