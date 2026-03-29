# Non-Functional Requirements (NFR)

## Performance

- SKILL.md body SHALL be 1,500-2,000 words (Anthropic recommendation for fast loading)
- Domain code scan SHALL handle 50+ .feature files without timeout

## Security

- allowed-tools SHALL use minimal permissions (Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash)

## Reliability

- Skill SHALL NOT overwrite existing files without AskUserQuestion confirmation
- Skill SHALL gracefully handle missing helpers.ts or empty tests/ directory

## Usability

- Compliance checklist SHALL be markdown table: Rule | PASS/FAIL | Details
- Description SHALL contain specific trigger phrases for auto-loading
- Стиль body: императив ("Scan for domain codes"), не "You should..."
