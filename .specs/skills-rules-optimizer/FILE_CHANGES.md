# File Changes

Список файлов, которые будут добавлены/изменены/переименованы при реализации `skills-rules-optimizer`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

## Skill source rename

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/rules-optimizer/` | rename | → `.claude/skills/skills-rules-optimizer/` (atomic git mv); [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |

## Skill scripts (extend / create)

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/skills-rules-optimizer/SKILL.md` | edit | Updated mission + workflow audit→detect→merge→ratchet→apply; envelope handling steps |
| `.claude/skills/skills-rules-optimizer/scripts/shared.ts` | edit | Add `Asset` interface, `SkillAuditEntry`, `OverlapPair`, `parseFrontmatterFlexible()`; [FR-8](FR.md#fr-8-unified-scoring-engine-для-rules--skills) |
| `.claude/skills/skills-rules-optimizer/scripts/audit-rules.ts` | rename | Extracted from current audit.ts (verbatim logic); [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |
| `.claude/skills/skills-rules-optimizer/scripts/audit.ts` | edit | Convert to dispatcher (route by `--dir` to rules or skills pipeline); [FR-1](FR.md#fr-1-audit-skills-directory), [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |
| `.claude/skills/skills-rules-optimizer/scripts/audit-skills.ts` | create | NEW: SKILL.md scanning, frontmatter validation, tools coverage; [FR-1](FR.md#fr-1-audit-skills-directory), [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec), [FR-3](FR.md#fr-3-allowed-tools-coverage-check) |
| `.claude/skills/skills-rules-optimizer/scripts/detect-overlap.ts` | create | NEW: Triple-axis Jaccard pairwise; [FR-4](FR.md#fr-4-triple-axis-overlap-detection) |
| `.claude/skills/skills-rules-optimizer/scripts/merge-skills.ts` | create | NEW: orchestrate sub-agent через envelope pattern; [FR-5](FR.md#fr-5-llm-merge-synthesis-через-sub-agent) |
| `.claude/skills/skills-rules-optimizer/scripts/verify-merge.ts` | create | NEW: ratchet scorer envelope; [FR-6](FR.md#fr-6-ratchet-scorer-regression-prevention) |
| `.claude/skills/skills-rules-optimizer/scripts/check-antipatterns.ts` | edit | Extend с skill-specific antipatterns (transitive references, oversize, no TOC); [FR-1](FR.md#fr-1-audit-skills-directory) |
| `.claude/skills/skills-rules-optimizer/scripts/report.ts` | edit | Extended output to include skill findings; [FR-1](FR.md#fr-1-audit-skills-directory), [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |

## Skill references (extend / create)

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/skills-rules-optimizer/references/path-inference-table.md` | preserve | existing rules-side reference (no change) |
| `.claude/skills/skills-rules-optimizer/references/known-antipatterns.md` | edit | Add skill antipatterns: transitive references, oversize SKILL.md, missing TOC |
| `.claude/skills/skills-rules-optimizer/references/skill-overlap-detection.md` | create | NEW: Triple-axis algo + Jaccard thresholds + calibration notes; [FR-4](FR.md#fr-4-triple-axis-overlap-detection) |
| `.claude/skills/skills-rules-optimizer/references/merge-prompt-template.md` | create | NEW: MERGE_PROMPT verbatim из jkitchin/skillz + attribution; [FR-5](FR.md#fr-5-llm-merge-synthesis-через-sub-agent) |
| `.claude/skills/skills-rules-optimizer/references/ratchet-scoring.md` | create | NEW: SCORER_PROMPT + criteria; [FR-6](FR.md#fr-6-ratchet-scorer-regression-prevention) |

## Manifest + wiring

| Path | Action | Reason |
|------|--------|--------|
| `extensions/suggest-rules/extension.json` | edit | `skills.rules-optimizer` → `skills.skills-rules-optimizer` (path + name); `skillFiles.skills-rules-optimizer` (расширенный файл-список); bump version 1.9.0 → 1.10.0; [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |
| `.claude/commands/suggest-rules.md` | edit | Phase 6.2: `audit.ts --dir .claude/rules` (existing) + `audit.ts --dir .claude/skills` (NEW); aggregate report includes skill findings; [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |
| `CLAUDE.md` | edit | Replace `rules-optimizer` mentions с `skills-rules-optimizer` (если есть); per `claude-md-glossary` rule |

## Test fixtures

| Path | Action | Reason |
|------|--------|--------|
| `tests/fixtures/skills-rules-optimizer/valid-skill/SKILL.md` | create | Positive case (frontmatter ОК, body ОК); [FR-1](FR.md#fr-1-audit-skills-directory) |
| `tests/fixtures/skills-rules-optimizer/missing-allowed-tools/SKILL.md` | create | FR-3 violation (body uses `Skill()`, frontmatter doesn't declare); [FR-3](FR.md#fr-3-allowed-tools-coverage-check) |
| `tests/fixtures/skills-rules-optimizer/oversize-skill/SKILL.md` | create | FR-2 oversize (>500 lines lorem padding); [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec) |
| `tests/fixtures/skills-rules-optimizer/transitive-references/SKILL.md` + `references/A.md` + `references/B.md` | create | Anthropic anti-pattern (depth >1 reference chain); [FR-1](FR.md#fr-1-audit-skills-directory) |
| `tests/fixtures/skills-rules-optimizer/claude-in-name/SKILL.md` | create | FR-2 forbidden token violation (`name: "Claude Helper"`); [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec) |
| `tests/fixtures/skills-rules-optimizer/overlap-pair/a/SKILL.md` | create | Overlap fixture A (trigger phrases overlap с B); [FR-4](FR.md#fr-4-triple-axis-overlap-detection) |
| `tests/fixtures/skills-rules-optimizer/overlap-pair/b/SKILL.md` | create | Overlap fixture B (паttern Jaccard >= 0.45 trigger axis); [FR-4](FR.md#fr-4-triple-axis-overlap-detection) |

## Tests (e2e)

| Path | Action | Reason |
|------|--------|--------|
| `tests/e2e/skills-rules-optimizer-audit.test.ts` | create | Audit-skills + frontmatter + tools coverage tests; [FR-1](FR.md#fr-1-audit-skills-directory), [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec), [FR-3](FR.md#fr-3-allowed-tools-coverage-check) |
| `tests/e2e/skills-rules-optimizer-overlap.test.ts` | create | Triple-axis Jaccard tests; [FR-4](FR.md#fr-4-triple-axis-overlap-detection) |
| `tests/e2e/skills-rules-optimizer-merge.test.ts` | create | Envelope output structure + integration (mock Agent response); [FR-5](FR.md#fr-5-llm-merge-synthesis-через-sub-agent), [FR-6](FR.md#fr-6-ratchet-scorer-regression-prevention) |
| `tests/e2e/skills-rules-optimizer-rules-compat.test.ts` | create | FR-9 backward compat (output JSON byte-identical to baseline); [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) |
