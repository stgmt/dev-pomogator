# skills-rules-optimizer Schema

Multi-layer pipeline: 5 stages, каждая со своим input/output contract. Sub-agent invocations через JSON envelopes.

## Visual Pipeline

```
                    ┌─────────────────────────────────────────────┐
                    │  STAGE 1: AUDIT (audit.ts dispatcher)        │
                    └───────────────┬─────────────────────────────┘
                                    │ --dir <path>
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
         ┌────────────────┐               ┌──────────────────┐
         │ audit-rules.ts │               │ audit-skills.ts  │
         │ (FR-9 verbatim)│               │ (FR-1/2/3)       │
         └────────┬───────┘               └────────┬─────────┘
                  │ AuditResult JSON              │ SkillAuditResult JSON
                  ▼                                ▼
                    ┌─────────────────────────────────────────────┐
                    │  STAGE 2: DETECT (detect-overlap.ts)         │  ← FR-4
                    │  Triple-axis Jaccard pairwise N×N           │
                    │    • triggers (regex from description)      │
                    │    • section headings (## .+)               │
                    │    • functional keywords (Mission line)     │
                    └───────────────┬─────────────────────────────┘
                                    │ OverlapPair[] (similarity ≥ 0.3)
                                    ▼ user reviews recommendations
                    ┌─────────────────────────────────────────────┐
                    │  STAGE 3: MERGE (merge-skills.ts)            │  ← FR-5
                    │  Loads MERGE_PROMPT, formats envelope       │
                    └───────────────┬─────────────────────────────┘
                                    │ AgentEnvelope JSON
                                    ▼ main turn ⚡ Agent(general-purpose)
                                    │ ⚡ writes draft to disk
                    ┌─────────────────────────────────────────────┐
                    │  STAGE 4: RATCHET (verify-merge.ts)          │  ← FR-6
                    │  Loads SCORER_PROMPT, formats envelope      │
                    └───────────────┬─────────────────────────────┘
                                    │ AgentEnvelope JSON (scorer)
                                    ▼ main turn ⚡ Agent(general-purpose)
                                    │ ⚡ returns ScorerResult
                    ┌─────────────────────────────────────────────┐
                    │  STAGE 5: APPLY (decision logic)             │  ← FR-7
                    │  IF regression → delete draft + report      │
                    │  IF pass → rename draft → final + cleanup    │
                    │            suggestion (manual rm для orig)  │
                    └─────────────────────────────────────────────┘
```

## JSON Shapes

### Stage 1 output: SkillAuditResult

```json
{
  "totalSkills": 23,
  "withErrors": [
    {
      "path": ".claude/skills/foo/SKILL.md",
      "code": "FRONTMATTER_NAME_FORBIDDEN_TOKEN",
      "value": "Claude Helper"
    }
  ],
  "withWarnings": [
    {
      "path": ".claude/skills/bar/SKILL.md",
      "code": "OVERSIZE",
      "lines": 612,
      "suggestion": "split to references/"
    }
  ],
  "overlaps": [
    {
      "a": "foo",
      "b": "bar",
      "axis": "trigger",
      "similarity": 0.45,
      "recommendation": "merge"
    }
  ],
  "details": [
    {
      "path": ".claude/skills/foo/SKILL.md",
      "tokens": 1850,
      "lines": 245,
      "frontmatter": {
        "name": "foo",
        "description": "...",
        "allowed_tools": ["Read", "Write"]
      }
    }
  ]
}
```

### Stage 2 output: OverlapPair[]

```json
{
  "overlaps": [
    {
      "a": "skill-a",
      "b": "skill-b",
      "axis": "trigger" | "sections" | "functional",
      "similarity": 0.45,
      "recommendation": "merge" | "cross-reference" | "reorganize" | "keep separate"
    }
  ]
}
```

### Stage 3+4 envelope: AgentEnvelope

```json
{
  "action": "invoke-agent",
  "subagent_type": "general-purpose",
  "prompt": "...full MERGE_PROMPT or SCORER_PROMPT с substituted placeholders...",
  "continuation": "verify-merge.ts --merged <path> --originals <a> <b>"
}
```

### Stage 4 result: ScorerResult

```json
{
  "regression": false,
  "score_merged": 0.92,
  "score_originals": 1.0,
  "reasoning": "Merged skill preserves missions of both originals; frontmatter valid; allowed-tools complete.",
  "shouldRevert": false
}
```

### Stage 5 final output

```json
{
  "merged_path": ".claude/skills/merged-ab/SKILL.md",
  "ratchet_passed": true,
  "cleanup_suggestions": [
    "rm -rf .claude/skills/skill-a",
    "rm -rf .claude/skills/skill-b"
  ]
}
```

### Asset interface (shared.ts)

```typescript
interface Asset {
  type: "rule" | "skill";
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  tokens: number;
}
```

## Validation Rules

| Stage | Rule | Source |
|-------|------|--------|
| 1 | `name` ≤64 chars, lowercase + hyphens, no "anthropic"/"claude" | FR-2, Anthropic spec |
| 1 | `description` ≤1024 chars, third-person form | FR-2, Anthropic spec |
| 1 | `allowed-tools` non-empty list | FR-2 |
| 1 | All tools used в body declared в frontmatter | FR-3 |
| 1 | SKILL.md ≤500 lines (warning) | FR-2, Anthropic 500-line cap |
| 2 | Jaccard threshold 0.3 default (configurable via `--threshold`) | FR-4 |
| 3 | Path validation: reject `..` traversal in `--merged-name` | NFR-Security |
| 3 | Merged-name kebab-case, no forbidden tokens (FR-2 reused) | FR-5 |
| 4 | Scorer evaluates 4 criteria: frontmatter validity, tools coverage, mission preservation, trigger preservation | FR-6 |
| 4 | Regression: `score_merged < 0.9 × score_originals` (10% tolerance) | FR-6 |
| 5 | Originals NEVER auto-deleted | FR-7 |
| 5 | Atomic write: temp + move, reject if `<merged-name>/SKILL.md` exists | NFR-Reliability |
