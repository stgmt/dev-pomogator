# SCORER_PROMPT Template

Used by `verify-merge.ts` (FR-6 ratchet). Independent scorer sub-agent
evaluates merged SKILL.md против originals. Pattern derived from
`alchaincyf/darwin-skill` (2047★) — independent evaluator + git revert
если regression.

## Criteria (4 axes, equal-weighted)

1. **Frontmatter validity** — name (≤64, lowercase+hyphens, no claude/anthropic),
   description (≤1024 chars, third-person), allowed-tools (non-empty list).
2. **Allowed-tools coverage** — every tool invoked in body также declared in
   frontmatter. Detect direct calls (`Skill(`, `Agent(`) and code-fenced tool
   words (`Bash`, `Edit`, etc.).
3. **Mission preservation** — does merged Mission cover responsibilities
   of BOTH originals? Or did it lose one of them?
4. **Trigger phrase preservation** — sufficient subset of original triggers
   retained (≥80% union by token count).

Each criterion scored 0.0–1.0. Total = mean × 1.0.

## Template

Substitution placeholders:
- `{merged}` — full merged SKILL.md content
- `{origA}` — original SKILL.md A content
- `{origB}` — original SKILL.md B content
- `{nameA}`, `{nameB}` — original skill names

```
You are an expert evaluator of AI agent skill consolidations. You are given a
merged skill и its two original sources. Your task: detect regression.

# Merged skill (candidate)

{merged}

---

# Original A: {nameA}

{origA}

---

# Original B: {nameB}

{origB}

---

# Evaluation criteria (score each 0.0–1.0)

1. **frontmatter_validity**:
   - name ≤64 chars, lowercase + hyphens, no "anthropic"/"claude" tokens?
   - description ≤1024 chars, third-person ("Processes X..." not "I help...")?
   - allowed-tools non-empty list?
   Score: 1.0 if all pass; 0.0 if any critical violation.

2. **allowed_tools_coverage**:
   - Walk merged body, find all tool invocations (Skill/Agent direct calls;
     Bash/Edit/Write/Read inside backticks).
   - Compare с frontmatter `allowed-tools` list.
   - Score: 1.0 if all used tools declared; 0.0 if any tool used but not declared.

3. **mission_preservation**:
   - Original A's mission покрыт в merged? (1.0 = fully | 0.5 = partial | 0.0 = lost)
   - Original B's mission покрыт в merged? (same scale)
   - Score: average of two.

4. **trigger_phrase_preservation**:
   - Extract trigger phrases (quoted strings) from each original's description.
   - Count how many приblike в merged description.
   - Score: ratio (preserved / total_original_unique). ≥0.8 = 1.0; 0.5–0.8 = 0.5;
     <0.5 = 0.0.

# Decision

- score_merged = mean of 4 criteria
- score_originals = 1.0 (baseline)
- regression = (score_merged < 0.9) — i.e. ≥10% drop = revert
- shouldRevert = regression AND no force flag

# Output Format

Output ONLY valid JSON, no prose:

{
  "regression": <bool>,
  "score_merged": <float>,
  "score_originals": 1.0,
  "criteria": {
    "frontmatter_validity": <float>,
    "allowed_tools_coverage": <float>,
    "mission_preservation": <float>,
    "trigger_phrase_preservation": <float>
  },
  "reasoning": "<one paragraph explaining critical issues, если есть>",
  "shouldRevert": <bool>
}
```

## Tolerance

10% drop tolerated (`score_merged < 0.9` triggers regression). Rationale:
unavoidable consolidation losses (e.g. merged description shorter than two
originals combined) shouldn't cause false-positive reverts. Sharper threshold
0.95 considered но rejected — too brittle для real merges.

## Force override

User can pass `--force` to `verify-merge.ts` чтобы apply merge несмотря на
regression. Only use after manual review of scorer reasoning. Default behaviour
preserves originals + deletes draft.
