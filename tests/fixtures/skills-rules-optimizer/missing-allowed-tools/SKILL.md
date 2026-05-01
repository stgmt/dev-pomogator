---
name: missing-tools-fixture
description: This skill body uses Bash and Skill tools but frontmatter declares only Read, Write. FR-3 violation. Triggers on "test missing tools".
allowed-tools: Read, Write
---

# Missing Allowed-Tools (Fixture: FR-3 violation)

## Mission

Test fixture для FR-3 (allowed-tools coverage check). Body invokes `Bash` и `Skill("research-workflow")` but frontmatter `allowed-tools` declares only `Read, Write` — missing `Bash` и `Skill`.

## Steps

1. Read source file via Read tool
2. Run Bash command: `npx tsx some-script.ts`
3. Invoke Skill("research-workflow") for additional analysis
4. Write final output

## Expected detection

Audit-skills.ts должен emit error finding:
```
{ code: "ALLOWED_TOOLS_MISSING", path: "<this-fixture>/SKILL.md", missing: ["Bash", "Skill"] }
```
