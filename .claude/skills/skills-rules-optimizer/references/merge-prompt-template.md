# MERGE_PROMPT Template

Used by `merge-skills.ts` (FR-5). Adapted from `jkitchin/skillz/cli/commands/merge.py`
(MIT-licensed, Berkeley CASCADE paper inspired). Original
attribution: https://github.com/jkitchin/skillz/blob/main/cli/commands/merge.py

## Template

Substitution placeholders:
- `{name1}` — name of first skill (kebab-case)
- `{name2}` — name of second skill
- `{content1}` — full SKILL.md content of first skill (frontmatter + body)
- `{content2}` — full SKILL.md content of second skill
- `{mergedName}` — desired name for merged skill

```
You are an expert at consolidating AI agent skill libraries. You are given two
skills that overlap and should be merged into a single, comprehensive skill.

# Skill 1: {name1}

{content1}

---

# Skill 2: {name2}

{content2}

---

# Task

Merge these two skills into a single SKILL.md named "{mergedName}".

Requirements:
1. **Combine the best elements of both skills** — keep all unique capabilities,
   workflows, examples, и references.
2. **Eliminate redundancy** — duplicated steps / sections collapse into one
   authoritative version.
3. **Preserve all unique guidance** from both originals — do NOT lose constraints,
   trade-offs, anti-patterns documented in either skill.
4. **Valid YAML frontmatter** with these fields:
   - `name: {mergedName}` (lowercase + hyphens, ≤64 chars, no "claude"/"anthropic")
   - `description:` ≤1024 chars, third-person form ("Processes X..." not "I help with X"),
     включает trigger phrases as quoted strings (union of triggers from both originals)
   - `allowed-tools:` complete list — UNION of tools used by either original
     (Read, Write, Edit, Bash, Skill, Agent, AskUserQuestion, WebFetch, WebSearch, mcp__*)
5. **Body structure** (markdown):
   - `# {Title}` heading
   - `## Mission` — concise statement combining both skills' purposes
   - `## When triggered` (optional)
   - `## Steps` — merged workflow, deduplicated
   - `## Output` — what the skill produces
6. **Anthropic best-practices**:
   - Body ≤500 lines (split heavy content to references/<topic>.md, link via one-level-deep)
   - TOC for body >100 lines
   - No "anthropic" or "claude" tokens в name field

# Output Format

Output ONLY the complete merged SKILL.md content (frontmatter + body), starting
with `---` line and ending with the last line of body. No prose before or after.
No code fence — just raw markdown.
```

## Notes

- The prompt is constructed by `merge-skills.ts` substituting placeholders.
- Sub-agent (general-purpose) runs the merge via Agent tool invocation в main turn.
- Output written к `<merged-name>/SKILL.md.draft` for ratchet validation
  (verify-merge.ts) before final apply.
- License: MIT (jkitchin/skillz). Modifications: extended to enforce Anthropic
  spec compliance (forbidden tokens, line cap, allowed-tools union).
